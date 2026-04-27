import type { HenrikMatchT } from "../valorant/types.js";
import type { MatchStats } from "../db/types.js";

export function summarizeMatch(m: HenrikMatchT, puuid: string): MatchStats {
  const p = m.players.all_players.find((x) => x.puuid === puuid);
  if (!p) {
    throw new Error(`player ${puuid} not found in match ${m.metadata.matchid}`);
  }

  const totalShots = p.stats.headshots + p.stats.bodyshots + p.stats.legshots;
  const hsPct = totalShots > 0 ? (p.stats.headshots / totalShots) * 100 : 0;
  const acs =
    m.metadata.rounds_played > 0 ? p.stats.score / m.metadata.rounds_played : 0;

  const teamColor = p.team.toLowerCase();
  const team = teamColor === "red" ? m.teams.red : m.teams.blue;
  const enemy = teamColor === "red" ? m.teams.blue : m.teams.red;
  const result: "win" | "loss" | "draw" = team.has_won
    ? "win"
    : team.rounds_won === enemy.rounds_won
      ? "draw"
      : "loss";

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
    rank: p.currenttier_patched ?? null,
    played_at: new Date(m.metadata.game_start * 1000).toISOString(),
  };
}
