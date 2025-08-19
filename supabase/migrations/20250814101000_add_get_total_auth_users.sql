-- RPC: Total registered auth users (security definer)
create or replace function public.get_total_auth_users()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint from auth.users;
$$;

-- Note: runs as definer to allow counting across all users.

