-- A settled payment is final: later expire or cancel notifications must not overwrite its status.
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
  update public.payments set status = p_status, raw_last = p_payload, updated_at = now()
   where id = p.id and status <> 'settlement';

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

revoke execute on function public.apply_payment_status(text, text, jsonb) from public, anon, authenticated;
