# Bot Discord Valorant — Roast Bot

**Status:** approved
**Date:** 2026-04-27

## Goal
Bot Discord qui surveille les matchs Compétitif des comptes Valorant liés et envoie un message de roast généré par OpenAI tous les 5 nouveaux matchs par compte.

## Stack
- **Runtime:** Node.js 20+, TypeScript
- **Discord:** `discord.js` v14
- **DB:** Supabase (Postgres) via `@supabase/supabase-js`
- **LLM:** OpenAI Node SDK, modèle par défaut `gpt-4o-mini`
- **Valorant API:** HenrikDev (`api.henrikdev.xyz`)
- **Cron interne:** `node-cron`
- **Validation:** `zod`

## Slash commands

Toutes les commandes admin requièrent `Manage Guild`.

| Command | Args | Permission | Effet |
|---|---|---|---|
| `/link` | `user: User`, `riot: string` (`Name#TAG`), `region?: enum` (default `eu`) | admin | Lie un compte Valorant à un user Discord pour la guild courante. Multi-comptes OK. |
| `/unlink` | `user: User`, `riot: string` | admin | Retire le lien (et purge les matchs associés). |
| `/setchannel` | `channel: Channel` | admin | Définit le channel où poster les roasts pour la guild. |
| `/list` | `user?: User` | tous | Liste les comptes liés (du user mentionné ou de tous). |

## Data model (Supabase)

```sql
create table guilds (
  guild_id text primary key,
  roast_channel_id text,
  created_at timestamptz default now()
);

create table valorant_accounts (
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

create index on valorant_accounts (discord_user_id);
create index on valorant_accounts (guild_id);

create table matches (
  match_id text not null,
  account_id uuid not null references valorant_accounts(id) on delete cascade,
  played_at timestamptz not null,
  raw_stats jsonb not null,
  created_at timestamptz default now(),
  primary key (match_id, account_id)
);

create index on matches (account_id, played_at desc);
```

`raw_stats` est un sous-ensemble du payload Henrik réduit aux champs utilisés pour le roast :
agent, map, mode, rounds_won, rounds_lost, kills, deaths, assists, acs, hs_pct, score, result.

## Flow — tick toutes les 2 minutes

```
for each account in valorant_accounts where disabled = false:
    response = henrik.getMatches(region, name, tag, mode='competitive', size=5)
    if rate-limited: backoff and skip this account this tick
    new_matches = response.matches where match_id not in matches[account_id]
    sort new_matches asc by played_at
    for each m in new_matches:
        insert into matches (..., raw_stats=summarize(m))
        account.pending_match_count += 1
        account.last_match_id = m.match_id
        if account.pending_match_count >= 5:
            roast_payload = last 5 matches for account ordered desc
            text = openai.roast(roast_payload, locale='fr')
            post to guild.roast_channel_id (skip if null/missing)
            account.pending_match_count = 0
        save account
```

Notes:
- Si `roast_channel_id` est null pour la guild → on ne poste pas mais on reset quand même le compteur (sinon il s'accumule à l'infini sans jamais relâcher).
- Si OpenAI échoue → on **ne** reset **pas** le compteur, on retentera au prochain match.
- Si Discord post échoue (channel supprimé / bot kické) : log + flag `disabled=true` sur tous les comptes de cette guild si la guild elle-même est inaccessible (`Unknown Guild`).

## Rate limits & robustesse

- **Henrik:** ~30 req/min sans clé. Le tick à 2 min permet de séquencer même 50+ comptes sans souci. On respecte les `Retry-After` headers.
- **OpenAI:** 1 appel par seuil de 5 matchs par compte. Marginal.
- **Supabase:** négligeable.

## Erreurs

| Source | Comportement |
|---|---|
| Henrik 404 (compte introuvable) | Log + flag `disabled=true` sur le compte |
| Henrik 429 / 5xx | Log + skip ce tick |
| OpenAI fail | Log + ne pas reset le compteur |
| Discord channel introuvable | Log + ne pas reset le compteur (le channel reviendra peut-être) |
| Discord guild introuvable | Log + désactiver tous les comptes de la guild |

## Configuration (`.env`)

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
HENRIK_API_KEY=        # optionnel
TICK_INTERVAL_MINUTES=2
ROAST_THRESHOLD=5
DEFAULT_REGION=eu
LOG_LEVEL=info
```

## Le roast (prompt OpenAI)

System prompt (FR):
> Tu es un commentateur de Valorant qui roast un joueur en français, ton mordant mais bon enfant (zéro insulte hard, pas d'attaques perso). Tu disposes des stats de ses 5 derniers matchs Compétitif. Maximum ~600 caractères. Mentionne 1 ou 2 stats concrètes (KD, ACS, HS%, win rate, agents joués, maps). Une chute claire à la fin.

User input: JSON résumé des 5 matchs + `riot_name#tag` + `discord_user_mention`.

Output: texte brut, posté en embed Discord avec en titre `🎯 Roast de {riot_name}#{riot_tag}` et le texte en description.

## Project layout

```
bot-valo/
  src/
    index.ts                # bootstrap: client, register commands, start scheduler
    config.ts               # env parsing via zod
    db/
      client.ts             # supabase client
      schema.sql            # the migrations from this doc
      repo.ts               # typed access for guilds/accounts/matches
    discord/
      client.ts
      commands/
        link.ts
        unlink.ts
        setchannel.ts
        list.ts
        index.ts            # registry + register-on-startup
    valorant/
      henrik.ts             # http client + zod parsing
      types.ts
    roast/
      summarize.ts          # turns Henrik match -> compact stats
      prompt.ts             # builds OpenAI messages
      generate.ts           # calls OpenAI
    scheduler/
      tick.ts               # the per-tick logic above
      index.ts              # node-cron registration
    log.ts                  # tiny logger wrapper
  docs/
    superpowers/specs/2026-04-27-bot-valo-design.md
  test/                     # unit tests
  .env.example
  .gitignore
  package.json
  tsconfig.json
  README.md
```

## Tests

- **Unit:**
  - `roast/summarize.ts` — fixtures Henrik → stats compactes
  - `roast/prompt.ts` — shape du prompt
  - `scheduler/tick.ts` — logique compteur & seuil avec Henrik/OpenAI/Supabase mocks
  - `valorant/henrik.ts` — parsing zod sur fixtures
- **Pas** de tests Discord live ni Supabase live (out of scope).

## Out of scope (v1)

- Pagination/historique long de matchs (on ne traite que les ≤ 5 derniers par tick)
- Stats agrégées long-terme / leaderboard
- Roast multi-langue
- Refresh de rang / RR tracking
- Mode "anti-roast" / éloges
- Webhooks Henrik (pas dispo)

## Open questions / future

- Si Henrik introduit une politique plus stricte, prévoir un mode "Riot officiel" en swap de provider.
- Possibilité d'ajouter un `/roast user:@Bob` manuel (force roast immédiat sur les N derniers matchs) — pas en v1.
