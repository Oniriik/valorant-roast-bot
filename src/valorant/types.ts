import { z } from "zod";

// /v1/account/{name}/{tag}
export const HenrikAccount = z.object({
  status: z.number(),
  data: z.object({
    puuid: z.string(),
    region: z.string(),
    name: z.string(),
    tag: z.string(),
    account_level: z.number().optional(),
  }),
});
export type HenrikAccountT = z.infer<typeof HenrikAccount>;

// /v1/by-puuid/stored-matches/{region}/{puuid}
export const StoredMatch = z.object({
  meta: z.object({
    id: z.string(),
    map: z.object({ id: z.string(), name: z.string() }),
    mode: z.string(),
    started_at: z.string(),
    region: z.string().optional(),
    cluster: z.string().optional(),
  }),
  stats: z.object({
    puuid: z.string(),
    name: z.string().optional(),
    tag: z.string().optional(),
    team: z.string(),
    level: z.number().optional(),
    character: z.object({ id: z.string(), name: z.string() }),
    tier: z.number().optional(),
    score: z.number(),
    kills: z.number(),
    deaths: z.number(),
    assists: z.number(),
    shots: z.object({ head: z.number(), body: z.number(), leg: z.number() }),
    damage: z.object({ made: z.number(), received: z.number() }),
  }),
  teams: z.object({ red: z.number(), blue: z.number() }),
});
export type StoredMatchT = z.infer<typeof StoredMatch>;

export const StoredMatchesResponse = z.object({
  status: z.number(),
  data: z.array(StoredMatch),
});

// /v2/by-puuid/mmr/{region}/{puuid}
export const CurrentMmrResponse = z.object({
  status: z.number(),
  data: z.object({
    name: z.string().optional(),
    tag: z.string().optional(),
    puuid: z.string().optional(),
    current_data: z.object({
      currenttier: z.number(),
      currenttierpatched: z.string(),
      ranking_in_tier: z.number(),
      mmr_change_to_last_game: z.number(),
      elo: z.number(),
      games_needed_for_rating: z.number().optional(),
    }),
    highest_rank: z
      .object({
        tier: z.number(),
        patched_tier: z.string(),
        season: z.string().optional(),
      })
      .optional(),
  }),
});
export type CurrentMmrResponseT = z.infer<typeof CurrentMmrResponse>;

// /v1/by-puuid/mmr-history/{region}/{puuid}
export const MmrHistoryEntry = z.object({
  match_id: z.string(),
  currenttier: z.number().optional(),
  currenttierpatched: z.string().optional(),
  mmr_change_to_last_game: z.number(),
  elo: z.number().optional(),
  date_raw: z.number().optional(),
  map: z
    .object({ id: z.string().optional(), name: z.string().optional() })
    .optional(),
});
export type MmrHistoryEntryT = z.infer<typeof MmrHistoryEntry>;

export const MmrHistoryResponse = z.object({
  status: z.number(),
  data: z.array(MmrHistoryEntry),
});
