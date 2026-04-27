import { describe, it, expect, vi } from "vitest";
import { runTickForAccount, type TickDeps } from "../src/scheduler/tick.js";
import type { AccountRow } from "../src/db/types.js";
import type { HenrikMatchT } from "../src/valorant/types.js";

function fakeMatch(id: string, ts: number, puuid: string): HenrikMatchT {
  return {
    metadata: {
      matchid: id,
      map: "Ascent",
      mode: "Competitive",
      game_start: ts,
      game_length: 0,
      rounds_played: 22,
    },
    players: {
      all_players: [
        {
          puuid,
          name: "x",
          tag: "y",
          team: "Red",
          character: "Jett",
          stats: {
            score: 4400,
            kills: 20,
            deaths: 15,
            assists: 5,
            headshots: 30,
            bodyshots: 60,
            legshots: 10,
          },
        },
      ],
    },
    teams: {
      red: { has_won: true, rounds_won: 13, rounds_lost: 9 },
      blue: { has_won: false, rounds_won: 9, rounds_lost: 13 },
    },
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
          mode: "Competitive",
          agent: "Jett",
          map: "Ascent",
          kills: 20,
          deaths: 15,
          assists: 5,
          acs: 200,
          hs_pct: 30,
          rounds_won: 13,
          rounds_lost: 9,
          result: "win",
          played_at: "",
        },
      },
    ]),
    disableAccount: vi.fn().mockResolvedValue(undefined),
    getGuild: vi.fn().mockResolvedValue({
      guild_id: "g1",
      roast_channel_id: "c1",
      created_at: "",
    }),
    ...overrides,
  };
}

const baseAcc = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  id: "acc1",
  guild_id: "g1",
  discord_user_id: "u1",
  riot_name: "x",
  riot_tag: "y",
  region: "eu",
  pending_match_count: 0,
  last_match_id: null,
  disabled: false,
  created_at: "",
  ...overrides,
});

describe("runTickForAccount", () => {
  it("inserts new matches, increments counter, triggers roast at threshold", async () => {
    const acc = baseAcc({ pending_match_count: 4 });
    const m = fakeMatch("M1", 1700000000, "PUUID");

    const henrik = { getCompetitiveMatches: vi.fn().mockResolvedValue([m]) };
    const repo = makeRepo();
    const roast = { generate: vi.fn().mockResolvedValue("ROAST!") };
    const post = vi.fn().mockResolvedValue(undefined);

    const deps: TickDeps = {
      henrik: henrik as never,
      repo: repo as never,
      roast: roast as never,
      post,
      threshold: 5,
      resolvePuuid: async () => "PUUID",
    };

    await runTickForAccount(acc, deps);

    expect(repo.insertMatch).toHaveBeenCalledTimes(1);
    expect(roast.generate).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ text: "ROAST!" }),
    );
    expect(repo.updateAccountAfterMatch).toHaveBeenLastCalledWith(
      "acc1",
      "M1",
      0,
    );
  });

  it("does not roast when below threshold", async () => {
    const acc = baseAcc({ pending_match_count: 0 });
    const m = fakeMatch("M1", 1700000000, "PUUID");
    const henrik = { getCompetitiveMatches: vi.fn().mockResolvedValue([m]) };
    const repo = makeRepo();
    const roast = { generate: vi.fn() };
    const post = vi.fn();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: roast as never,
      post,
      threshold: 5,
      resolvePuuid: async () => "PUUID",
    });
    expect(roast.generate).not.toHaveBeenCalled();
    expect(repo.updateAccountAfterMatch).toHaveBeenCalledWith("acc1", "M1", 1);
  });

  it("disables account on Henrik 404", async () => {
    const acc = baseAcc();
    const err = Object.assign(new Error("nope"), { notFound: true });
    const henrik = { getCompetitiveMatches: vi.fn().mockRejectedValue(err) };
    const repo = makeRepo();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: { generate: vi.fn() } as never,
      post: vi.fn(),
      threshold: 5,
      resolvePuuid: async () => "PUUID",
    });
    expect(repo.disableAccount).toHaveBeenCalledWith("acc1");
  });

  it("skips already-seen matches", async () => {
    const acc = baseAcc({ pending_match_count: 0 });
    const m = fakeMatch("M1", 1700000000, "PUUID");
    const henrik = { getCompetitiveMatches: vi.fn().mockResolvedValue([m]) };
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
      resolvePuuid: async () => "PUUID",
    });
    expect(repo.insertMatch).not.toHaveBeenCalled();
    expect(roast.generate).not.toHaveBeenCalled();
  });

  it("resets counter without posting if no roast channel configured", async () => {
    const acc = baseAcc({ pending_match_count: 4 });
    const m = fakeMatch("M1", 1700000000, "PUUID");
    const henrik = { getCompetitiveMatches: vi.fn().mockResolvedValue([m]) };
    const repo = makeRepo({
      getGuild: vi.fn().mockResolvedValue({
        guild_id: "g1",
        roast_channel_id: null,
        created_at: "",
      }),
    });
    const roast = { generate: vi.fn() };
    const post = vi.fn();
    await runTickForAccount(acc, {
      henrik: henrik as never,
      repo: repo as never,
      roast: roast as never,
      post,
      threshold: 5,
      resolvePuuid: async () => "PUUID",
    });
    expect(roast.generate).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(repo.updateAccountAfterMatch).toHaveBeenLastCalledWith(
      "acc1",
      "M1",
      0,
    );
  });
});
