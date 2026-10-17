-- Lock order for every function that changes ticket_inventory: lock all inventory rows first
-- (ascending id, via lock_inventory), then holds/hold_items/vouchers. reclaim_expired never waits on
-- hold_items (skip locked). Together these keep reserve, release, sweeper and webhook deadlock-free.

create or replace function public.setting_int(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::int from public.settings where key = p_key
$$;

create or replace function public.lock_inventory(p_ids bigint[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform 1 from public.ticket_inventory where id = any(p_ids) order by id for update;
end $$;

create or replace function public.reclaim_expired(p_inv bigint) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_freed int;
begin
  with exp as (
    select hi.id
      from public.hold_items hi
      join public.holds h on h.id = hi.hold_id
     where hi.inventory_id = p_inv and hi.counted
       and h.status in ('held', 'pending_payment') and h.expires_at < now()
       for update of hi skip locked
  ), upd as (
    update public.hold_items hi set counted = false
      from exp where hi.id = exp.id
    returning hi.qty
  )
  select coalesce(sum(qty), 0) into v_freed from upd;
  if v_freed > 0 then
    update public.ticket_inventory set held = held - v_freed where id = p_inv;
  end if;
  return v_freed;
end $$;

create or replace function public.release_hold_internal(p_hold uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select id, inventory_id, qty from public.hold_items
     where hold_id = p_hold and counted order by inventory_id
  loop
    update public.ticket_inventory set held = held - r.qty where id = r.inventory_id;
    update public.hold_items set counted = false where id = r.id;
  end loop;
  update public.holds set status = p_status where id = p_hold;
end $$;

create or replace function public.reserve_tickets(
  p_visitor uuid, p_event_id bigint, p_items jsonb, p_idem text)
returns public.holds
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hold     public.holds;
  v_session  bigint;
  v_new_ids  bigint[];
  v_lock_ids bigint[];
  v_old_ids  bigint[];
  v_avail    int;
  r          record;
  c          record;
begin
  select * into v_hold from public.holds where visitor_id = p_visitor and idempotency_key = p_idem;
  if found then return v_hold; end if;

  select s.id into v_session
    from public.event_sessions s join public.events e on e.id = s.event_id
   where e.id = p_event_id and e.status = 'published' and s.status = 'on_sale'
   order by s.id limit 1;
  if v_session is null then raise exception using errcode = 'P0001', message = 'NOT_ON_SALE'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_ITEMS';
  end if;
  select array_agg(distinct (x->>'inventory_id')::bigint) into v_new_ids from jsonb_array_elements(p_items) x;
  if cardinality(v_new_ids) <> jsonb_array_length(p_items)
     or exists (select 1 from jsonb_array_elements(p_items) x
                 where coalesce((x->>'qty')::int, 0) < 1)
     or (select count(*) from public.ticket_inventory i
          where i.id = any(v_new_ids) and i.session_id = v_session) <> cardinality(v_new_ids) then
    raise exception using errcode = 'P0001', message = 'INVALID_ITEMS';
  end if;

  select coalesce(array_agg(distinct hi.inventory_id), '{}') into v_old_ids
    from public.holds h join public.hold_items hi on hi.hold_id = h.id
   where h.visitor_id = p_visitor and h.event_id = p_event_id and h.status = 'held' and hi.counted;
  v_lock_ids := array(select distinct unnest(v_new_ids || v_old_ids) order by 1);
  perform public.lock_inventory(v_lock_ids);

  -- An old hold committed after the read above could touch rows outside the locked set.
  if exists (select 1 from public.holds h join public.hold_items hi on hi.hold_id = h.id
              where h.visitor_id = p_visitor and h.event_id = p_event_id and h.status = 'held'
                and hi.counted and not hi.inventory_id = any(v_lock_ids)) then
    raise exception using errcode = 'P0001', message = 'CONCURRENT';
  end if;

  perform public.release_hold_internal(h.id, 'released')
     from public.holds h
    where h.visitor_id = p_visitor and h.event_id = p_event_id and h.status = 'held';

  insert into public.holds (visitor_id, event_id, session_id, idempotency_key, status, expires_at)
  values (p_visitor, p_event_id, v_session, p_idem, 'held',
          now() + make_interval(mins => public.setting_int('hold_minutes')))
  returning * into v_hold;

  for r in
    select (x->>'inventory_id')::bigint as inv, (x->>'qty')::int as qty
      from jsonb_array_elements(p_items) x order by 1
  loop
    select cat.status, cat.sale_starts_at, cat.sale_ends_at, cat.max_per_order, cat.price into c
      from public.ticket_inventory i join public.ticket_categories cat on cat.id = i.ticket_category_id
     where i.id = r.inv;
    if c.status <> 'active' or now() not between c.sale_starts_at and c.sale_ends_at then
      raise exception using errcode = 'P0001', message = format('CATEGORY_NOT_ON_SALE:%s', r.inv);
    end if;
    if r.qty > c.max_per_order then
      raise exception using errcode = 'P0001', message = format('MAX_PER_ORDER:%s:%s', r.inv, c.max_per_order);
    end if;

    perform public.reclaim_expired(r.inv);
    update public.ticket_inventory set held = held + r.qty
     where id = r.inv and capacity - sold - held >= r.qty;
    if not found then
      select capacity - sold - held into v_avail from public.ticket_inventory where id = r.inv;
      raise exception using errcode = 'P0001', message = format('SOLD_OUT:%s:%s', r.inv, v_avail);
    end if;

    insert into public.hold_items (hold_id, inventory_id, qty, unit_price, counted)
    values (v_hold.id, r.inv, r.qty, c.price, true);
  end loop;

  return v_hold;
end $$;

create or replace function public.release_hold(p_hold uuid, p_visitor uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_ids bigint[];
begin
  select coalesce(array_agg(inventory_id), '{}') into v_ids
    from public.hold_items where hold_id = p_hold and counted;
  perform public.lock_inventory(v_ids);
  perform 1 from public.holds
   where id = p_hold and visitor_id = p_visitor and status = 'held'
     for update;
  if not found then return false; end if;
  perform public.release_hold_internal(p_hold, 'released');
  return true;
end $$;

revoke execute on function public.setting_int(text) from public, anon, authenticated;
revoke execute on function public.lock_inventory(bigint[]) from public, anon, authenticated;
revoke execute on function public.reclaim_expired(bigint) from public, anon, authenticated;
revoke execute on function public.release_hold_internal(uuid, text) from public, anon, authenticated;
revoke execute on function public.reserve_tickets(uuid, bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function public.release_hold(uuid, uuid) from public, anon, authenticated;
