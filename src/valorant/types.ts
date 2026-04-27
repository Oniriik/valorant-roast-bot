import { z } from "zod";

export const HenrikPlayer = z.object({
  puuid: z.string(),
  name: z.string(),
  tag: z.string(),
  team: z.string(),
  character: z.string(),
  currenttier_patched: z.string().optional(),
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

const TeamSummary = z.object({
  has_won: z.boolean(),
  rounds_won: z.number(),
  rounds_lost: z.number(),
});

export const HenrikTeams = z.object({
  red: TeamSummary,
  blue: TeamSummary,
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
export type HenrikPlayerT = z.infer<typeof HenrikPlayer>;
