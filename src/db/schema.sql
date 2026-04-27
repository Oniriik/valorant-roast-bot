create extension if not exists "pgcrypto";

create table if not exists guilds (
  guild_id text primary key,
  roast_channel_id text,
  created_at timestamptz default now()
);

create table if not exists valorant_accounts (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references guilds(guild_id) on delete cascade,
  discord_user_id text not null,
  riot_name text not null,
  riot_tag text not null,
  region text not null default 'eu',
  pending_match_count int not null default 0,
  last_match_id text,
  disabled boolean not null default false,
  created_at timestamptz default now(),
  unique (guild_id, riot_name, riot_tag)
);

create index if not exists valorant_accounts_discord_user_id_idx on valorant_accounts (discord_user_id);
create index if not exists valorant_accounts_guild_id_idx on valorant_accounts (guild_id);

create table if not exists matches (
  match_id text not null,
  account_id uuid not null references valorant_accounts(id) on delete cascade,
  played_at timestamptz not null,
  raw_stats jsonb not null,
  created_at timestamptz default now(),
  primary key (match_id, account_id)
);

create index if not exists matches_account_played_idx on matches (account_id, played_at desc);
