alter table public.checkin_events add column event_id bigint references public.events (id);
create index checkin_events_event_idx on public.checkin_events (event_id, created_at desc);

-- One round trip per scan: the guarded update decides who wins when two gates scan the same QR at once.
create or replace function public.check_in_ticket(p_token text, p_event bigint, p_admin bigint, p_gate text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  t        record;
  v_won    public.tickets;
  v_result jsonb;
begin
  select tk.id, tk.order_id, tk.seq, tk.status, tk.checked_in_at, tk.gate, o.status as order_status, o.event_id,
         o.buyer_name, c.name as category, e.title as event_title,
         (select count(*) from public.tickets x where x.order_id = tk.order_id and x.status = 'valid') as total
    into t
    from public.tickets tk
    join public.orders o on o.id = tk.order_id
    join public.events e on e.id = o.event_id
    join public.ticket_categories c on c.id = tk.ticket_category_id
   where tk.token = p_token;

  if not found or t.order_status <> 'paid' or t.status <> 'valid' then
    v_result := jsonb_build_object('result', 'invalid');
  elsif t.event_id <> p_event then
    v_result := jsonb_build_object('result', 'wrong_event', 'event_title', t.event_title);
  else
    update public.tickets
       set checked_in_at = now(), checked_in_by = p_admin, gate = p_gate
     where id = t.id and checked_in_at is null and status = 'valid'
    returning * into v_won;
    if v_won.id is not null then
      v_result := jsonb_build_object('result', 'valid', 'ticket_id', t.id, 'order_id', t.order_id, 'seq', t.seq,
                                     'total', t.total, 'category', t.category, 'buyer_name', t.buyer_name);
    else
      select checked_in_at, gate into v_won.checked_in_at, v_won.gate from public.tickets where id = t.id;
      v_result := jsonb_build_object('result', 'used', 'ticket_id', t.id, 'checked_in_at', v_won.checked_in_at, 'gate', v_won.gate);
    end if;
  end if;

  insert into public.checkin_events (ticket_id, event_id, token, admin_id, gate, result)
  values (t.id, p_event, left(p_token, 64), p_admin, p_gate, v_result->>'result');
  return v_result;
end $$;

revoke execute on function public.check_in_ticket(text, bigint, bigint, text) from public, anon, authenticated;
