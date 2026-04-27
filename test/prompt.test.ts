import { describe, it, expect } from "vitest";
import { buildRoastPrompt } from "../src/roast/prompt.js";
import type { MatchStats } from "../src/db/types.js";

const sampleStats: MatchStats[] = [
  {
    mode: "Competitive",
    agent: "Jett",
    map: "Ascent",
    kills: 12,
    deaths: 18,
    assists: 3,
    acs: 180,
    hs_pct: 20,
    rounds_won: 8,
    rounds_lost: 13,
    result: "loss",
    played_at: new Date().toISOString(),
  },
];

describe("buildRoastPrompt", () => {
  it("includes user mention, riot id and stats summary in user message", () => {
    const r = buildRoastPrompt({
      discordUserMention: "<@123>",
      riotName: "Bob",
      riotTag: "EUW",
      matches: sampleStats,
    });
    expect(r.system).toMatch(/français/i);
    expect(r.user).toContain("<@123>");
    expect(r.user).toContain("Bob#EUW");
    expect(r.user).toContain("Jett");
    expect(r.user).toContain("LOSS");
  });

  it("computes win/loss bilan", () => {
    const r = buildRoastPrompt({
      discordUserMention: "<@1>",
      riotName: "X",
      riotTag: "Y",
      matches: [
        { ...sampleStats[0]!, result: "win" },
        { ...sampleStats[0]!, result: "loss" },
        { ...sampleStats[0]!, result: "win" },
      ],
    });
    expect(r.user).toContain("2W / 1L");
  });
});
