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
  puuid: string | null;
  region: string;
  pending_match_count: number;
  last_match_id: string | null;
  disabled: boolean;
  created_at: string;
}

export interface MatchStats {
  match_id: string;
  mode: string;
  agent: string;
  map: string;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  hs_pct: number;
  shots: { head: number; body: number; leg: number };
  damage_made: number;
  damage_received: number;
  rounds_won: number;
  rounds_lost: number;
  rounds_played: number;
  result: "win" | "loss" | "draw";
  rank: string | null;
  rr_change: number | null;
  played_at: string;
}

export interface MatchRow {
  match_id: string;
  account_id: string;
  played_at: string;
  raw_stats: MatchStats;
  created_at: string;
}

export interface CurrentRankInfo {
  tier: string;
  elo: number;
  ranking_in_tier: number;
  mmr_change_to_last_game: number;
  highest_tier: string | null;
}
