-- 1) Roles and admin helper
create table if not exists public.user_roles (
  user_id uuid primary key,
  role text not null check (role in ('admin','user')) default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create trigger update_user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.update_updated_at_column();

alter table public.user_roles enable row level security;
-- Only the user can see their role; admins can see all
create policy "View own role or admin views all" on public.user_roles
for select using (auth.uid() = user_id or public.is_admin());
create policy "Users can insert own role (first time)" on public.user_roles
for insert with check (auth.uid() = user_id);
create policy "Users can update own role to user only" on public.user_roles
for update using (auth.uid() = user_id) with check (role in ('user'));
-- Admins can manage roles
create policy "Admins can upsert roles" on public.user_roles
for all using (public.is_admin()) with check (public.is_admin());

-- 2) M-Pesa core tables
create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_type text not null check (transaction_type in ('deposit','withdrawal')),
  amount numeric(12,2) not null,
  phone_number text not null,
  mpesa_receipt_number text,
  checkout_request_id text,
  merchant_request_id text,
  conversation_id text,
  originator_conversation_id text,
  status text not null default 'pending' check (status in ('pending','success','failed','cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mpesa_transactions enable row level security;
create policy "Users view own or admin view all" on public.mpesa_transactions
for select using (user_id = auth.uid() or public.is_admin());
create policy "Users insert own tx" on public.mpesa_transactions
for insert with check (user_id = auth.uid());
create policy "Users update own or admin update all" on public.mpesa_transactions
for update using (user_id = auth.uid() or public.is_admin());

create trigger update_mpesa_transactions_updated_at
  before update on public.mpesa_transactions
  for each row execute function public.update_updated_at_column();

-- 3) Company account
create table if not exists public.company_account (
  id uuid primary key default gen_random_uuid(),
  balance numeric(15,2) not null default 0,
  total_deposits numeric(15,2) not null default 0,
  total_withdrawals numeric(15,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_account enable row level security;
create policy "Admin can view company account" on public.company_account
for select using (public.is_admin());
create policy "System updates company account" on public.company_account
for update using (true);

-- Ensure one row exists
insert into public.company_account (balance) 
select 0 where not exists (select 1 from public.company_account);

-- 4) Profiles phone number
alter table public.profiles add column if not exists phone_number text;

-- 5) Deposit/withdraw helper functions
create or replace function public.process_mpesa_deposit_by_checkout(
  checkout_id text,
  receipt_number text
) returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  tx_id uuid;
  tx_amount numeric(12,2);
  tx_user uuid;
begin
  select id, amount, user_id into tx_id, tx_amount, tx_user
  from public.mpesa_transactions
  where checkout_request_id = checkout_id and status = 'pending' and transaction_type = 'deposit'
  for update;

  if not found then
    return false;
  end if;

  update public.mpesa_transactions
    set status = 'success', mpesa_receipt_number = receipt_number
  where id = tx_id;

  -- Credit user balance
  update public.profiles set balance = balance + tx_amount where id = tx_user;

  -- Credit company account balance and deposits
  update public.company_account
    set balance = balance + tx_amount,
        total_deposits = total_deposits + tx_amount,
        updated_at = now();

  return true;
end;
$$;

create or replace function public.process_mpesa_withdrawal(
  user_id_param uuid,
  amount_param numeric,
  phone_param text
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  current_balance numeric(12,2);
  company_balance numeric(15,2);
  transaction_id uuid;
begin
  select balance into current_balance from public.profiles where id = user_id_param for update;
  if current_balance < amount_param then
    raise exception 'Insufficient balance';
  end if;

  select balance into company_balance from public.company_account for update;
  if company_balance < amount_param then
    raise exception 'Insufficient company funds';
  end if;

  insert into public.mpesa_transactions (user_id, transaction_type, amount, phone_number, status)
  values (user_id_param, 'withdrawal', amount_param, phone_param, 'pending')
  returning id into transaction_id;

  update public.profiles set balance = balance - amount_param where id = user_id_param;
  update public.company_account
    set balance = balance - amount_param,
        total_withdrawals = total_withdrawals + amount_param,
        updated_at = now();

  return transaction_id;
end;
$$;

create or replace function public.rollback_mpesa_withdrawal(tx uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  amt numeric(12,2);
  uid uuid;
begin
  select amount, user_id into amt, uid from public.mpesa_transactions where id = tx and status = 'pending' and transaction_type = 'withdrawal' for update;
  if not found then return; end if;

  update public.mpesa_transactions set status = 'failed' where id = tx;
  update public.profiles set balance = balance + amt where id = uid;
  update public.company_account set balance = balance + amt where id in (select id from public.company_account limit 1);
end;
$$;