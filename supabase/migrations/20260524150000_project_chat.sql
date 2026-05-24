create table if not exists public.project_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

comment on table public.project_chat_sessions is
  'Conversaciones de Chat con tus datos por proyecto.';

create index if not exists project_chat_sessions_project_idx
  on public.project_chat_sessions (project_id, last_message_at desc);

create index if not exists project_chat_sessions_creator_idx
  on public.project_chat_sessions (created_by, last_message_at desc);

create table if not exists public.project_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.project_chat_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.project_chat_messages is
  'Mensajes de cada conversación del chat por proyecto.';

create index if not exists project_chat_messages_session_idx
  on public.project_chat_messages (session_id, created_at asc);

create index if not exists project_chat_messages_project_idx
  on public.project_chat_messages (project_id, created_at desc);

alter table public.project_chat_sessions enable row level security;
alter table public.project_chat_messages enable row level security;

drop policy if exists "public_can_read_project_chat_sessions" on public.project_chat_sessions;
create policy "public_can_read_project_chat_sessions"
  on public.project_chat_sessions
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_project_chat_sessions" on public.project_chat_sessions;
create policy "public_can_insert_project_chat_sessions"
  on public.project_chat_sessions
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_project_chat_sessions" on public.project_chat_sessions;
create policy "public_can_update_project_chat_sessions"
  on public.project_chat_sessions
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_delete_project_chat_sessions" on public.project_chat_sessions;
create policy "public_can_delete_project_chat_sessions"
  on public.project_chat_sessions
  for delete
  to public
  using (true);

drop policy if exists "public_can_read_project_chat_messages" on public.project_chat_messages;
create policy "public_can_read_project_chat_messages"
  on public.project_chat_messages
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_project_chat_messages" on public.project_chat_messages;
create policy "public_can_insert_project_chat_messages"
  on public.project_chat_messages
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_project_chat_messages" on public.project_chat_messages;
create policy "public_can_update_project_chat_messages"
  on public.project_chat_messages
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_delete_project_chat_messages" on public.project_chat_messages;
create policy "public_can_delete_project_chat_messages"
  on public.project_chat_messages
  for delete
  to public
  using (true);

drop trigger if exists set_updated_at_project_chat_sessions on public.project_chat_sessions;
create trigger set_updated_at_project_chat_sessions
  before update on public.project_chat_sessions
  for each row
  execute function public.set_updated_at();
