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
  rank: string | null;
  played_at: string;
}

export interface MatchRow {
  match_id: string;
  account_id: string;
  played_at: string;
  raw_stats: MatchStats;
  created_at: string;
}
