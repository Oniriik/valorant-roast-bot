import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseHenrikMatches } from "../src/valorant/henrik.js";

const raw = JSON.parse(readFileSync("test/fixtures/henrik-matches.json", "utf8"));

describe("parseHenrikMatches", () => {
  it("returns array of validated matches", () => {
    const out = parseHenrikMatches(raw);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(2);
    expect(out[0]?.metadata.matchid).toBeTypeOf("string");
    expect(out[0]?.players.all_players[0]?.character).toBe("Jett");
  });

  it("rejects malformed payload", () => {
    expect(() => parseHenrikMatches({ status: 200 })).toThrow();
  });
});
