import type { Repo } from "../db/repo.js";
import type { AccountRow } from "../db/types.js";
import type { HenrikClient } from "../valorant/henrik.js";
import type { HenrikMatchT } from "../valorant/types.js";
import { summarizeMatch } from "../roast/summarize.js";
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
  resolvePuuid: (m: HenrikMatchT, name: string, tag: string) => Promise<string>;
}

export async function runTickForAccount(
  acc: AccountRow,
  deps: TickDeps,
): Promise<void> {
  let matches: HenrikMatchT[];
  try {
    matches = await deps.henrik.getCompetitiveMatches(
      acc.region,
      acc.riot_name,
      acc.riot_tag,
      5,
    );
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

  if (matches.length === 0) return;

  const ids = matches.map((m) => m.metadata.matchid);
  const existing = await deps.repo.existingMatchIds(acc.id, ids);
  const fresh = matches
    .filter((m) => !existing.has(m.metadata.matchid))
    .sort((a, b) => a.metadata.game_start - b.metadata.game_start);

  if (fresh.length === 0) return;

  let pending = acc.pending_match_count;
  let lastMatchId = acc.last_match_id ?? "";

  for (const m of fresh) {
    let stats;
    try {
      const puuid = await deps.resolvePuuid(m, acc.riot_name, acc.riot_tag);
      stats = summarizeMatch(m, puuid);
    } catch (e) {
      logger.warn("could not summarize match → skip", {
        match: m.metadata.matchid,
        err: String(e),
      });
      continue;
    }

    await deps.repo.insertMatch(acc.id, m.metadata.matchid, stats.played_at, stats);
    pending += 1;
    lastMatchId = m.metadata.matchid;

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

      try {
        const text = await deps.roast.generate({
          discordUserMention: `<@${acc.discord_user_id}>`,
          riotName: acc.riot_name,
          riotTag: acc.riot_tag,
          matches: matchStats,
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
