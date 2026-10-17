-- Row lock order extends 0002: ticket_inventory, then holds, then orders, then vouchers.

create or replace function public.issue_tickets(p_order bigint) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_seq int := 0;
  r record;
begin
  if exists (select 1 from public.tickets where order_id = p_order) then return 0; end if;
  for r in
    select c.id as category_id, hi.qty * c.admits_per_unit as n
      from public.orders o
      join public.hold_items hi on hi.hold_id = o.hold_id
      join public.ticket_inventory i on i.id = hi.inventory_id
      join public.ticket_categories c on c.id = i.ticket_category_id
     where o.id = p_order
     order by c.position, c.id
  loop
    for k in 1..r.n loop
      v_seq := v_seq + 1;
      insert into public.tickets (order_id, ticket_category_id, seq, token)
      values (p_order, r.category_id, v_seq,
              translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'));
    end loop;
  end loop;
  return v_seq;
end $$;

create or replace function public.sell_hold_items(p_hold uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  begin
    for r in
      select id, inventory_id, qty, counted from public.hold_items
       where hold_id = p_hold order by inventory_id
    loop
      if r.counted then
        update public.ticket_inventory set held = held - r.qty, sold = sold + r.qty where id = r.inventory_id;
        update public.hold_items set counted = false where id = r.id;
      else
        update public.ticket_inventory set sold = sold + r.qty
         where id = r.inventory_id and capacity - sold - held >= r.qty;
        if not found then raise exception using errcode = 'AX001'; end if;
      end if;
    end loop;
  exception when sqlstate 'AX001' then
    return false;
  end;
  return true;
end $$;

create or replace function public.release_order_voucher(p_order bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_voucher bigint;
begin
  update public.orders set voucher_counted = false, updated_at = now()
   where id = p_order and voucher_counted
  returning voucher_id into v_voucher;
  if v_voucher is not null then
    update public.vouchers set held = held - 1 where id = v_voucher;
  end if;
end $$;

create or replace function public.mark_order_paid(p_order bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  update public.holds set status = 'paid' where id = o.hold_id;
  update public.orders set status = 'paid', paid_at = now(), voucher_counted = false, updated_at = now()
   where id = p_order;
  if o.voucher_id is not null then
    update public.vouchers
       set used = used + 1, held = held - case when o.voucher_counted then 1 else 0 end
     where id = o.voucher_id;
  end if;
  perform public.issue_tickets(p_order);
  perform public.enqueue_job('email', jsonb_build_object('type', 'paid', 'order_id', p_order),
                             'email:paid:' || p_order);
end $$;

create or replace function public.lock_order_rows(p_order bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_ids bigint[];
begin
  select coalesce(array_agg(hi.inventory_id), '{}') into v_ids
    from public.orders o join public.hold_items hi on hi.hold_id = o.hold_id
   where o.id = p_order;
  perform public.lock_inventory(v_ids);
  perform 1 from public.holds where id = (select hold_id from public.orders where id = p_order) for update;
  perform 1 from public.orders where id = p_order for update;
end $$;

create or replace function public.apply_payment_status(
  p_midtrans_order_id text, p_status text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  p        public.payments;
  o        public.orders;
  h        public.holds;
  v_after  text;
begin
  insert into public.payment_events (midtrans_order_id, transaction_status, transaction_id, payload)
  values (p_midtrans_order_id, p_status, p_payload->>'transaction_id', coalesce(p_payload, '{}'::jsonb))
  on conflict do nothing;

  select * into p from public.payments where midtrans_order_id = p_midtrans_order_id;
  if not found then return jsonb_build_object('found', false); end if;

  perform public.lock_order_rows(p.order_id);
  select * into o from public.orders where id = p.order_id;
  select * into h from public.holds where id = o.hold_id;
  update public.payments set status = p_status, raw_last = p_payload, updated_at = now() where id = p.id;

  if p_status = 'settlement' and o.status in ('awaiting_payment', 'expired', 'cancelled') then
    if public.sell_hold_items(h.id) then
      perform public.mark_order_paid(o.id);
    else
      perform public.release_hold_internal(h.id, case when h.status = 'pending_payment' then 'expired' else h.status end);
      perform public.release_order_voucher(o.id);
      update public.orders set status = 'late_paid_review', updated_at = now() where id = o.id;
      perform public.enqueue_job('email', jsonb_build_object('type', 'late_paid', 'order_id', o.id),
                                 'email:late_paid:' || o.id);
      perform public.enqueue_job('admin-alert', jsonb_build_object('kind', 'late_paid', 'order_id', o.id),
                                 'admin-alert:late_paid:' || o.id);
    end if;
  elsif p_status in ('expire', 'deny', 'failure', 'cancel') and o.status = 'awaiting_payment' then
    if h.status = 'pending_payment' then
      perform public.release_hold_internal(h.id, 'released');
    end if;
    perform public.release_order_voucher(o.id);
    update public.orders
       set status = case when p_status = 'cancel' then 'cancelled' else 'expired' end, updated_at = now()
     where id = o.id;
    if p_status <> 'cancel' then
      perform public.enqueue_job('email', jsonb_build_object('type', 'expired', 'order_id', o.id),
                                 'email:expired:' || o.id);
    end if;
  end if;

  select status into v_after from public.orders where id = o.id;
  return jsonb_build_object('found', true, 'order_id', o.id, 'public_uuid', o.public_uuid,
                            'status', v_after, 'changed', v_after is distinct from o.status);
end $$;

create or replace function public.issue_late_order(p_order bigint) returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare o public.orders;
begin
  perform public.lock_order_rows(p_order);
  select * into o from public.orders where id = p_order;
  if not found or o.status <> 'late_paid_review' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE';
  end if;
  if not public.sell_hold_items(o.hold_id) then
    raise exception using errcode = 'P0001', message = 'SOLD_OUT';
  end if;
  perform public.mark_order_paid(p_order);
  select * into o from public.orders where id = p_order;
  return o;
end $$;

create or replace function public.sweep_expired_holds() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids   uuid[];
  v_inv   bigint[];
  v_order bigint;
  v_count int := 0;
  r       record;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from (select id from public.holds
           where status in ('held', 'pending_payment') and expires_at < now()
           order by expires_at limit 1000) s;
  if cardinality(v_ids) = 0 then return 0; end if;

  select coalesce(array_agg(distinct inventory_id), '{}') into v_inv
    from public.hold_items where hold_id = any(v_ids) and counted;
  perform public.lock_inventory(v_inv);

  for r in
    select id, status from public.holds
     where id = any(v_ids) and status in ('held', 'pending_payment') and expires_at < now()
       for update skip locked
  loop
    perform public.release_hold_internal(r.id, 'expired');
    if r.status = 'pending_payment' then
      select id into v_order from public.orders where hold_id = r.id;
      if v_order is not null then
        perform public.release_order_voucher(v_order);
        perform public.enqueue_job('payment-check', jsonb_build_object('order_id', v_order),
                                   'payment-check:' || v_order);
      end if;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.reconcile_inventory(p_fix boolean default false)
returns table (inventory_id bigint, held_actual int, held_expected int, sold_actual int, sold_expected int)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare v_ids bigint[];
begin
  return query
    select d.id, d.held, d.he, d.sold, d.se from (
      select i.id, i.held, i.sold,
             coalesce((select sum(hi.qty) from public.hold_items hi
                        where hi.inventory_id = i.id and hi.counted), 0)::int as he,
             coalesce((select sum(hi.qty) from public.hold_items hi join public.holds h on h.id = hi.hold_id
                        where hi.inventory_id = i.id and h.status = 'paid'), 0)::int as se
        from public.ticket_inventory i) d
     where d.held <> d.he or d.sold <> d.se;

  if p_fix then
    select array_agg(i.id) into v_ids from public.ticket_inventory i
     where i.held <> coalesce((select sum(hi.qty) from public.hold_items hi
                                where hi.inventory_id = i.id and hi.counted), 0)
        or i.sold <> coalesce((select sum(hi.qty) from public.hold_items hi join public.holds h on h.id = hi.hold_id
                                where hi.inventory_id = i.id and h.status = 'paid'), 0);
    if v_ids is not null then
      perform public.lock_inventory(v_ids);
      update public.ticket_inventory i
         set held = coalesce((select sum(hi.qty) from public.hold_items hi
                               where hi.inventory_id = i.id and hi.counted), 0),
             sold = coalesce((select sum(hi.qty) from public.hold_items hi join public.holds h on h.id = hi.hold_id
                               where hi.inventory_id = i.id and h.status = 'paid'), 0)
       where i.id = any(v_ids);
    end if;
  end if;
end $$;

revoke execute on function public.issue_tickets(bigint) from public, anon, authenticated;
revoke execute on function public.sell_hold_items(uuid) from public, anon, authenticated;
revoke execute on function public.release_order_voucher(bigint) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(bigint) from public, anon, authenticated;
revoke execute on function public.lock_order_rows(bigint) from public, anon, authenticated;
revoke execute on function public.apply_payment_status(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.issue_late_order(bigint) from public, anon, authenticated;
revoke execute on function public.sweep_expired_holds() from public, anon, authenticated;
revoke execute on function public.reconcile_inventory(boolean) from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('sweep-expired-holds', '15 seconds', 'select public.sweep_expired_holds()');
