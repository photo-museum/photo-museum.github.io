-- My Museum 공유용 표와 사진 보관함. 같은 프로젝트의 다른 앱(zen_*, feedback)과 섞이지 않게 모두 mm_ / my-museum 이름을 쓴다.
-- 표는 바깥(공개 열쇠)에서 직접 읽거나 쓸 수 없다: 줄 단위 보안(RLS)을 켜고 허용 규칙을 하나도 두지 않는다.
-- 읽기·쓰기는 모두 Edge Function mm-share 가 서비스 열쇠로 한다 (주인 확인은 거기서).
create table if not exists public.mm_exhibitions (
  id text primary key,
  owner_hash text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mm_guestbook (
  id uuid primary key default gen_random_uuid(),
  exhibition_id text not null references public.mm_exhibitions(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 20),
  text text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists mm_guestbook_ex on public.mm_guestbook (exhibition_id, created_at);
alter table public.mm_exhibitions enable row level security;
alter table public.mm_guestbook enable row level security;
revoke all on public.mm_exhibitions from anon, authenticated;
revoke all on public.mm_guestbook from anon, authenticated;

-- 사진 보관함: 공개 읽기 (주소를 아는 사람은 사진을 볼 수 있다), 쓰기 규칙은 없음 (함수만 쓴다)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('my-museum', 'my-museum', true, 8000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
