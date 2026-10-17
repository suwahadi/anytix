-- A leaked e-ticket link can be neutralised: unused QR tokens of a paid order are replaced, used ones stay for the audit trail.
create or replace function public.reissue_ticket_tokens(p_order bigint) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_status text;
  v_count  int;
begin
  select status into v_status from public.orders where id = p_order for update;
  if v_status is distinct from 'paid' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE';
  end if;
  update public.tickets
     set token = translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')
   where order_id = p_order and status = 'valid' and checked_in_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.reissue_ticket_tokens(bigint) from public, anon, authenticated;
