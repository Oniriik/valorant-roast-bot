import type { Repo } from "../db/repo.js";
import type { AccountRow, CurrentRankInfo } from "../db/types.js";
import type { HenrikClient } from "../valorant/henrik.js";
import { buildMmrIndex, summarizeStoredMatch } from "../roast/summarize.js";
import type { RoastGenerator } from "../roast/generate.js";
import { logger } from "../log.js";

export interface RoastPayload {
  text: string;
  riotName: string;
  riotTag: string;
  discordUserId: string;
}

export interface TickDeps {
  henrik: HenrikClient;
  repo: Repo;
  roast: RoastGenerator;
  post: (channelId: string, payload: RoastPayload) => Promise<void>;
  threshold: number;
}

async function ensurePuuid(
  acc: AccountRow,
  deps: TickDeps,
): Promise<{ puuid: string; region: string } | null> {
  if (acc.puuid) return { puuid: acc.puuid, region: acc.region };
  try {
    const a = await deps.henrik.getAccount(acc.riot_name, acc.riot_tag);
    await deps.repo.updatePuuid(acc.id, a.puuid, a.region);
    logger.info("backfilled puuid", { id: acc.id });
    return { puuid: a.puuid, region: a.region };
  } catch (e) {
    const err = e as { notFound?: boolean };
    if (err.notFound) {
      logger.warn("backfill: account not found, disabling", { id: acc.id });
      await deps.repo.disableAccount(acc.id);
    } else {
      logger.warn("backfill: failed", { id: acc.id, err: String(e) });
    }
    return null;
  }
}

export async function runTickForAccount(
  acc: AccountRow,
  deps: TickDeps,
): Promise<void> {
  const id = await ensurePuuid(acc, deps);
  if (!id) return;
  const { puuid, region } = id;

  let storedMatches;
  try {
    storedMatches = await deps.henrik.getStoredMatches(region, puuid, "competitive", 5);
  } catch (e: unknown) {
    const err = e as { notFound?: boolean; rateLimited?: boolean };
    if (err.notFound) {
      logger.warn("henrik 404 → disable account", { id: acc.id });
      await deps.repo.disableAccount(acc.id);
      return;
    }
    if (err.rateLimited) {
      logger.warn("henrik 429 → skip tick", { id: acc.id });
      return;
    }
    logger.warn("henrik error → skip", { id: acc.id, err: String(e) });
    return;
  }

  if (storedMatches.length === 0) return;

  // detect riot id rename via the most recent match
  const latest = storedMatches[0]!;
  const apiName = latest.stats.name;
  const apiTag = latest.stats.tag;
  if (apiName && apiTag && (apiName !== acc.riot_name || apiTag !== acc.riot_tag)) {
    logger.info("detected riot id change → updating", {
      id: acc.id,
      from: `${acc.riot_name}#${acc.riot_tag}`,
      to: `${apiName}#${apiTag}`,
    });
    try {
      await deps.repo.updateRiotIdentity(acc.id, apiName, apiTag);
      acc.riot_name = apiName;
      acc.riot_tag = apiTag;
    } catch (e) {
      logger.warn("riot id update failed", { id: acc.id, err: String(e) });
    }
  }

  const ids = storedMatches.map((m) => m.meta.id);
  const existing = await deps.repo.existingMatchIds(acc.id, ids);
  const fresh = storedMatches
    .filter((m) => !existing.has(m.meta.id))
    .sort(
      (a, b) => new Date(a.meta.started_at).getTime() - new Date(b.meta.started_at).getTime(),
    );

  if (fresh.length === 0) return;

  // fetch mmr-history once for RR enrichment of new matches
  let mmrIdx: ReturnType<typeof buildMmrIndex> = new Map();
  try {
    const history = await deps.henrik.getMmrHistory(region, puuid);
    mmrIdx = buildMmrIndex(history);
  } catch (e) {
    logger.warn("mmr-history fetch failed; matches will lack RR", {
      id: acc.id,
      err: String(e),
    });
  }

  let pending = acc.pending_match_count;
  let lastMatchId = acc.last_match_id ?? "";

  for (const m of fresh) {
    const e = mmrIdx.get(m.meta.id);
    const stats = summarizeStoredMatch(
      m,
      e?.rrChange ?? null,
      e?.rankPatched ?? null,
    );
    await deps.repo.insertMatch(acc.id, m.meta.id, stats.played_at, stats);
    pending += 1;
    lastMatchId = m.meta.id;

    if (pending >= deps.threshold) {
      const guild = await deps.repo.getGuild(acc.guild_id);
      const channelId = guild?.roast_channel_id ?? null;

      if (!channelId) {
        logger.info("threshold reached but no roast channel → reset only", {
          acc: acc.id,
        });
        pending = 0;
        await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
        continue;
      }

      const recent = await deps.repo.getRecentMatches(acc.id, deps.threshold);
      const matchStats = recent.map((r) => r.raw_stats);

      let currentRank: CurrentRankInfo | null = null;
      try {
        const mmr = await deps.henrik.getCurrentMmr(region, puuid);
        currentRank = {
          tier: mmr.current_data.currenttierpatched,
          elo: mmr.current_data.elo,
          ranking_in_tier: mmr.current_data.ranking_in_tier,
          mmr_change_to_last_game: mmr.current_data.mmr_change_to_last_game,
          highest_tier: mmr.highest_rank?.patched_tier ?? null,
        };
      } catch (err) {
        logger.warn("current-mmr fetch failed", { id: acc.id, err: String(err) });
      }

      try {
        const text = await deps.roast.generate({
          discordUserMention: `<@${acc.discord_user_id}>`,
          riotName: acc.riot_name,
          riotTag: acc.riot_tag,
          matches: matchStats,
          currentRank,
        });
        await deps.post(channelId, {
          text,
          riotName: acc.riot_name,
          riotTag: acc.riot_tag,
          discordUserId: acc.discord_user_id,
        });
        pending = 0;
        await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
      } catch (e) {
        logger.error("roast/post failed → keep counter", {
          acc: acc.id,
          err: String(e),
        });
        await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
        return;
      }
    } else {
      await deps.repo.updateAccountAfterMatch(acc.id, lastMatchId, pending);
    }
  }
}

export async function runTick(
  deps: TickDeps,
  listAccounts: () => Promise<AccountRow[]>,
): Promise<void> {
  const accs = await listAccounts();
  for (const acc of accs) {
    try {
      await runTickForAccount(acc, deps);
    } catch (e) {
      logger.error("tick failed for account", { id: acc.id, err: String(e) });
    }
  }
}
