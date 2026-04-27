import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  StoredMatchesResponse,
  MmrHistoryResponse,
} from "../src/valorant/types.js";
import { buildMmrIndex, summarizeStoredMatch } from "../src/roast/summarize.js";

const stored = StoredMatchesResponse.parse(
  JSON.parse(readFileSync("test/fixtures/stored-matches.json", "utf8")),
).data;
const history = MmrHistoryResponse.parse(
  JSON.parse(readFileSync("test/fixtures/mmr-history.json", "utf8")),
).data;

describe("summarizeStoredMatch", () => {
  it("extracts focused stats from a stored match", () => {
    const m = stored[0]!;
    const s = summarizeStoredMatch(m, null, null);
    expect(s.match_id).toBe(m.meta.id);
    expect(s.agent).toBe(m.stats.character.name);
    expect(s.map).toBe(m.meta.map.name);
    expect(s.kills).toBe(m.stats.kills);
    expect(s.deaths).toBe(m.stats.deaths);
    expect(s.assists).toBe(m.stats.assists);
    expect(s.shots).toEqual(m.stats.shots);
    expect(s.damage_made).toBe(m.stats.damage.made);
    expect(s.damage_received).toBe(m.stats.damage.received);
    expect(s.rounds_played).toBe(m.teams.red + m.teams.blue);
    expect(["win", "loss", "draw"]).toContain(s.result);
    expect(s.acs).toBeGreaterThanOrEqual(0);
    expect(s.adr).toBeGreaterThanOrEqual(0);
    expect(s.hs_pct).toBeGreaterThanOrEqual(0);
  });

  it("merges rr change and rank from mmr index", () => {
    const idx = buildMmrIndex(history);
    expect(idx.size).toBeGreaterThan(0);
    // pick a history entry that exists
    const h = history[0]!;
    const fakeMatch = { ...stored[0]!, meta: { ...stored[0]!.meta, id: h.match_id } };
    const e = idx.get(h.match_id)!;
    const s = summarizeStoredMatch(fakeMatch, e.rrChange, e.rankPatched ?? null);
    expect(s.rr_change).toBe(h.mmr_change_to_last_game);
    expect(s.rank).toBe(h.currenttierpatched);
  });
});
