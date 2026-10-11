alter table mhistree.connections drop constraint connections_status_check;
alter table mhistree.connections add constraint connections_status_check check(status in ('pending','active','revoked'));
alter table mhistree.organizations add column display_name text;
