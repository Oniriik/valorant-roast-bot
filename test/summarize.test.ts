import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseHenrikMatches } from "../src/valorant/henrik.js";
import { summarizeMatch } from "../src/roast/summarize.js";

const raw = JSON.parse(readFileSync("test/fixtures/henrik-matches.json", "utf8"));
const matches = parseHenrikMatches(raw);

describe("summarizeMatch", () => {
  it("extracts focused stats for the target player (win on Ascent)", () => {
    const m = matches[0]!;
    const s = summarizeMatch(m, "puuid-target-001");
    expect(s.agent).toBe("Jett");
    expect(s.map).toBe("Ascent");
    expect(s.kills).toBe(18);
    expect(s.deaths).toBe(14);
    expect(s.result).toBe("win");
    expect(s.acs).toBe(200);
    expect(s.hs_pct).toBe(30);
    expect(s.rounds_won).toBe(13);
    expect(s.rounds_lost).toBe(9);
  });

  it("computes loss correctly", () => {
    const m = matches[1]!;
    const s = summarizeMatch(m, "puuid-target-001");
    expect(s.result).toBe("loss");
    expect(s.agent).toBe("Reyna");
    expect(s.map).toBe("Bind");
    expect(s.rounds_won).toBe(5);
    expect(s.rounds_lost).toBe(13);
  });

  it("throws when puuid not in match", () => {
    expect(() => summarizeMatch(matches[0]!, "no-such-puuid")).toThrow();
  });
});
