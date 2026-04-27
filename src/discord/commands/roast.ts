import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import type { HenrikClient } from "../../valorant/henrik.js";
import type { RoastGenerator } from "../../roast/generate.js";
import { buildMmrIndex, summarizeStoredMatch } from "../../roast/summarize.js";
import type { AccountRow, CurrentRankInfo } from "../../db/types.js";
import { logger } from "../../log.js";
import { ephemeralReply } from "../permissions.js";

const COOLDOWN_MS = 5 * 60 * 1000;
const lastRoastByAccount = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName("roast")
  .setDescription("Roast un user lié (cooldown 5 min, posté en public)")
  .setDMPermission(false)
  .addUserOption((o) =>
    o.setName("user").setDescription("Cible du roast").setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("riot")
      .setDescription("Compte précis (si plusieurs liés)")
      .setAutocomplete(true)
      .setRequired(false),
  );

function pickAccount(
  accs: AccountRow[],
  riotProvided: string | null,
): { account?: AccountRow; error?: string } {
  if (accs.length === 0) return { error: "no-accounts" };
  if (riotProvided) {
    const m = riotProvided.match(/^(.+)#([^\s#]+)$/);
    if (!m) return { error: "Format invalide. Attendu : `Name#TAG`." };
    const acc = accs.find(
      (a) => a.riot_name === m[1] && a.riot_tag === m[2],
    );
    if (!acc) return { error: "Ce compte n'est pas lié à ce user sur ce serveur." };
    return { account: acc };
  }
  if (accs.length === 1) return { account: accs[0] };
  return { error: "multi" };
}

export function makeHandler(
  repo: Repo,
  henrik: HenrikClient,
  roast: RoastGenerator,
) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const target = i.options.getUser("user", true);
    const riotOpt = i.options.getString("riot");

    const accs = (await repo.listAccountsForGuild(i.guildId!, target.id)).filter(
      (a) => !a.disabled,
    );

    const pick = pickAccount(accs, riotOpt);
    if (pick.error === "no-accounts") {
      await ephemeralReply(
        i,
        `❌ <@${target.id}> n'a aucun compte Valorant lié.\n\nIl peut le faire lui-même avec \`/link-me riot:Name#TAG\`, ou un admin avec \`/link-user user:@${target.username} riot:Name#TAG\`.`,
      );
      return;
    }
    if (pick.error === "multi") {
      await ephemeralReply(
        i,
        `<@${target.id}> a plusieurs comptes liés : ${accs.map((a) => `\`${a.riot_name}#${a.riot_tag}\``).join(", ")}. Précise lequel via l'option \`riot\`.`,
      );
      return;
    }
    if (pick.error) {
      await ephemeralReply(i, pick.error);
      return;
    }
    const account = pick.account!;

    const now = Date.now();
    const last = lastRoastByAccount.get(account.id) ?? 0;
    const elapsed = now - last;
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      await ephemeralReply(
        i,
        `⏳ Cooldown sur \`${account.riot_name}#${account.riot_tag}\` — réessaie dans **${remaining}s**.`,
      );
      return;
    }
    lastRoastByAccount.set(account.id, now);

    await i.deferReply();

    if (!account.puuid) {
      try {
        const a = await henrik.getAccount(account.riot_name, account.riot_tag);
        await repo.updatePuuid(account.id, a.puuid, a.region);
        account.puuid = a.puuid;
        account.region = a.region;
      } catch (e) {
        logger.warn("/roast: puuid backfill failed", { id: account.id, err: String(e) });
        await i.editReply("Impossible de récupérer le compte côté Riot. Réessaie plus tard.");
        lastRoastByAccount.delete(account.id);
        return;
      }
    }

    try {
      const [storedMatches, mmrHistory, currentMmr] = await Promise.all([
        henrik.getStoredMatches(account.region, account.puuid!, "competitive", 5),
        henrik.getMmrHistory(account.region, account.puuid!).catch(() => []),
        henrik.getCurrentMmr(account.region, account.puuid!).catch(() => null),
      ]);

      if (storedMatches.length === 0) {
        await i.editReply(
          `Aucun match comp récent pour \`${account.riot_name}#${account.riot_tag}\`.`,
        );
        lastRoastByAccount.delete(account.id);
        return;
      }

      // detect riot id rename
      const latest = storedMatches[0]!;
      if (
        latest.stats.name &&
        latest.stats.tag &&
        (latest.stats.name !== account.riot_name || latest.stats.tag !== account.riot_tag)
      ) {
        logger.info("/roast: riot id changed, updating db", {
          from: `${account.riot_name}#${account.riot_tag}`,
          to: `${latest.stats.name}#${latest.stats.tag}`,
        });
        try {
          await repo.updateRiotIdentity(account.id, latest.stats.name, latest.stats.tag);
          account.riot_name = latest.stats.name;
          account.riot_tag = latest.stats.tag;
        } catch (e) {
          logger.warn("riot id update failed", { err: String(e) });
        }
      }

      const mmrIdx = buildMmrIndex(mmrHistory);
      const stats = storedMatches.map((m) => {
        const e = mmrIdx.get(m.meta.id);
        return summarizeStoredMatch(m, e?.rrChange ?? null, e?.rankPatched ?? null);
      });

      const currentRank: CurrentRankInfo | null = currentMmr
        ? {
            tier: currentMmr.current_data.currenttierpatched,
            elo: currentMmr.current_data.elo,
            ranking_in_tier: currentMmr.current_data.ranking_in_tier,
            mmr_change_to_last_game: currentMmr.current_data.mmr_change_to_last_game,
            highest_tier: currentMmr.highest_rank?.patched_tier ?? null,
          }
        : null;

      const text = await roast.generate({
        discordUserMention: `<@${account.discord_user_id}>`,
        riotName: account.riot_name,
        riotTag: account.riot_tag,
        matches: stats,
        currentRank,
      });

      const embed = new EmbedBuilder()
        .setTitle(`🎯 Roast de ${account.riot_name}#${account.riot_tag}`)
        .setDescription(text)
        .setColor(0xff4655);

      const ch = i.channel;
      if (ch instanceof TextChannel) {
        await i.deleteReply().catch(() => {});
        await ch.send({
          content: `<@${account.discord_user_id}>`,
          embeds: [embed],
          allowedMentions: { users: [account.discord_user_id] },
        });
      } else {
        await i.editReply({ content: `<@${account.discord_user_id}>`, embeds: [embed] });
      }
    } catch (e) {
      logger.error("/roast failed", { err: String(e) });
      lastRoastByAccount.delete(account.id);
      await i.editReply(
        `Erreur lors du roast : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };
}

export function makeAutocomplete(repo: Repo) {
  return async (i: AutocompleteInteraction): Promise<void> => {
    const userOpt = i.options.get("user", false);
    const targetId = userOpt?.value as string | undefined;
    if (!targetId) {
      await i.respond([]);
      return;
    }
    const focused = i.options.getFocused();
    const accs = await repo.listAccountsForGuild(i.guildId!, targetId);
    const choices = accs
      .map((a) => `${a.riot_name}#${a.riot_tag}`)
      .filter((s) => s.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await i.respond(choices);
  };
}
