create or replace function public.enqueue_job(
  p_type text, p_payload jsonb, p_dedupe text, p_run_at timestamptz default now())
returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.jobs (type, payload, dedupe_key, run_at)
  values (p_type, p_payload, p_dedupe, p_run_at)
  on conflict (dedupe_key) do nothing
$$;

create or replace function public.generate_invoice_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(5);
  v_bits bigint := 0;
  v_code text := 'A';
begin
  for i in 0..4 loop
    v_bits := (v_bits << 8) | get_byte(v_bytes, i);
  end loop;
  for i in reverse 7..0 loop
    v_code := v_code || substr(v_alphabet, ((v_bits >> (i * 5)) & 31)::int + 1, 1);
  end loop;
  return v_code;
end $$;

create or replace function public.compute_quote(p_hold uuid, p_voucher_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_event    bigint;
  v_items    jsonb;
  v_subtotal bigint;
  v_fee      bigint := public.setting_int('service_fee');
  v          public.vouchers;
  v_base     bigint := 0;
  v_qty      int := 0;
  v_discount bigint := 0;
  v_error    text;
  v_code     text := nullif(btrim(coalesce(p_voucher_code, '')), '');
begin
  select event_id into v_event from public.holds where id = p_hold;

  select coalesce(jsonb_agg(jsonb_build_object(
           'inventory_id', hi.inventory_id, 'ticket_category_id', c.id, 'name', c.name,
           'qty', hi.qty, 'unit_price', hi.unit_price, 'line_total', hi.qty * hi.unit_price)
           order by c.position, c.id), '[]'::jsonb),
         coalesce(sum(hi.qty * hi.unit_price), 0)
    into v_items, v_subtotal
    from public.hold_items hi
    join public.ticket_inventory i on i.id = hi.inventory_id
    join public.ticket_categories c on c.id = i.ticket_category_id
   where hi.hold_id = p_hold;

  if v_code is not null then
    select * into v from public.vouchers where event_id = v_event and lower(code) = lower(v_code);
    if not found then
      v_error := 'NOT_FOUND';
    elsif not v.active then
      v_error := 'INACTIVE';
    elsif v.valid_from is not null and now() < v.valid_from then
      v_error := 'NOT_STARTED';
    elsif v.valid_to is not null and now() > v.valid_to then
      v_error := 'ENDED';
    else
      select coalesce(sum(hi.qty * hi.unit_price), 0), coalesce(sum(hi.qty), 0)
        into v_base, v_qty
        from public.hold_items hi
        join public.ticket_inventory i on i.id = hi.inventory_id
       where hi.hold_id = p_hold
         and (v.ticket_category_ids is null or cardinality(v.ticket_category_ids) = 0
              or i.ticket_category_id = any(v.ticket_category_ids));
      if v_qty = 0 then
        v_error := 'NOT_APPLICABLE';
      elsif v_qty < v.min_qty then
        v_error := 'MIN_QTY';
      elsif v_base < v.min_subtotal then
        v_error := 'MIN_SUBTOTAL';
      elsif v.max_uses is not null and v.used + v.held >= v.max_uses then
        v_error := 'EXHAUSTED';
      else
        if v.type = 'percent' then
          v_discount := (v_base * v.value) / 100;
          if v.max_discount is not null then v_discount := least(v_discount, v.max_discount); end if;
        else
          v_discount := v.value;
        end if;
        v_discount := greatest(0, least(v_discount, v_base, v_subtotal - 1000));
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'fee', v_fee,
    'total', v_subtotal - v_discount + v_fee,
    'voucher_id', case when v_code is not null and v_error is null then v.id end,
    'voucher_code', case when v_code is not null and v_error is null then v.code end,
    'voucher_error', v_error);
end $$;

create or replace function public.quote_hold(p_hold uuid, p_visitor uuid, p_voucher_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hold public.holds;
begin
  select * into v_hold from public.holds where id = p_hold and visitor_id = p_visitor;
  if not found then raise exception using errcode = 'P0001', message = 'HOLD_NOT_FOUND'; end if;
  if v_hold.status <> 'held' or v_hold.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'HOLD_EXPIRED';
  end if;
  return public.compute_quote(p_hold, p_voucher_code);
end $$;

create or replace function public.checkout_hold(
  p_hold uuid, p_visitor uuid, p_buyer jsonb, p_answers jsonb, p_payment_method text,
  p_voucher_code text, p_consents jsonb)
returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hold       public.holds;
  v_order      public.orders;
  v_quote      jsonb;
  v_voucher_id bigint;
  v_pay        int := public.setting_int('pay_minutes');
  v_grace      int := public.setting_int('pay_grace_minutes');
  v_code       text := nullif(btrim(coalesce(p_voucher_code, '')), '');
  v_constraint text;
  a            jsonb;
  c            jsonb;
begin
  update public.holds
     set status = 'pending_payment', expires_at = now() + make_interval(mins => v_pay + v_grace)
   where id = p_hold and visitor_id = p_visitor and status = 'held' and expires_at > now()
  returning * into v_hold;
  if not found then
    select o.* into v_order
      from public.orders o join public.holds h on h.id = o.hold_id
     where o.hold_id = p_hold and h.visitor_id = p_visitor;
    if found then return v_order; end if;
    if exists (select 1 from public.holds where id = p_hold and visitor_id = p_visitor) then
      raise exception using errcode = 'P0001', message = 'HOLD_EXPIRED';
    end if;
    raise exception using errcode = 'P0001', message = 'HOLD_NOT_FOUND';
  end if;

  if coalesce(btrim(p_buyer->>'name'), '') = '' or coalesce(btrim(p_buyer->>'email'), '') = ''
     or coalesce(btrim(p_buyer->>'phone'), '') = '' then
    raise exception using errcode = 'P0001', message = 'INVALID_BUYER';
  end if;
  if coalesce(btrim(p_payment_method), '') = '' then
    raise exception using errcode = 'P0001', message = 'INVALID_PAYMENT_METHOD';
  end if;

  v_quote := public.compute_quote(p_hold, v_code);
  if v_code is not null then
    if v_quote->>'voucher_error' = 'EXHAUSTED' then
      raise exception using errcode = 'P0001', message = 'VOUCHER_UNAVAILABLE';
    end if;
    if v_quote->>'voucher_error' is not null then
      raise exception using errcode = 'P0001', message = 'VOUCHER_INVALID:' || (v_quote->>'voucher_error');
    end if;
    v_voucher_id := (v_quote->>'voucher_id')::bigint;
    update public.vouchers set held = held + 1
     where id = v_voucher_id and active and (max_uses is null or used + held < max_uses);
    if not found then raise exception using errcode = 'P0001', message = 'VOUCHER_UNAVAILABLE'; end if;
  end if;

  loop
    begin
      insert into public.orders (invoice_code, hold_id, event_id, buyer_name, buyer_email, buyer_phone,
                                 subtotal, discount_amount, fee_amount, total, voucher_id, voucher_counted,
                                 payment_method, status, pay_expires_at)
      values (public.generate_invoice_code(), p_hold, v_hold.event_id, btrim(p_buyer->>'name'),
              lower(btrim(p_buyer->>'email')), btrim(p_buyer->>'phone'),
              (v_quote->>'subtotal')::bigint, (v_quote->>'discount')::bigint, (v_quote->>'fee')::bigint,
              (v_quote->>'total')::bigint, v_voucher_id, v_voucher_id is not null,
              p_payment_method, 'awaiting_payment', now() + make_interval(mins => v_pay))
      returning * into v_order;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'orders_invoice_code_key' then raise; end if;
    end;
  end loop;

  for a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    insert into public.order_answers (order_id, form_field_id, value, value_encrypted)
    select v_order.id, f.id, nullif(a->'value', 'null'::jsonb), decode(a->>'value_encrypted', 'base64')
      from public.form_fields f
     where f.id = (a->>'form_field_id')::bigint and f.event_id = v_hold.event_id;
    if not found then raise exception using errcode = 'P0001', message = 'INVALID_ANSWERS'; end if;
  end loop;

  insert into public.payments (order_id, attempt, midtrans_order_id, payment_method, status, gross_amount, expires_at)
  values (v_order.id, 1, v_order.invoice_code || '-1', p_payment_method, 'pending', v_order.total,
          v_order.pay_expires_at);

  for c in select * from jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) loop
    insert into public.consents (order_id, policy_version, purpose, ip)
    values (v_order.id, c->>'policy_version', c->>'purpose', c->>'ip');
  end loop;

  perform public.enqueue_job('email', jsonb_build_object('type', 'awaiting_payment', 'order_id', v_order.id),
                             'email:awaiting_payment:' || v_order.id);
  return v_order;
end $$;

revoke execute on function public.enqueue_job(text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.generate_invoice_code() from public, anon, authenticated;
revoke execute on function public.compute_quote(uuid, text) from public, anon, authenticated;
revoke execute on function public.quote_hold(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.checkout_hold(uuid, uuid, jsonb, jsonb, text, text, jsonb)
  from public, anon, authenticated;
