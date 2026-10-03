-- Cosmic Life Force: additive Razorpay payment records.
-- Review against the existing Supabase schema before applying. No data is dropped.

alter table public.orders add column if not exists payment_status text;
update public.orders set payment_status = 'pending' where payment_status is null;
alter table public.orders alter column payment_status set default 'pending';
alter table public.orders alter column payment_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_payment_status_check
      check (payment_status in ('created', 'pending', 'paid', 'failed', 'refunded', 'cancelled'));
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  provider_payment_id text unique,
  provider_signature text,
  status text not null default 'created' check (status in ('created', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  webhook_event_id text unique,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_status_idx on public.payments(user_id, status, created_at);
create index if not exists payments_provider_payment_idx on public.payments(provider_payment_id);
create index if not exists orders_payment_status_idx on public.orders(payment_status, created_at);

alter table public.payments enable row level security;
drop policy if exists payments_self_read on public.payments;
create policy payments_self_read on public.payments for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists payments_server_write on public.payments;
create policy payments_server_write on public.payments for all using (public.is_admin()) with check (public.is_admin());
