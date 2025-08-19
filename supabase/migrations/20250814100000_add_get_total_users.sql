-- RPC: Total registered users (security definer; allows any authenticated to read)
create or replace function public.get_total_users()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.profiles;
$$;

-- RLS note: function runs as definer, bypassing profiles RLS for aggregate count only.

