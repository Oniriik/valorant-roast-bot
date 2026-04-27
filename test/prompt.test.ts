import { describe, it, expect } from "vitest";
import { buildRoastPrompt } from "../src/roast/prompt.js";
import type { MatchStats, CurrentRankInfo } from "../src/db/types.js";

const sampleMatch = (
  overrides: Partial<MatchStats> = {},
): MatchStats => ({
  match_id: "m1",
  mode: "Competitive",
  agent: "Jett",
  map: "Ascent",
  kills: 18,
  deaths: 14,
  assists: 4,
  acs: 220,
  adr: 160,
  hs_pct: 32,
  shots: { head: 25, body: 35, leg: 5 },
  damage_made: 4400,
  damage_received: 3000,
  rounds_won: 13,
  rounds_lost: 11,
  rounds_played: 24,
  result: "win",
  rank: "Immortal 2",
  rr_change: 18,
  played_at: "2026-04-27T08:20:40.219Z",
  ...overrides,
});

describe("buildRoastPrompt", () => {
  it("uses [user] placeholder (not the raw mention) and embeds all stats", () => {
    const r = buildRoastPrompt({
      discordUserMention: "<@123>",
      riotName: "Bob",
      riotTag: "EUW",
      matches: [sampleMatch(), sampleMatch({ result: "loss", rr_change: -22 })],
    });
    expect(r.system).toMatch(/français/i);
    expect(r.system).toMatch(/tutoie/i);
    expect(r.system).toMatch(/\[user\]/);
    expect(r.system).toMatch(/whiff|tilt|throw/i);
    expect(r.user).toContain("[user]");
    expect(r.user).not.toContain("<@123>");
    expect(r.user).toContain("Bob#EUW");
    expect(r.user).toContain("Jett");
    expect(r.user).toContain("WIN");
    expect(r.user).toContain("LOSS");
    expect(r.user).toContain("head 25");
  });

  it("renders RR sum (negative cumulative)", () => {
    const r = buildRoastPrompt({
      discordUserMention: "<@1>",
      riotName: "X",
      riotTag: "Y",
      matches: [
        sampleMatch({ rr_change: -22, result: "loss" }),
        sampleMatch({ rr_change: -18, result: "loss" }),
        sampleMatch({ rr_change: 14, result: "win" }),
      ],
    });
    expect(r.user).toContain("-26 RR");
  });

  it("uses currentRank if provided", () => {
    const cr: CurrentRankInfo = {
      tier: "Immortal 2",
      elo: 2276,
      ranking_in_tier: 76,
      mmr_change_to_last_game: -18,
      highest_tier: "Immortal 3",
    };
    const r = buildRoastPrompt({
      discordUserMention: "<@1>",
      riotName: "X",
      riotTag: "Y",
      matches: [sampleMatch()],
      currentRank: cr,
    });
    expect(r.user).toContain("Immortal 2");
    expect(r.user).toContain("2276 elo");
    expect(r.user).toContain("peak Immortal 3");
  });
});
