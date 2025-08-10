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

create policy if not exists "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy if not exists "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy if not exists "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Company earnings (append-only)
create table if not exists public.company_earnings (
  id uuid primary key default gen_random_uuid(),
  source_game uuid,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.company_earnings enable row level security;

create policy if not exists "Authenticated can read earnings"
  on public.company_earnings for select to authenticated
  using (true);

create policy if not exists "Authenticated can insert earnings"
  on public.company_earnings for insert to authenticated
  with check (true);

-- Updated_at trigger helper
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger on profiles
create trigger if not exists trg_profiles_updated
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Atomic debit function
create or replace function public.debit_balance(amount numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if amount <= 0 then
    return false;
  end if;
  update public.profiles
  set balance = balance - amount
  where id = auth.uid() and balance >= amount;
  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

-- Credit function
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

-- Stats increment
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
        earnings = earnings + (stake * 2 * 0.8)
    where id = auth.uid();
  elsif result = 'loss' then
    update public.profiles
    set games_lost = games_lost + 1
    where id = auth.uid();
  end if;
end;
$$;

-- Company earning record
create or replace function public.record_company_earning(amount numeric, source_game uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.company_earnings (amount, source_game) values (amount, source_game);
$$;

-- Grant execute to authenticated users
grant execute on function public.debit_balance(numeric) to authenticated;
grant execute on function public.credit_balance(numeric) to authenticated;
grant execute on function public.increment_stat(text, numeric) to authenticated;
grant execute on function public.record_company_earning(numeric, uuid) to authenticated;