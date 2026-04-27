import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  StoredMatchesResponse,
  HenrikAccount,
  CurrentMmrResponse,
  MmrHistoryResponse,
} from "../src/valorant/types.js";

function load(name: string) {
  return JSON.parse(readFileSync(`test/fixtures/${name}.json`, "utf8"));
}

describe("henrik zod schemas", () => {
  it("parses stored-matches payload", () => {
    const p = StoredMatchesResponse.parse(load("stored-matches"));
    expect(p.status).toBe(200);
    expect(p.data.length).toBeGreaterThan(0);
    const m = p.data[0]!;
    expect(m.meta.id).toBeTypeOf("string");
    expect(m.stats.character.name).toBeTypeOf("string");
    expect(m.stats.shots.head).toBeTypeOf("number");
  });

  it("parses account payload", () => {
    const p = HenrikAccount.parse(load("account"));
    expect(p.data.puuid).toMatch(/-/);
    expect(p.data.region).toBeTypeOf("string");
  });

  it("parses current mmr v2", () => {
    const p = CurrentMmrResponse.parse(load("mmr-v2"));
    expect(p.data.current_data.currenttierpatched).toBeTypeOf("string");
    expect(p.data.current_data.elo).toBeTypeOf("number");
  });

  it("parses mmr-history", () => {
    const p = MmrHistoryResponse.parse(load("mmr-history"));
    expect(p.data.length).toBeGreaterThan(0);
    const h = p.data[0]!;
    expect(h.match_id).toBeTypeOf("string");
    expect(typeof h.mmr_change_to_last_game).toBe("number");
  });
});
