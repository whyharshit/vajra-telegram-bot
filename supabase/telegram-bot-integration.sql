create table if not exists public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references public.learners(id) on delete cascade,
  phone text,
  telegram_user_id bigint not null unique,
  telegram_chat_id bigint not null,
  username text,
  first_name text,
  preferred_lang text not null default 'en',
  selected_module_id text not null default 'M01-safety',
  mode text not null default 'ask',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_accounts_learner_id_idx
on public.telegram_accounts(learner_id);

create index if not exists telegram_accounts_phone_idx
on public.telegram_accounts(phone);

alter table public.telegram_accounts enable row level security;
