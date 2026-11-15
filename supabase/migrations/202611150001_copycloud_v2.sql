-- Isolated private transfer protocol. Apply to a staging Supabase project first.
-- This migration does not modify or delete legacy clips/uploads.
begin;
create table if not exists public.cc_v2_transfers (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  access_hash text not null check (access_hash ~ '^[0-9a-f]{64}$'),
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'uploading' check (state in ('uploading','ready','revoked')),
  size_bytes bigint not null check (size_bytes between 28 and 44040192),
  objects jsonb not null check (jsonb_typeof(objects)='array' and jsonb_array_length(objects) between 1 and 650),
  max_claims integer not null check (max_claims between 1 and 100),
  claims integer not null default 0 check (claims >= 0)
);
create index if not exists cc_v2_expiry_idx on public.cc_v2_transfers(expires_at);
create table if not exists public.cc_v2_grants (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  transfer_id uuid not null references public.cc_v2_transfers(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists cc_v2_grants_expiry_idx on public.cc_v2_grants(expires_at);
create table if not exists public.cc_v2_rate (
  subject text not null,
  slot bigint not null,
  hits integer not null default 1,
  primary key(subject,slot)
);
alter table public.cc_v2_transfers enable row level security;
alter table public.cc_v2_grants enable row level security;
alter table public.cc_v2_rate enable row level security;
revoke all on public.cc_v2_transfers,public.cc_v2_grants,public.cc_v2_rate from public,anon,authenticated;
grant select,insert,update,delete on public.cc_v2_transfers,public.cc_v2_grants,public.cc_v2_rate to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('copycloud-v2','copycloud-v2',false,2097152,array['application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['application/octet-stream'];
-- Restrictive policy protects this bucket even if older permissive policies are broad.
drop policy if exists cc_v2_deny_direct_client on storage.objects;
create policy cc_v2_deny_direct_client on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'copycloud-v2') with check (bucket_id <> 'copycloud-v2');

create or replace function public.cc_v2_rate_limit(p_subject text,p_slot bigint,p_limit integer)
returns boolean language plpgsql set search_path=public as $$
begin
  insert into public.cc_v2_rate(subject,slot,hits) values(p_subject,p_slot,1)
  on conflict(subject,slot) do update set hits=cc_v2_rate.hits+1 where cc_v2_rate.hits<p_limit;
  return found;
end $$;

create or replace function public.cc_v2_reserve(
  p_id uuid,p_code text,p_access_hash text,p_owner_hash text,p_minutes integer,
  p_size bigint,p_objects jsonb,p_max_claims integer
) returns uuid language plpgsql set search_path=public as $$
declare existing public.cc_v2_transfers%rowtype; active_bytes bigint;
begin
  if p_minutes not in (15,60,360,1440) then raise exception 'invalid expiry'; end if;
  perform pg_advisory_xact_lock(203067144);
  select * into existing from public.cc_v2_transfers where id=p_id;
  if found then
    if existing.owner_hash=p_owner_hash and existing.access_hash=p_access_hash and existing.code=p_code
       and existing.objects=p_objects and existing.size_bytes=p_size and existing.max_claims=p_max_claims
       and existing.state='uploading' and existing.expires_at>now() then return p_id; end if;
    raise exception 'reservation mismatch';
  end if;
  -- Conservative outstanding allocation cap; expired objects still consume quota until cleanup.
  select coalesce(sum(size_bytes),0) into active_bytes from public.cc_v2_transfers;
  if active_bytes+p_size>524288000 then raise exception 'allocation quota reached'; end if;
  insert into public.cc_v2_transfers(id,code,access_hash,owner_hash,expires_at,size_bytes,objects,max_claims)
  values(p_id,p_code,p_access_hash,p_owner_hash,now()+make_interval(mins=>p_minutes),p_size,p_objects,p_max_claims);
  return p_id;
end $$;

create or replace function public.cc_v2_object_status(p_id uuid)
returns table(path text,bytes bigint) language sql stable set search_path=public,storage as $$
  select o.name,case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else -1 end
  from storage.objects o where o.bucket_id='copycloud-v2' and o.name like p_id::text||'/%';
$$;

create or replace function public.cc_v2_finalize(p_id uuid,p_owner_hash text)
returns boolean language plpgsql set search_path=public,storage as $$
declare t public.cc_v2_transfers%rowtype;
begin
  select * into t from public.cc_v2_transfers where id=p_id and owner_hash=p_owner_hash and expires_at>now() for update;
  if not found or t.state='revoked' then return false; end if;
  if t.state='ready' then return true; end if;
  if exists (
    select 1 from jsonb_array_elements(t.objects) e
    where not exists (select 1 from storage.objects o where o.bucket_id='copycloud-v2'
      and o.name=e->>'path' and o.metadata->>'size'=e->>'bytes')
  ) then return false; end if;
  update public.cc_v2_transfers set state='ready' where id=p_id;
  return true;
end $$;

create or replace function public.cc_v2_claim(p_code text,p_access_hash text,p_grant_hash text)
returns setof public.cc_v2_transfers language plpgsql set search_path=public as $$
declare t public.cc_v2_transfers%rowtype;
begin
  update public.cc_v2_transfers set claims=claims+1
  where code=p_code and access_hash=p_access_hash and state='ready'
    and expires_at>now() and claims<max_claims
  returning * into t;
  if not found then return; end if;
  insert into public.cc_v2_grants(token_hash,transfer_id,expires_at)
  values(p_grant_hash,t.id,least(t.expires_at,now()+interval '30 minutes'));
  return next t;
end $$;

revoke execute on function public.cc_v2_rate_limit(text,bigint,integer) from public,anon,authenticated;
revoke execute on function public.cc_v2_reserve(uuid,text,text,text,integer,bigint,jsonb,integer) from public,anon,authenticated;
revoke execute on function public.cc_v2_object_status(uuid) from public,anon,authenticated;
revoke execute on function public.cc_v2_finalize(uuid,text) from public,anon,authenticated;
revoke execute on function public.cc_v2_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.cc_v2_rate_limit(text,bigint,integer),public.cc_v2_reserve(uuid,text,text,text,integer,bigint,jsonb,integer),public.cc_v2_object_status(uuid),public.cc_v2_finalize(uuid,text),public.cc_v2_claim(text,text,text) to service_role;
commit;
