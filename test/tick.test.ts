import { describe, it, expect, vi } from "vitest";
import { runTickForAccount, type TickDeps } from "../src/scheduler/tick.js";
import type { AccountRow } from "../src/db/types.js";
import type { StoredMatchT } from "../src/valorant/types.js";

function fakeStored(id: string, started: string): StoredMatchT {
  return {
    meta: {
      id,
      map: { id: "x", name: "Ascent" },
      mode: "Competitive",
      started_at: started,
    },
    stats: {
      puuid: "puuid",
      name: "Bob",
      tag: "euw",
      team: "Red",
      character: { id: "x", name: "Jett" },
      score: 4400,
      kills: 20,
      deaths: 15,
      assists: 5,
      shots: { head: 30, body: 60, leg: 10 },
      damage: { made: 4400, received: 3000 },
    },
    teams: { red: 13, blue: 9 },
  };
}

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    existingMatchIds: vi.fn().mockResolvedValue(new Set<string>()),
    insertMatch: vi.fn().mockResolvedValue(undefined),
    updateAccountAfterMatch: vi.fn().mockResolvedValue(undefined),
    getRecentMatches: vi.fn().mockResolvedValue([
      {
        raw_stats: {
          match_id: "M1",
          mode: "Competitive",
          agent: "Jett",
          map: "Ascent",
          kills: 20,
          deaths: 15,
          assists: 5,
          acs: 200,
          adr: 200,
          hs_pct: 30,
          shots: { head: 30, body: 60, leg: 10 },
          damage_made: 4400,
          damage_received: 3000,
          rounds_won: 13,
          rounds_lost: 9,
          rounds_played: 22,
          result: "win",
          rank: "Immortal 2",
          rr_change: 14,
          played_at: "2026-04-27T08:20:40.219Z",
        },
      },
    ]),
    disableAccount: vi.fn().mockResolvedValue(undefined),
    getGuild: vi.fn().mockResolvedValue({
      guild_id: "g1",
      roast_channel_id: "c1",
      created_at: "",
    }),
    updatePuuid: vi.fn().mockResolvedValue(undefined),
    updateRiotIdentity: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseAcc = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  id: "acc1",
  guild_id: "g1",
  discord_user_id: "u1",
  riot_name: "Bob",
  riot_tag: "euw",
  puuid: "puuid-existing",
  region: "eu",
  pending_match_count: 0,
  last_match_id: null,
  disabled: false,
  created_at: "",
  ...overrides,
});

const henrikOk = (matches: StoredMatchT[], history: { match_id: string; mmr_change_to_last_game: number; currenttierpatched?: string }[] = []) => ({
  getAccount: vi.fn(),
  getStoredMatches: vi.fn().mockResolvedValue(matches),
  getMmrHistory: vi.fn().mockResolvedValue(history),
  getCurrentMmr: vi.fn().mockResolvedValue({
    name: "Bob",
    tag: "euw",
    current_data: {
      currenttier: 25,
      currenttierpatched: "Immortal 2",
      ranking_in_tier: 76,
      mmr_change_to_last_game: -18,
      elo: 2276,
    },
    highest_rank: { tier: 26, patched_tier: "Immortal 3" },
  }),
});

describe("runTickForAccount", () => {
  it("inserts new match, increments counter, triggers roast at threshold", async () => {
    const acc = baseAcc({ pending_match_count: 4 });
    const m = fakeStored("M1", "2026-04-27T08:20:40Z");
    const henrik = henrikOk([m], [{ match_id: "M1", mmr_change_to_last_game: -18, currenttierpatched: "Immortal 2" }]);
    const repo = makeRepo();
    const roast = { generate: vi.fn().mockResolvedValue("ROAST!") };
    const post = vi.fn().mockResolvedValue(undefined);

    const deps: TickDeps = {
      henrik: henrik as never,
      repo: repo as never,
      roast: roast as never,
      post,
      threshold: 5,
    };

    await runTickForAccount(acc, deps);

    expect(repo.insertMatch).toHaveBeenCalledTimes(1);
    expect(roast.generate).toHaveBeenCalledTimes(1);
    expect(roast.generate.mock.calls[0]![0].currentRank?.tier).toBe("Immortal 2");
    expect(post).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ text: "ROAST!" }),
    );
    expect(repo.updateAccountAfterMatch).toHaveBeenLastCalledWith("acc1", "M1", 0);
  });

  it("does not roast when below threshold", async () => {
    const acc = baseAcc({ pending_match_count: 0 });
    const m = fakeStored("M1", "2026-04-27T08:20:40Z");
    const henrik = henrikOk([m]);
    const repo = makeRepo();
    const roast = { generate: vi.fn() };
    const post = vi.fn();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: roast as never,
      post,
      threshold: 5,
    });
    expect(roast.generate).not.toHaveBeenCalled();
    expect(repo.updateAccountAfterMatch).toHaveBeenCalledWith("acc1", "M1", 1);
  });

  it("disables account on Henrik 404", async () => {
    const acc = baseAcc();
    const err = Object.assign(new Error("nope"), { notFound: true });
    const henrik = {
      getAccount: vi.fn(),
      getStoredMatches: vi.fn().mockRejectedValue(err),
      getMmrHistory: vi.fn(),
      getCurrentMmr: vi.fn(),
    };
    const repo = makeRepo();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: { generate: vi.fn() } as never,
      post: vi.fn(),
      threshold: 5,
    });
    expect(repo.disableAccount).toHaveBeenCalledWith("acc1");
  });

  it("skips already-seen matches", async () => {
    const acc = baseAcc({ pending_match_count: 0 });
    const m = fakeStored("M1", "2026-04-27T08:20:40Z");
    const henrik = henrikOk([m]);
    const repo = makeRepo({
      existingMatchIds: vi.fn().mockResolvedValue(new Set(["M1"])),
    });
    const roast = { generate: vi.fn() };
    const post = vi.fn();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: roast as never,
      post,
      threshold: 5,
    });
    expect(repo.insertMatch).not.toHaveBeenCalled();
    expect(roast.generate).not.toHaveBeenCalled();
  });

  it("backfills puuid when missing then proceeds", async () => {
    const acc = baseAcc({ puuid: null, pending_match_count: 0 });
    const m = fakeStored("M1", "2026-04-27T08:20:40Z");
    const henrik = {
      ...henrikOk([m]),
      getAccount: vi.fn().mockResolvedValue({
        puuid: "fresh-puuid",
        region: "eu",
        name: "Bob",
        tag: "euw",
      }),
    };
    const repo = makeRepo();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: { generate: vi.fn() } as never,
      post: vi.fn(),
      threshold: 5,
    });
    expect(henrik.getAccount).toHaveBeenCalledWith("Bob", "euw");
    expect(repo.updatePuuid).toHaveBeenCalledWith("acc1", "fresh-puuid", "eu");
    expect(repo.insertMatch).toHaveBeenCalled();
  });

  it("updates riot identity when api returns a different name/tag", async () => {
    const acc = baseAcc({ pending_match_count: 0 });
    const m = fakeStored("M1", "2026-04-27T08:20:40Z");
    m.stats.name = "BobRenamed";
    m.stats.tag = "ENG";
    const henrik = henrikOk([m]);
    const repo = makeRepo();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: { generate: vi.fn() } as never,
      post: vi.fn(),
      threshold: 5,
    });
    expect(repo.updateRiotIdentity).toHaveBeenCalledWith("acc1", "BobRenamed", "ENG");
  });
});
