-- PRD §14: identity numbers are kept only until 60 days after the event ends; the identity type stays for the record.
create or replace function public.purge_identity_numbers() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_count int;
begin
  update public.order_answers a
     set value_encrypted = null
    from public.orders o
    join public.events e on e.id = o.event_id
   where a.order_id = o.id
     and a.value_encrypted is not null
     and e.ends_at < now() - interval '60 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_identity_numbers() from public, anon, authenticated;

select cron.schedule('purge-identity-numbers', '30 19 * * *', 'select public.purge_identity_numbers()');
