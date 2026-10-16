-- Hosted postgres logins must explicitly be able to enter the restricted runtime role.
-- Do not grant membership to browser/API roles.
do $$ begin
 if exists(select 1 from pg_roles where rolname='postgres') then
  grant mhistree_runtime to postgres with inherit false, set true;
 end if;
end $$;
