-- RPC: Top players leaderboard (security definer to bypass RLS on profiles)
create or replace function public.get_top_players(limit_count int default 10)
returns table (
  user_id uuid,
  username text,
  games_won integer,
  games_lost integer,
  earnings numeric
)
language sql
security definer
set search_path to public
as $$
  select p.id as user_id,
         coalesce(p.username, 'Player') as username,
         p.games_won,
         p.games_lost,
         p.earnings
  from public.profiles p
  order by p.games_won desc, p.earnings desc, p.created_at asc
  limit limit_count;
$$;

-- RPC: Earnings summary day/week/month
create or replace function public.get_earnings_summary()
returns table (
  period text,
  total numeric
)
language sql
security definer
set search_path to public
as $$
  with d as (
    select 'day'::text as period, coalesce(sum(amount),0) as total
    from public.company_earnings
    where created_at >= now() - interval '1 day'
  ),
  w as (
    select 'week'::text as period, coalesce(sum(amount),0) as total
    from public.company_earnings
    where created_at >= now() - interval '7 day'
  ),
  m as (
    select 'month'::text as period, coalesce(sum(amount),0) as total
    from public.company_earnings
    where created_at >= now() - interval '30 day'
  )
  select * from d
  union all select * from w
  union all select * from m;
$$;