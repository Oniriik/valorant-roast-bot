# Bot Valo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot Discord qui surveille les matchs Compétitif Valorant des comptes liés et envoie un roast OpenAI tous les 5 nouveaux matchs par compte.

**Architecture:** Single Node.js process. discord.js gateway + slash commands. node-cron tick toutes les 2 min → poll Henrik par compte → insert nouveaux matchs Supabase → si compteur ≥ 5, génère roast OpenAI et poste dans le channel configuré, reset.

**Tech Stack:** Node 20, TypeScript, discord.js v14, @supabase/supabase-js, openai, node-cron, zod, vitest, dotenv.

**Spec:** `docs/superpowers/specs/2026-04-27-bot-valo-design.md`

---

## Task 1 : Bootstrap projet

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `vitest.config.ts`
- Create: `src/log.ts`, `src/config.ts`
- Test: `test/config.test.ts`

- [ ] **Step 1 : `git init`**

```bash
cd /Users/timothe/dev/bot-valo && git init
```

- [ ] **Step 2 : Create `package.json`**

```json
{
  "name": "bot-valo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p .",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "register-commands": "tsx src/discord/commands/register.ts",
    "db:apply": "tsx scripts/apply-schema.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "discord.js": "^14.16.0",
    "dotenv": "^16.4.5",
    "node-cron": "^3.0.3",
    "openai": "^4.67.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3 : Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4 : Create `.gitignore`**

```
node_modules
dist
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode
.idea
```

- [ ] **Step 5 : Create `.env.example`**

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
HENRIK_API_KEY=
TICK_INTERVAL_MINUTES=2
ROAST_THRESHOLD=5
DEFAULT_REGION=eu
LOG_LEVEL=info
```

- [ ] **Step 6 : `npm install`**

Run: `npm install`
Expected: pas d'erreurs majeures.

- [ ] **Step 7 : Create `src/log.ts`**

```ts
const levels = ["debug", "info", "warn", "error"] as const;
type Level = typeof levels[number];

const current = (process.env.LOG_LEVEL ?? "info") as Level;
const idx = (l: Level) => levels.indexOf(l);

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (idx(level) < idx(current)) return;
  const line = { ts: new Date().toISOString(), level, msg, ...meta };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out); else console.log(out);
}

export const logger = {
  debug: (m: string, x?: Record<string, unknown>) => log("debug", m, x),
  info:  (m: string, x?: Record<string, unknown>) => log("info", m, x),
  warn:  (m: string, x?: Record<string, unknown>) => log("warn", m, x),
  error: (m: string, x?: Record<string, unknown>) => log("error", m, x),
};
```

- [ ] **Step 8 : Write failing test for config**

`test/config.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses required env vars", () => {
    const env = {
      DISCORD_TOKEN: "x", DISCORD_CLIENT_ID: "1",
      SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k",
      OPENAI_API_KEY: "ok",
    };
    const c = loadConfig(env);
    expect(c.discordToken).toBe("x");
    expect(c.tickIntervalMinutes).toBe(2);
    expect(c.roastThreshold).toBe(5);
    expect(c.defaultRegion).toBe("eu");
    expect(c.openaiModel).toBe("gpt-5.4-mini");
  });

  it("throws on missing required env", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
```

- [ ] **Step 9 : Run test → expect FAIL**

`npx vitest run test/config.test.ts` → FAIL (module introuvable).

- [ ] **Step 10 : Create `src/config.ts`**

```ts
import { z } from "zod";

const Schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  HENRIK_API_KEY: z.string().optional(),
  TICK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(2),
  ROAST_THRESHOLD: z.coerce.number().int().min(1).default(5),
  DEFAULT_REGION: z.enum(["eu", "na", "ap", "kr", "latam", "br"]).default("eu"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = {
  discordToken: string;
  discordClientId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  openaiModel: string;
  henrikApiKey?: string;
  tickIntervalMinutes: number;
  roastThreshold: number;
  defaultRegion: string;
  logLevel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppConfig {
  const p = Schema.parse(env);
  return {
    discordToken: p.DISCORD_TOKEN,
    discordClientId: p.DISCORD_CLIENT_ID,
    supabaseUrl: p.SUPABASE_URL,
    supabaseServiceRoleKey: p.SUPABASE_SERVICE_ROLE_KEY,
    openaiApiKey: p.OPENAI_API_KEY,
    openaiModel: p.OPENAI_MODEL,
    henrikApiKey: p.HENRIK_API_KEY,
    tickIntervalMinutes: p.TICK_INTERVAL_MINUTES,
    roastThreshold: p.ROAST_THRESHOLD,
    defaultRegion: p.DEFAULT_REGION,
    logLevel: p.LOG_LEVEL,
  };
}
```

- [ ] **Step 11 : Run test → PASS**

`npx vitest run test/config.test.ts` → PASS.

- [ ] **Step 12 : Commit**

```bash
git add -A
git commit -m "chore: bootstrap project (ts, deps, config, log)"
```

---

## Task 2 : Schéma Supabase + script d'application

**Files:**
- Create: `src/db/schema.sql`, `scripts/apply-schema.ts`, `src/db/client.ts`

- [ ] **Step 1 : Write `src/db/schema.sql`** (copier exactement le bloc SQL de la spec)

```sql
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
```

- [ ] **Step 2 : Create `src/db/client.ts`**

```ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../config.js";

export function makeSupabase(c: AppConfig): SupabaseClient {
  return createClient(c.supabaseUrl, c.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 3 : Create `scripts/apply-schema.ts`**

Pas de RPC `exec_sql` par défaut sur Supabase. On affiche le SQL, l'utilisateur le colle dans l'éditeur SQL de Supabase. Le script vérifie ensuite que les tables existent via l'API.

```ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../src/config.js";
import { makeSupabase } from "../src/db/client.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(__dir, "../src/db/schema.sql"), "utf8");

console.log("=== schema.sql ===\n");
console.log(sql);
console.log("\n=== Action requise ===");
console.log("Copie ce SQL dans Supabase → SQL Editor → Run.");
console.log("Puis presse Entrée pour vérifier.");

await new Promise(r => process.stdin.once("data", r));

const cfg = loadConfig();
const sb = makeSupabase(cfg);
for (const t of ["guilds", "valorant_accounts", "matches"]) {
  const { error } = await sb.from(t).select("*", { head: true, count: "exact" }).limit(0);
  if (error) { console.error(`KO: ${t}`, error.message); process.exit(1); }
  console.log(`OK: ${t}`);
}
console.log("Schéma appliqué.");
process.exit(0);
```

- [ ] **Step 4 : Faire tourner `npm run db:apply`**

```bash
npm run db:apply
```

Coller le SQL dans Supabase, presser Entrée, vérifier que les 3 tables sont OK.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat(db): add supabase schema and apply script"
```

---

## Task 3 : Repository typé Supabase

**Files:**
- Create: `src/db/repo.ts`, `src/db/types.ts`
- Test: `test/repo.test.ts` (skip si pas de DB de test ; on testera via tick)

- [ ] **Step 1 : Create `src/db/types.ts`**

```ts
export interface GuildRow {
  guild_id: string;
  roast_channel_id: string | null;
  created_at: string;
}

export interface AccountRow {
  id: string;
  guild_id: string;
  discord_user_id: string;
  riot_name: string;
  riot_tag: string;
  region: string;
  pending_match_count: number;
  last_match_id: string | null;
  disabled: boolean;
  created_at: string;
}

export interface MatchRow {
  match_id: string;
  account_id: string;
  played_at: string;
  raw_stats: MatchStats;
  created_at: string;
}

export interface MatchStats {
  mode: string;
  agent: string;
  map: string;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  hs_pct: number;
  rounds_won: number;
  rounds_lost: number;
  result: "win" | "loss" | "draw";
  played_at: string;
}
```

- [ ] **Step 2 : Create `src/db/repo.ts`**

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { AccountRow, GuildRow, MatchRow, MatchStats } from "./types.js";

export class Repo {
  constructor(private sb: SupabaseClient) {}

  async upsertGuild(guildId: string): Promise<void> {
    const { error } = await this.sb.from("guilds").upsert({ guild_id: guildId }, { onConflict: "guild_id" });
    if (error) throw error;
  }

  async setRoastChannel(guildId: string, channelId: string): Promise<void> {
    await this.upsertGuild(guildId);
    const { error } = await this.sb.from("guilds").update({ roast_channel_id: channelId }).eq("guild_id", guildId);
    if (error) throw error;
  }

  async getGuild(guildId: string): Promise<GuildRow | null> {
    const { data, error } = await this.sb.from("guilds").select("*").eq("guild_id", guildId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async listAccounts(): Promise<AccountRow[]> {
    const { data, error } = await this.sb.from("valorant_accounts").select("*").eq("disabled", false);
    if (error) throw error;
    return data ?? [];
  }

  async listAccountsForGuild(guildId: string, discordUserId?: string): Promise<AccountRow[]> {
    let q = this.sb.from("valorant_accounts").select("*").eq("guild_id", guildId);
    if (discordUserId) q = q.eq("discord_user_id", discordUserId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async createAccount(input: {
    guildId: string; discordUserId: string; riotName: string; riotTag: string; region: string;
  }): Promise<AccountRow> {
    await this.upsertGuild(input.guildId);
    const { data, error } = await this.sb.from("valorant_accounts").insert({
      guild_id: input.guildId,
      discord_user_id: input.discordUserId,
      riot_name: input.riotName,
      riot_tag: input.riotTag,
      region: input.region,
    }).select().single();
    if (error) throw error;
    return data;
  }

  async deleteAccount(guildId: string, riotName: string, riotTag: string): Promise<boolean> {
    const { data, error } = await this.sb.from("valorant_accounts")
      .delete()
      .eq("guild_id", guildId).eq("riot_name", riotName).eq("riot_tag", riotTag)
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async disableAccount(id: string): Promise<void> {
    const { error } = await this.sb.from("valorant_accounts").update({ disabled: true }).eq("id", id);
    if (error) throw error;
  }

  async existingMatchIds(accountId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await this.sb.from("matches")
      .select("match_id").eq("account_id", accountId).in("match_id", ids);
    if (error) throw error;
    return new Set((data ?? []).map(r => r.match_id));
  }

  async insertMatch(accountId: string, matchId: string, playedAt: string, stats: MatchStats): Promise<void> {
    const { error } = await this.sb.from("matches").insert({
      match_id: matchId, account_id: accountId, played_at: playedAt, raw_stats: stats,
    });
    if (error && error.code !== "23505") throw error;
  }

  async getRecentMatches(accountId: string, limit = 5): Promise<MatchRow[]> {
    const { data, error } = await this.sb.from("matches")
      .select("*").eq("account_id", accountId)
      .order("played_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async updateAccountAfterMatch(accountId: string, lastMatchId: string, pendingCount: number): Promise<void> {
    const { error } = await this.sb.from("valorant_accounts")
      .update({ last_match_id: lastMatchId, pending_match_count: pendingCount })
      .eq("id", accountId);
    if (error) throw error;
  }
}
```

- [ ] **Step 3 : Commit**

```bash
git add -A
git commit -m "feat(db): typed repository for guilds/accounts/matches"
```

---

## Task 4 : Henrik client (TDD avec fixture)

**Files:**
- Create: `src/valorant/types.ts`, `src/valorant/henrik.ts`
- Create: `test/fixtures/henrik-matches.json` (extrait réel anonymisé/réduit)
- Test: `test/henrik.test.ts`

- [ ] **Step 1 : Récupérer un payload Henrik réel pour fixture**

Soit utiliser un compte public connu (ex. `aspas#000`) :
```bash
curl -s "https://api.henrikdev.xyz/valorant/v3/matches/eu/Aspas/000?mode=competitive&size=2" -o test/fixtures/henrik-matches.json
```
Si problème de cache/erreur, créer une fixture minimale fictive correspondant au schéma documenté Henrik. Ne pas commiter de PII.

- [ ] **Step 2 : Write `src/valorant/types.ts`**

Schémas zod pour le sous-ensemble qu'on utilise (voir docs Henrik v3 `/matches`) :

```ts
import { z } from "zod";

export const HenrikPlayer = z.object({
  puuid: z.string(),
  name: z.string(),
  tag: z.string(),
  team: z.string(),
  character: z.string(),
  stats: z.object({
    score: z.number(),
    kills: z.number(),
    deaths: z.number(),
    assists: z.number(),
    headshots: z.number(),
    bodyshots: z.number(),
    legshots: z.number(),
  }),
});

export const HenrikTeams = z.object({
  red: z.object({ has_won: z.boolean(), rounds_won: z.number(), rounds_lost: z.number() }),
  blue: z.object({ has_won: z.boolean(), rounds_won: z.number(), rounds_lost: z.number() }),
});

export const HenrikMatch = z.object({
  metadata: z.object({
    matchid: z.string(),
    map: z.string(),
    mode: z.string(),
    mode_id: z.string().optional(),
    queue: z.string().optional(),
    game_start: z.number(),
    game_length: z.number(),
    rounds_played: z.number(),
  }),
  players: z.object({
    all_players: z.array(HenrikPlayer),
  }),
  teams: HenrikTeams,
});

export const HenrikMatchesResponse = z.object({
  status: z.number(),
  data: z.array(HenrikMatch),
});

export type HenrikMatchT = z.infer<typeof HenrikMatch>;
```

- [ ] **Step 3 : Write failing test**

`test/henrik.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseHenrikMatches } from "../src/valorant/henrik.js";

const raw = JSON.parse(readFileSync("test/fixtures/henrik-matches.json", "utf8"));

describe("parseHenrikMatches", () => {
  it("returns array of validated matches", () => {
    const out = parseHenrikMatches(raw);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].metadata.matchid).toBeTypeOf("string");
  });
});
```

- [ ] **Step 4 : Run → FAIL**

`npx vitest run test/henrik.test.ts`

- [ ] **Step 5 : Write `src/valorant/henrik.ts`**

```ts
import { HenrikMatchesResponse, HenrikMatchT } from "./types.js";
import { logger } from "../log.js";

export interface HenrikClient {
  getCompetitiveMatches(region: string, name: string, tag: string, size?: number): Promise<HenrikMatchT[]>;
}

export function parseHenrikMatches(payload: unknown): HenrikMatchT[] {
  const parsed = HenrikMatchesResponse.parse(payload);
  return parsed.data;
}

export class HttpHenrikClient implements HenrikClient {
  constructor(private apiKey?: string) {}

  async getCompetitiveMatches(region: string, name: string, tag: string, size = 5): Promise<HenrikMatchT[]> {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=${size}`;
    const headers: Record<string, string> = {};
    if (this.apiKey) headers["Authorization"] = this.apiKey;
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const retry = res.headers.get("retry-after");
      const err = new Error("henrik rate-limited");
      (err as any).rateLimited = true;
      (err as any).retryAfter = retry;
      throw err;
    }
    if (res.status === 404) {
      const err = new Error("account not found");
      (err as any).notFound = true;
      throw err;
    }
    if (!res.ok) {
      throw new Error(`henrik http ${res.status}`);
    }
    const json = await res.json();
    return parseHenrikMatches(json);
  }
}
```

- [ ] **Step 6 : Run → PASS**

`npx vitest run test/henrik.test.ts` → PASS.

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "feat(valorant): henrik client + parser with zod"
```

---

## Task 5 : Roast — summarize, prompt, generate

**Files:**
- Create: `src/roast/summarize.ts`, `src/roast/prompt.ts`, `src/roast/generate.ts`
- Test: `test/summarize.test.ts`, `test/prompt.test.ts`

### 5.1 Summarize

- [ ] **Step 1 : Write failing test**

`test/summarize.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseHenrikMatches } from "../src/valorant/henrik.js";
import { summarizeMatch } from "../src/roast/summarize.js";

const raw = JSON.parse(readFileSync("test/fixtures/henrik-matches.json", "utf8"));
const matches = parseHenrikMatches(raw);

describe("summarizeMatch", () => {
  it("extracts focused stats for the target player", () => {
    const m = matches[0];
    const target = m.players.all_players[0];
    const s = summarizeMatch(m, target.puuid);
    expect(s.agent).toBe(target.character);
    expect(s.kills).toBe(target.stats.kills);
    expect(s.deaths).toBe(target.stats.deaths);
    expect(["win", "loss", "draw"]).toContain(s.result);
    expect(s.acs).toBeGreaterThanOrEqual(0);
    expect(s.hs_pct).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2 : Run → FAIL**

`npx vitest run test/summarize.test.ts`

- [ ] **Step 3 : Write `src/roast/summarize.ts`**

```ts
import { HenrikMatchT } from "../valorant/types.js";
import { MatchStats } from "../db/types.js";

export function summarizeMatch(m: HenrikMatchT, puuid: string): MatchStats {
  const p = m.players.all_players.find(x => x.puuid === puuid);
  if (!p) throw new Error(`player ${puuid} not found in match ${m.metadata.matchid}`);

  const totalShots = p.stats.headshots + p.stats.bodyshots + p.stats.legshots;
  const hsPct = totalShots > 0 ? (p.stats.headshots / totalShots) * 100 : 0;
  const acs = m.metadata.rounds_played > 0 ? p.stats.score / m.metadata.rounds_played : 0;

  const team = p.team.toLowerCase() === "red" ? m.teams.red : m.teams.blue;
  const enemy = p.team.toLowerCase() === "red" ? m.teams.blue : m.teams.red;
  const result: "win" | "loss" | "draw" =
    team.has_won ? "win" : (team.rounds_won === enemy.rounds_won ? "draw" : "loss");

  return {
    mode: m.metadata.mode,
    agent: p.character,
    map: m.metadata.map,
    kills: p.stats.kills,
    deaths: p.stats.deaths,
    assists: p.stats.assists,
    acs: Math.round(acs),
    hs_pct: Math.round(hsPct),
    rounds_won: team.rounds_won,
    rounds_lost: team.rounds_lost,
    result,
    played_at: new Date(m.metadata.game_start * 1000).toISOString(),
  };
}
```

- [ ] **Step 4 : Run → PASS**

### 5.2 Prompt

- [ ] **Step 5 : Write failing test**

`test/prompt.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { buildRoastPrompt } from "../src/roast/prompt.js";
import { MatchStats } from "../src/db/types.js";

const sampleStats: MatchStats[] = [
  { mode: "Competitive", agent: "Jett", map: "Ascent", kills: 12, deaths: 18, assists: 3, acs: 180, hs_pct: 20, rounds_won: 8, rounds_lost: 13, result: "loss", played_at: new Date().toISOString() },
];

describe("buildRoastPrompt", () => {
  it("includes user mention, riot id and stats summary in user message", () => {
    const r = buildRoastPrompt({
      discordUserMention: "<@123>",
      riotName: "Bob", riotTag: "EUW",
      matches: sampleStats,
    });
    expect(r.system).toMatch(/français/i);
    expect(r.user).toContain("<@123>");
    expect(r.user).toContain("Bob#EUW");
    expect(r.user).toContain("Jett");
  });
});
```

- [ ] **Step 6 : Run → FAIL**

- [ ] **Step 7 : Write `src/roast/prompt.ts`**

```ts
import { MatchStats } from "../db/types.js";

export interface RoastInput {
  discordUserMention: string;
  riotName: string;
  riotTag: string;
  matches: MatchStats[];
}

export interface RoastPrompt {
  system: string;
  user: string;
}

export function buildRoastPrompt(i: RoastInput): RoastPrompt {
  const system = [
    "Tu es un commentateur de Valorant qui roast un joueur en français.",
    "Ton mordant, sarcastique mais bon enfant. Pas d'insultes hard, pas d'attaques perso.",
    "Maximum ~600 caractères. Mentionne 1 ou 2 stats concrètes (KD, ACS, HS%, win rate, agents, maps).",
    "Une chute claire à la fin.",
    "Mentionne le joueur Discord exactement comme fourni (avec la mention).",
  ].join(" ");

  const lines = i.matches.map((m, idx) => {
    const kd = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : `${m.kills}.00`;
    return `Match ${idx + 1}: ${m.agent} sur ${m.map} — ${m.kills}/${m.deaths}/${m.assists} (KD ${kd}), ACS ${m.acs}, HS ${m.hs_pct}%, ${m.result.toUpperCase()} ${m.rounds_won}-${m.rounds_lost}`;
  }).join("\n");

  const wins = i.matches.filter(m => m.result === "win").length;

  const user = [
    `Joueur Discord: ${i.discordUserMention}`,
    `Riot ID: ${i.riotName}#${i.riotTag}`,
    `Bilan 5 derniers matchs comp: ${wins}W / ${i.matches.length - wins}L`,
    `Détails:`,
    lines,
    `Roast-le maintenant.`,
  ].join("\n");

  return { system, user };
}
```

- [ ] **Step 8 : Run → PASS**

### 5.3 Generate

- [ ] **Step 9 : Write `src/roast/generate.ts`**

```ts
import OpenAI from "openai";
import { buildRoastPrompt, RoastInput } from "./prompt.js";

export interface RoastGenerator {
  generate(input: RoastInput): Promise<string>;
}

export class OpenAIRoastGenerator implements RoastGenerator {
  private client: OpenAI;
  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: RoastInput): Promise<string> {
    const { system, user } = buildRoastPrompt(input);
    const r = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 300,
      temperature: 0.9,
    });
    const txt = r.choices[0]?.message?.content?.trim();
    if (!txt) throw new Error("openai returned empty");
    return txt.length > 1000 ? txt.slice(0, 1000) : txt;
  }
}
```

- [ ] **Step 10 : Commit**

```bash
git add -A
git commit -m "feat(roast): summarize, prompt builder, openai generator"
```

---

## Task 6 : Discord client + slash commands

**Files:**
- Create: `src/discord/client.ts`, `src/discord/permissions.ts`
- Create: `src/discord/commands/index.ts`, `register.ts`, `link.ts`, `unlink.ts`, `setchannel.ts`, `list.ts`

- [ ] **Step 1 : Create `src/discord/client.ts`**

```ts
import { Client, GatewayIntentBits } from "discord.js";

export function makeDiscordClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds] });
}
```

- [ ] **Step 2 : Create `src/discord/permissions.ts`**

```ts
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";

export function isAdmin(i: ChatInputCommandInteraction): boolean {
  if (!i.inGuild()) return false;
  const perms = i.memberPermissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export async function ephemeralReply(i: ChatInputCommandInteraction, content: string): Promise<void> {
  if (i.replied || i.deferred) await i.followUp({ content, ephemeral: true });
  else await i.reply({ content, ephemeral: true });
}
```

- [ ] **Step 3 : Create command modules**

`src/discord/commands/link.ts` :
```ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Repo } from "../../db/repo.js";
import { ephemeralReply, isAdmin } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("link").setDescription("Lie un compte Valorant à un user Discord (admin)")
  .addUserOption(o => o.setName("user").setDescription("Membre Discord").setRequired(true))
  .addStringOption(o => o.setName("riot").setDescription("Name#TAG").setRequired(true))
  .addStringOption(o => o.setName("region").setDescription("Région")
    .addChoices(
      { name: "EU", value: "eu" }, { name: "NA", value: "na" },
      { name: "AP", value: "ap" }, { name: "KR", value: "kr" },
      { name: "LATAM", value: "latam" }, { name: "BR", value: "br" },
    ));

export function makeHandler(repo: Repo, defaultRegion: string) {
  return async (i: ChatInputCommandInteraction) => {
    if (!isAdmin(i)) return ephemeralReply(i, "❌ Réservé aux admins (Manage Guild).");
    const user = i.options.getUser("user", true);
    const riot = i.options.getString("riot", true);
    const region = i.options.getString("region") ?? defaultRegion;
    const m = riot.match(/^(.+)#([^\s#]+)$/);
    if (!m) return ephemeralReply(i, "Format invalide. Attendu: `Name#TAG`.");
    const [, name, tag] = m;
    try {
      const acc = await repo.createAccount({
        guildId: i.guildId!,
        discordUserId: user.id,
        riotName: name,
        riotTag: tag,
        region,
      });
      await ephemeralReply(i, `✅ Lié <@${user.id}> → \`${name}#${tag}\` (${region}).`);
    } catch (e: any) {
      if (String(e?.code) === "23505") return ephemeralReply(i, "Ce compte est déjà lié sur ce serveur.");
      await ephemeralReply(i, `Erreur: ${e?.message ?? e}`);
    }
  };
}
```

`src/discord/commands/unlink.ts` :
```ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Repo } from "../../db/repo.js";
import { ephemeralReply, isAdmin } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("unlink").setDescription("Retire un lien Valorant (admin)")
  .addStringOption(o => o.setName("riot").setDescription("Name#TAG").setRequired(true));

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction) => {
    if (!isAdmin(i)) return ephemeralReply(i, "❌ Réservé aux admins.");
    const riot = i.options.getString("riot", true);
    const m = riot.match(/^(.+)#([^\s#]+)$/);
    if (!m) return ephemeralReply(i, "Format invalide.");
    const ok = await repo.deleteAccount(i.guildId!, m[1], m[2]);
    await ephemeralReply(i, ok ? `🗑️ \`${m[1]}#${m[2]}\` retiré.` : "Aucun lien trouvé.");
  };
}
```

`src/discord/commands/setchannel.ts` :
```ts
import { ChannelType, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Repo } from "../../db/repo.js";
import { ephemeralReply, isAdmin } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("setchannel").setDescription("Définit le channel de roast (admin)")
  .addChannelOption(o => o.setName("channel").setDescription("Channel texte")
    .addChannelTypes(ChannelType.GuildText).setRequired(true));

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction) => {
    if (!isAdmin(i)) return ephemeralReply(i, "❌ Réservé aux admins.");
    const ch = i.options.getChannel("channel", true);
    await repo.setRoastChannel(i.guildId!, ch.id);
    await ephemeralReply(i, `✅ Roasts iront dans <#${ch.id}>.`);
  };
}
```

`src/discord/commands/list.ts` :
```ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Repo } from "../../db/repo.js";
import { ephemeralReply } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("list").setDescription("Liste les comptes Valorant liés")
  .addUserOption(o => o.setName("user").setDescription("Filtrer sur un user"));

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction) => {
    const user = i.options.getUser("user");
    const accs = await repo.listAccountsForGuild(i.guildId!, user?.id);
    if (accs.length === 0) return ephemeralReply(i, "Rien à afficher.");
    const lines = accs.map(a => `• <@${a.discord_user_id}> → \`${a.riot_name}#${a.riot_tag}\` (${a.region})${a.disabled ? " — désactivé" : ""}`);
    await ephemeralReply(i, lines.join("\n"));
  };
}
```

`src/discord/commands/index.ts` :
```ts
import { Client, ChatInputCommandInteraction, Interaction } from "discord.js";
import { Repo } from "../../db/repo.js";
import * as link from "./link.js";
import * as unlink from "./unlink.js";
import * as setchannel from "./setchannel.js";
import * as list from "./list.js";
import { logger } from "../../log.js";

export function attachInteractionHandler(client: Client, repo: Repo, defaultRegion: string): void {
  const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
    link: link.makeHandler(repo, defaultRegion),
    unlink: unlink.makeHandler(repo),
    setchannel: setchannel.makeHandler(repo),
    list: list.makeHandler(repo),
  };

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const h = handlers[interaction.commandName];
    if (!h) return;
    try { await h(interaction); }
    catch (e) {
      logger.error("command failed", { cmd: interaction.commandName, err: String(e) });
      try { await interaction.reply({ content: `Erreur interne.`, ephemeral: true }); } catch {}
    }
  });
}

export const allCommandData = [link.data, unlink.data, setchannel.data, list.data];
```

`src/discord/commands/register.ts` :
```ts
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadConfig } from "../../config.js";
import { allCommandData } from "./index.js";
import { logger } from "../../log.js";

const cfg = loadConfig();
const rest = new REST({ version: "10" }).setToken(cfg.discordToken);
const body = allCommandData.map(c => c.toJSON());
await rest.put(Routes.applicationCommands(cfg.discordClientId), { body });
logger.info("registered global commands", { count: body.length });
process.exit(0);
```

- [ ] **Step 4 : Commit**

```bash
git add -A
git commit -m "feat(discord): client + slash commands (link/unlink/setchannel/list)"
```

---

## Task 7 : Scheduler tick (TDD)

**Files:**
- Create: `src/scheduler/tick.ts`, `src/scheduler/index.ts`
- Test: `test/tick.test.ts`

- [ ] **Step 1 : Write failing test**

`test/tick.test.ts` :
```ts
import { describe, it, expect, vi } from "vitest";
import { runTickForAccount, TickDeps } from "../src/scheduler/tick.js";
import { AccountRow } from "../src/db/types.js";
import { HenrikMatchT } from "../src/valorant/types.js";

function fakeMatch(id: string, ts: number, puuid: string): HenrikMatchT {
  return {
    metadata: { matchid: id, map: "Ascent", mode: "Competitive", game_start: ts, game_length: 0, rounds_played: 22 },
    players: { all_players: [
      { puuid, name: "x", tag: "y", team: "Red", character: "Jett",
        stats: { score: 4400, kills: 20, deaths: 15, assists: 5, headshots: 30, bodyshots: 60, legshots: 10 } },
    ]},
    teams: { red: { has_won: true, rounds_won: 13, rounds_lost: 9 }, blue: { has_won: false, rounds_won: 9, rounds_lost: 13 } },
  } as HenrikMatchT;
}

describe("runTickForAccount", () => {
  it("inserts new matches, increments counter, triggers roast at threshold", async () => {
    const acc: AccountRow = {
      id: "acc1", guild_id: "g1", discord_user_id: "u1",
      riot_name: "x", riot_tag: "y", region: "eu",
      pending_match_count: 4, last_match_id: null, disabled: false, created_at: "",
    };
    const m = fakeMatch("M1", 1700000000, "PUUID");

    const henrik = { getCompetitiveMatches: vi.fn().mockResolvedValue([m]) };
    const repo = {
      existingMatchIds: vi.fn().mockResolvedValue(new Set<string>()),
      insertMatch: vi.fn().mockResolvedValue(undefined),
      updateAccountAfterMatch: vi.fn().mockResolvedValue(undefined),
      getRecentMatches: vi.fn().mockResolvedValue([{ raw_stats: { agent: "Jett", map: "Ascent", mode: "Competitive", kills: 20, deaths: 15, assists: 5, acs: 200, hs_pct: 30, rounds_won: 13, rounds_lost: 9, result: "win", played_at: "" } }]),
      disableAccount: vi.fn(),
      getGuild: vi.fn().mockResolvedValue({ guild_id: "g1", roast_channel_id: "c1", created_at: "" }),
    };
    const roast = { generate: vi.fn().mockResolvedValue("ROAST!") };
    const post = vi.fn().mockResolvedValue(undefined);

    const deps: TickDeps = { henrik: henrik as any, repo: repo as any, roast: roast as any, post, threshold: 5, resolvePuuid: async () => "PUUID" };

    await runTickForAccount(acc, deps);

    expect(repo.insertMatch).toHaveBeenCalledTimes(1);
    expect(roast.generate).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("c1", expect.objectContaining({ text: "ROAST!" }));
    expect(repo.updateAccountAfterMatch).toHaveBeenLastCalledWith("acc1", "M1", 0);
  });

  it("does not roast when below threshold", async () => {
    const acc: AccountRow = {
      id: "acc1", guild_id: "g1", discord_user_id: "u1",
      riot_name: "x", riot_tag: "y", region: "eu",
      pending_match_count: 0, last_match_id: null, disabled: false, created_at: "",
    };
    const m = fakeMatch("M1", 1700000000, "PUUID");
    const henrik = { getCompetitiveMatches: vi.fn().mockResolvedValue([m]) };
    const repo = {
      existingMatchIds: vi.fn().mockResolvedValue(new Set()),
      insertMatch: vi.fn(), updateAccountAfterMatch: vi.fn(), getRecentMatches: vi.fn(),
      disableAccount: vi.fn(), getGuild: vi.fn(),
    };
    const roast = { generate: vi.fn() };
    const post = vi.fn();
    await runTickForAccount(acc, { henrik: henrik as any, repo: repo as any, roast: roast as any, post, threshold: 5, resolvePuuid: async () => "PUUID" });
    expect(roast.generate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Run → FAIL**

- [ ] **Step 3 : Write `src/scheduler/tick.ts`**

```ts
import { Repo } from "../db/repo.js";
import { AccountRow } from "../db/types.js";
import { HenrikClient } from "../valorant/henrik.js";
import { HenrikMatchT } from "../valorant/types.js";
import { summarizeMatch } from "../roast/summarize.js";
import { RoastGenerator } from "../roast/generate.js";
import { logger } from "../log.js";

export interface RoastPayload {
  text: string;
  riotName: string;
  riotTag: string;
  discordUserId: string;
}

export interface TickDeps {
  henrik: HenrikClient;
  repo: Repo;
  roast: RoastGenerator;
  post: (channelId: string, payload: RoastPayload) => Promise<void>;
  threshold: number;
  resolvePuuid: (m: HenrikMatchT, name: string, tag: string) => Promise<string>;
}

export async function runTickForAccount(acc: AccountRow, deps: TickDeps): Promise<void> {
  let matches: HenrikMatchT[];
  try {
    matches = await deps.henrik.getCompetitiveMatches(acc.region, acc.riot_name, acc.riot_tag, 5);
  } catch (e: any) {
    if (e?.notFound) {
      logger.warn("henrik 404 → disable account", { id: acc.id });
      await deps.repo.disableAccount(acc.id);
      return;
    }
    if (e?.rateLimited) {
      logger.warn("henrik 429 → skip tick", { id: acc.id });
      return;
    }
    logger.warn("henrik error → skip", { id: acc.id, err: String(e) });
    return;
  }

  if (matches.length === 0) return;

  const ids = matches.map(m => m.metadata.matchid);
  const existing = await deps.repo.existingMatchIds(acc.id, ids);
  const fresh = matches
    .filter(m => !existing.has(m.metadata.matchid))
    .sort((a, b) => a.metadata.game_start - b.metadata.game_start);

  if (fresh.length === 0) return;

  let pending = acc.pending_match_count;
  let lastMatchId = acc.last_match_id ?? "";

  for (const m of fresh) {
    const puuid = await deps.resolvePuuid(m, acc.riot_name, acc.riot_tag);
    const stats = summarizeMatch(m, puuid);
    await deps.repo.insertMatch(acc.id, m.metadata.matchid, stats.played_at, stats);
    pending += 1;
    lastMatchId = m.metadata.matchid;

    if (pending >= deps.threshold) {
      const guild = await deps.repo.getGuild(acc.guild_id);
      const channelId = guild?.roast_channel_id ?? null;

      if (!channelId) {
        logger.info("threshold reached but no roast channel → reset only", { acc: acc.id });
        pending = 0;
        await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
        continue;
      }

      const recent = await deps.repo.getRecentMatches(acc.id, deps.threshold);
      const matchStats = recent.map(r => r.raw_stats);

      try {
        const text = await deps.roast.generate({
          discordUserMention: `<@${acc.discord_user_id}>`,
          riotName: acc.riot_name,
          riotTag: acc.riot_tag,
          matches: matchStats,
        });
        await deps.post(channelId, { text, riotName: acc.riot_name, riotTag: acc.riot_tag, discordUserId: acc.discord_user_id });
        pending = 0;
        await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
      } catch (e) {
        logger.error("roast failed → keep counter", { acc: acc.id, err: String(e) });
        await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
        return;
      }
    } else {
      await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
    }
  }
}

export async function runTick(deps: TickDeps, listAccounts: () => Promise<AccountRow[]>): Promise<void> {
  const accs = await listAccounts();
  for (const acc of accs) {
    try { await runTickForAccount(acc, deps); }
    catch (e) { logger.error("tick failed for account", { id: acc.id, err: String(e) }); }
  }
}
```

- [ ] **Step 4 : Run → PASS**

`npx vitest run test/tick.test.ts`

- [ ] **Step 5 : Write `src/scheduler/index.ts`**

```ts
import cron from "node-cron";
import { TickDeps, runTick } from "./tick.js";
import { Repo } from "../db/repo.js";
import { logger } from "../log.js";

export function startScheduler(repo: Repo, deps: TickDeps, intervalMinutes: number) {
  const expr = `*/${intervalMinutes} * * * *`;
  logger.info("starting scheduler", { expr });
  const job = cron.schedule(expr, async () => {
    try {
      await runTick(deps, () => repo.listAccounts());
    } catch (e) {
      logger.error("tick top-level failure", { err: String(e) });
    }
  });
  return job;
}
```

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "feat(scheduler): per-account tick with roast trigger"
```

---

## Task 8 : Entry point + post adapter

**Files:**
- Create: `src/index.ts`, `src/discord/post.ts`

- [ ] **Step 1 : Create `src/discord/post.ts`**

```ts
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { RoastPayload } from "../scheduler/tick.js";
import { logger } from "../log.js";
import { Repo } from "../db/repo.js";

export function makePoster(client: Client, repo: Repo) {
  return async (channelId: string, payload: RoastPayload): Promise<void> => {
    try {
      const ch = await client.channels.fetch(channelId);
      if (!ch || !ch.isTextBased() || !(ch instanceof TextChannel)) {
        logger.warn("channel not text-based or missing", { channelId });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`🎯 Roast de ${payload.riotName}#${payload.riotTag}`)
        .setDescription(payload.text)
        .setColor(0xff4655);
      await ch.send({ content: `<@${payload.discordUserId}>`, embeds: [embed] });
    } catch (e: any) {
      logger.error("post failed", { channelId, err: String(e) });
      throw e;
    }
  };
}

export async function resolvePuuidFromMatch(m: { players: { all_players: { name: string; tag: string; puuid: string }[] } }, name: string, tag: string): Promise<string> {
  const lower = (s: string) => s.toLowerCase();
  const p = m.players.all_players.find(x => lower(x.name) === lower(name) && lower(x.tag) === lower(tag));
  if (!p) throw new Error(`puuid not found for ${name}#${tag}`);
  return p.puuid;
}
```

- [ ] **Step 2 : Create `src/index.ts`**

```ts
import "dotenv/config";
import { loadConfig } from "./config.js";
import { logger } from "./log.js";
import { makeSupabase } from "./db/client.js";
import { Repo } from "./db/repo.js";
import { makeDiscordClient } from "./discord/client.js";
import { attachInteractionHandler } from "./discord/commands/index.js";
import { HttpHenrikClient } from "./valorant/henrik.js";
import { OpenAIRoastGenerator } from "./roast/generate.js";
import { startScheduler } from "./scheduler/index.js";
import { makePoster, resolvePuuidFromMatch } from "./discord/post.js";

async function main() {
  const cfg = loadConfig();
  logger.info("starting bot-valo");

  const sb = makeSupabase(cfg);
  const repo = new Repo(sb);

  const client = makeDiscordClient();
  attachInteractionHandler(client, repo, cfg.defaultRegion);

  client.once("ready", c => logger.info("discord ready", { tag: c.user.tag }));
  await client.login(cfg.discordToken);

  const henrik = new HttpHenrikClient(cfg.henrikApiKey);
  const roast = new OpenAIRoastGenerator(cfg.openaiApiKey, cfg.openaiModel);
  const post = makePoster(client, repo);

  startScheduler(repo, {
    henrik, repo, roast, post,
    threshold: cfg.roastThreshold,
    resolvePuuid: async (m, name, tag) => resolvePuuidFromMatch(m, name, tag),
  }, cfg.tickIntervalMinutes);

  process.on("SIGINT",  () => { logger.info("shutdown"); client.destroy(); process.exit(0); });
  process.on("SIGTERM", () => { logger.info("shutdown"); client.destroy(); process.exit(0); });
}

main().catch(e => { logger.error("fatal", { err: String(e) }); process.exit(1); });
```

- [ ] **Step 3 : Build**

`npm run build` → 0 erreurs.

- [ ] **Step 4 : Run all tests**

`npm test` → tout vert.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: wire entrypoint, scheduler, post adapter"
```

---

## Task 9 : Smoke test live

- [ ] **Step 1 : `.env` rempli en local** (token, client id, supabase url + service role, openai key, henrik key optionnel).
- [ ] **Step 2 : `npm run db:apply`** — coller le SQL dans Supabase.
- [ ] **Step 3 : `npm run register-commands`** — enregistre les slash commands globaux.
- [ ] **Step 4 : Inviter le bot** sur un serveur de test :
  ```
  https://discord.com/api/oauth2/authorize?client_id=<CLIENT_ID>&permissions=85056&scope=bot%20applications.commands
  ```
- [ ] **Step 5 : `npm run dev`** — vérifier les logs `discord ready` et `starting scheduler`.
- [ ] **Step 6 : Tester** :
  - `/setchannel #salon`
  - `/link user:@toi riot:TonNom#TAG region:eu`
  - `/list`
  - Attendre quelques ticks (jouer 5 matchs comp ou patcher temporairement `ROAST_THRESHOLD=1` dans `.env` pour vérifier la chaîne complète).

---

## README final

- [ ] **Step 1 : Create `README.md`**

Court : install (`npm i`), env, `db:apply`, `register-commands`, `dev`, lien d'invite.

- [ ] **Step 2 : Final commit**

```bash
git add README.md
git commit -m "docs: add README"
```
