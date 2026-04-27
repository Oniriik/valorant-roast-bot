import type { StoredMatchT, MmrHistoryEntryT } from "../valorant/types.js";
import type { MatchStats } from "../db/types.js";

export function summarizeStoredMatch(
  m: StoredMatchT,
  rrChange: number | null = null,
  rankPatched: string | null = null,
): MatchStats {
  const roundsWon =
    m.stats.team.toLowerCase() === "red" ? m.teams.red : m.teams.blue;
  const roundsLost =
    m.stats.team.toLowerCase() === "red" ? m.teams.blue : m.teams.red;
  const roundsPlayed = m.teams.red + m.teams.blue;
  const result: "win" | "loss" | "draw" =
    roundsWon === roundsLost
      ? "draw"
      : roundsWon > roundsLost
        ? "win"
        : "loss";

  const totalShots =
    m.stats.shots.head + m.stats.shots.body + m.stats.shots.leg;
  const hsPct = totalShots > 0 ? (m.stats.shots.head / totalShots) * 100 : 0;
  const acs = roundsPlayed > 0 ? m.stats.score / roundsPlayed : 0;
  const adr = roundsPlayed > 0 ? m.stats.damage.made / roundsPlayed : 0;

  return {
    match_id: m.meta.id,
    mode: m.meta.mode,
    agent: m.stats.character.name,
    map: m.meta.map.name,
    kills: m.stats.kills,
    deaths: m.stats.deaths,
    assists: m.stats.assists,
    acs: Math.round(acs),
    adr: Math.round(adr),
    hs_pct: Math.round(hsPct),
    shots: {
      head: m.stats.shots.head,
      body: m.stats.shots.body,
      leg: m.stats.shots.leg,
    },
    damage_made: m.stats.damage.made,
    damage_received: m.stats.damage.received,
    rounds_won: roundsWon,
    rounds_lost: roundsLost,
    rounds_played: roundsPlayed,
    result,
    rank: rankPatched,
    rr_change: rrChange,
    played_at: m.meta.started_at,
  };
}

export function buildMmrIndex(
  history: MmrHistoryEntryT[],
): Map<string, { rrChange: number; rankPatched: string | null }> {
  const idx = new Map<string, { rrChange: number; rankPatched: string | null }>();
  for (const h of history) {
    idx.set(h.match_id, {
      rrChange: h.mmr_change_to_last_game,
      rankPatched: h.currenttierpatched ?? null,
    });
  }
  return idx;
}
