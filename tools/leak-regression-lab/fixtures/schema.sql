-- Owned, disposable local fixture only. No IF NOT EXISTS: an existing fixture fails closed.
begin;
create table public.leak_lab_notes (
  id uuid primary key, owner_id uuid not null references auth.users, body text not null
);
create table public.leak_lab_members (
  team_id uuid not null, user_id uuid not null references auth.users, primary key (team_id, user_id)
);
create table public.leak_lab_team_notes (
  id uuid primary key, team_id uuid not null, body text not null
);
alter table public.leak_lab_notes enable row level security;
alter table public.leak_lab_members enable row level security;
alter table public.leak_lab_team_notes enable row level security;
grant select on public.leak_lab_notes, public.leak_lab_members, public.leak_lab_team_notes to anon, authenticated;
create policy leak_lab_members_own on public.leak_lab_members for select to authenticated using (user_id = auth.uid());
create policy leak_lab_notes_own on public.leak_lab_notes for select to authenticated using (owner_id = auth.uid());
create policy leak_lab_team_notes_own on public.leak_lab_team_notes for select to authenticated using (
  exists (select 1 from public.leak_lab_members m where m.team_id = leak_lab_team_notes.team_id and m.user_id = auth.uid())
);
insert into storage.buckets(id, name, public) values
  ('leak-lab-owner', 'leak-lab-owner', false), ('leak-lab-team', 'leak-lab-team', false);
create policy leak_lab_objects_own on storage.objects for select to authenticated using (
  (bucket_id = 'leak-lab-owner' and (storage.foldername(name))[1] = auth.uid()::text)
  or (bucket_id = 'leak-lab-team' and exists (
    select 1 from public.leak_lab_members m where m.team_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()
  ))
);
commit;
notify pgrst, 'reload schema';
