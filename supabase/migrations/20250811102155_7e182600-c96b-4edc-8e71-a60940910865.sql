-- Enable required extension for gen_random_uuid
create extension if not exists pgcrypto with schema public;

-- Timestamp trigger function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  balance numeric(12,2) not null default 0,
  games_won integer not null default 0,
  games_lost integer not null default 0,
  earnings numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- RLS policies for profiles
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
  on public.profiles
  for update
  using (auth.uid() = id);

drop policy if exists "Profiles are deletable by owner" on public.profiles;
create policy "Profiles are deletable by owner"
  on public.profiles
  for delete
  using (auth.uid() = id);

-- Trigger for updated_at
create or replace trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Company earnings table
create table if not exists public.company_earnings (
  id uuid primary key default gen_random_uuid(),
  source_game text,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.company_earnings enable row level security;

-- No broad select policy for company_earnings (private by default)
-- RPC functions

-- Credit balance: adds funds to the caller's profile
create or replace function public.credit_balance(amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set balance = balance + amount
  where id = auth.uid();
$$;

-- Debit balance: subtracts stake if sufficient balance; returns true/false
create or replace function public.debit_balance(amount numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric(12,2);
begin
  select balance into current_balance
  from public.profiles
  where id = auth.uid()
  for update;

  if current_balance is null then
    return false;
  end if;

  if current_balance < amount then
    return false;
  end if;

  update public.profiles
  set balance = balance - amount
  where id = auth.uid();

  return true;
end;
$$;

-- Increment stats and earnings for the caller
create or replace function public.increment_stat(result text, stake numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if result = 'win' then
    update public.profiles
    set games_won = games_won + 1,
        earnings = earnings + stake
    where id = auth.uid();
  elsif result = 'loss' then
    update public.profiles
    set games_lost = games_lost + 1
    where id = auth.uid();
  end if;
end;
$$;

-- Record company earning (80/20 split handler will call this)
create or replace function public.record_company_earning(amount numeric, source_game text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.company_earnings (amount, source_game)
  values (amount, source_game);
$$;

-- Grants
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

grant all on public.company_earnings to service_role;
-- no direct grants to authenticated for company_earnings select to keep it private

grant execute on function public.credit_balance(numeric) to authenticated;
grant execute on function public.debit_balance(numeric) to authenticated;
grant execute on function public.increment_stat(text, numeric) to authenticated;
grant execute on function public.record_company_earning(numeric, text) to authenticated;