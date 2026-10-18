-- Official sender is the domain's no-reply address; replies go to the CS address (Reply-To), which is also the public contact.
update public.settings
   set value = jsonb_set(value, '{from}', '"AnyTix <no-reply@anytix.web.id>"'), updated_at = now()
 where key = 'smtp';

update public.settings
   set value = jsonb_set(value, '{cs_email}', '"cs@anytix.web.id"'), updated_at = now()
 where key = 'site' and coalesce(value->>'cs_email', '') = '';
