import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import type { HenrikClient } from "../../valorant/henrik.js";
import type { RoastGenerator } from "../../roast/generate.js";
import { buildMmrIndex, summarizeStoredMatch } from "../../roast/summarize.js";
import type { AccountRow, CurrentRankInfo } from "../../db/types.js";
import { logger } from "../../log.js";
import { ephemeralReply } from "../permissions.js";

const COOLDOWN_MS = 60 * 60 * 1000;
const lastRoastByAccount = new Map<string, number>();

function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s > 0 ? `${m}min ${s}s` : `${m}min`;
  }
  return `${totalSec}s`;
}

const SELECT_PREFIX = "roast-pick";
const SELECT_TTL_MS = 10 * 60 * 1000;

interface PendingPick {
  guildId: string;
  channelId: string;
  invokerId: string;
  targetId: string;
  expiresAt: number;
  accountIds: Set<string>;
}
const pendingPicks = new Map<string, PendingPick>();

function purgeExpiredPicks(): void {
  const now = Date.now();
  for (const [k, v] of pendingPicks) if (v.expiresAt < now) pendingPicks.delete(k);
}

export const data = new SlashCommandBuilder()
  .setName("roast")
  .setDescription("Roast un user lié (cooldown 1h, posté en public)")
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

export interface RoastDeps {
  repo: Repo;
  henrik: HenrikClient;
  roast: RoastGenerator;
}

async function ensurePuuid(deps: RoastDeps, account: AccountRow): Promise<boolean> {
  if (account.puuid) return true;
  try {
    const a = await deps.henrik.getAccount(account.riot_name, account.riot_tag);
    await deps.repo.updatePuuid(account.id, a.puuid, a.region);
    account.puuid = a.puuid;
    account.region = a.region;
    return true;
  } catch (e) {
    logger.warn("/roast: puuid backfill failed", { id: account.id, err: String(e) });
    return false;
  }
}

type Progress = (text: string) => Promise<void>;

interface ProgressMessages {
  locked: string;
  fetching: string;
  reading: string;
  generating: string;
  sending: string;
}

function progressForSelf(account: AccountRow): ProgressMessages {
  return {
    locked: `🎯 Tu te roast toi-même avec \`${account.riot_name}#${account.riot_tag}\` ? OK, mode auto-flagellation activé.`,
    fetching: "🌐 Je récupère TES propres matchs… ça va piquer en boomerang.",
    reading: "📊 Lecture de tes stats… *soupir profond, je me prépare mentalement*",
    generating: "🔥 J'affûte la lame contre toi-même. Belle initiative, vraiment.",
    sending: "📡 J'envoie. Bonne chance avec ta santé mentale.",
  };
}

function progressForOther(target: { id: string }, account: AccountRow): ProgressMessages {
  return {
    locked: `🎯 Cible verrouillée : <@${target.id}> sur \`${account.riot_name}#${account.riot_tag}\`. Bel acte d'humiliation publique.`,
    fetching: "🌐 Je récupère ses derniers fails… j'ai déjà mal au crâne.",
    reading: "📊 Lecture des stats… *soupir profond*",
    generating: "🔥 Je sors la plume empoisonnée. Ça va piquer plus que ses derniers HS.",
    sending: "📡 Roast envoyé. Que la honte commence.",
  };
}

async function executeRoast(
  deps: RoastDeps,
  channel: TextChannel,
  account: AccountRow,
  msgs: ProgressMessages,
  progress: Progress = async () => {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await progress(msgs.locked);

  if (!(await ensurePuuid(deps, account))) {
    return { ok: false, reason: "Riot ne reconnaît plus ce compte. Soit il a été supprimé, soit il a fui. Compréhensible." };
  }

  try {
    await progress(msgs.fetching);
    const [storedMatches, mmrHistory, currentMmr] = await Promise.all([
      deps.henrik.getStoredMatches(account.region, account.puuid!, "competitive", 5),
      deps.henrik.getMmrHistory(account.region, account.puuid!).catch(() => []),
      deps.henrik.getCurrentMmr(account.region, account.puuid!).catch(() => null),
    ]);

    if (storedMatches.length === 0) {
      return {
        ok: false,
        reason: `Aucun match comp récent pour \`${account.riot_name}#${account.riot_tag}\`. Soit pas joué récemment, soit trop nul pour qu'il reste des stats.`,
      };
    }

    await progress(msgs.reading);

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
        await deps.repo.updateRiotIdentity(account.id, latest.stats.name, latest.stats.tag);
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

    await progress(msgs.generating);
    const text = await deps.roast.generate({
      discordUserMention: `<@${account.discord_user_id}>`,
      riotName: account.riot_name,
      riotTag: account.riot_tag,
      matches: stats,
      currentRank,
    });

    await progress(msgs.sending);
    await channel.send({
      content: text,
      allowedMentions: { users: [account.discord_user_id] },
    });

    // mark these matches as already roasted so the auto-tick doesn't re-roast them
    // 1. insert any not-yet-stored fetched matches into DB (idempotent)
    // 2. reset pending_match_count to 0
    // 3. update last_match_id to the most recent
    try {
      const matchIds = storedMatches.map((m) => m.meta.id);
      const existing = await deps.repo.existingMatchIds(account.id, matchIds);
      const sortedAsc = [...storedMatches].sort(
        (a, b) =>
          new Date(a.meta.started_at).getTime() - new Date(b.meta.started_at).getTime(),
      );
      let lastId = account.last_match_id ?? "";
      for (const m of sortedAsc) {
        lastId = m.meta.id;
        if (existing.has(m.meta.id)) continue;
        const e = mmrIdx.get(m.meta.id);
        const s = summarizeStoredMatch(m, e?.rrChange ?? null, e?.rankPatched ?? null);
        await deps.repo.insertMatch(account.id, m.meta.id, s.played_at, s);
      }
      await deps.repo.updateAccountAfterMatch(account.id, lastId, 0);
    } catch (e) {
      logger.warn("/roast: failed to mark matches as roasted", {
        acc: account.id,
        err: String(e),
      });
    }

    return { ok: true };
  } catch (e) {
    logger.error("/roast failed", { err: String(e) });
    return {
      ok: false,
      reason: `Erreur lors du roast : ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function checkCooldown(accountId: string): { ok: true } | { ok: false; remaining: string } {
  const now = Date.now();
  const last = lastRoastByAccount.get(accountId) ?? 0;
  const elapsed = now - last;
  if (elapsed < COOLDOWN_MS) {
    return { ok: false, remaining: formatRemaining(COOLDOWN_MS - elapsed) };
  }
  return { ok: true };
}

function pickByRiotInput(
  accs: AccountRow[],
  riotProvided: string | null,
): { account?: AccountRow; error?: string; multi?: true } {
  if (accs.length === 0) return { error: "no-accounts" };
  if (riotProvided) {
    const m = riotProvided.match(/^(.+)#([^\s#]+)$/);
    if (!m) return { error: "Format invalide. Attendu : `Name#TAG`." };
    const acc = accs.find((a) => a.riot_name === m[1] && a.riot_tag === m[2]);
    if (!acc) return { error: "Ce compte n'est pas lié à ce user sur ce serveur." };
    return { account: acc };
  }
  if (accs.length === 1) return { account: accs[0] };
  return { multi: true };
}

export function makeHandler(deps: RoastDeps) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const target = i.options.getUser("user", true);
    const riotOpt = i.options.getString("riot");

    const accs = (await deps.repo.listAccountsForGuild(i.guildId!, target.id)).filter(
      (a) => !a.disabled,
    );

    const pick = pickByRiotInput(accs, riotOpt);

    const isSelf = target.id === i.user.id;

    if (pick.error === "no-accounts") {
      const msg = isSelf
        ? `❌ T'as aucun compte lié. Quel courage de pas t'exposer. Fais \`/link-me riot:Name#TAG\` si tu veux te prendre la honte officiellement.`
        : `❌ <@${target.id}> n'a aucun compte lié. Quel courage de pas s'exposer. Demande à un admin \`/link-user\` ou laisse-le faire \`/link-me\` lui-même (s'il ose).`;
      await ephemeralReply(i, msg);
      return;
    }

    if (pick.error) {
      await ephemeralReply(i, pick.error);
      return;
    }

    if (pick.multi) {
      // show select menu in ephemeral embed
      purgeExpiredPicks();
      const ch = i.channel;
      if (!(ch instanceof TextChannel)) {
        await ephemeralReply(i, "Faut un channel texte. Pas un salon vocal.");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🎯 Lequel je démolis ?")
        .setDescription(
          isSelf
            ? `Tu as **${accs.length}** comptes liés. Choisis lequel tu veux te prendre dans la tronche 👇`
            : `<@${target.id}> a **${accs.length}** alts (au moins assume sur un seul). Sélectionne celui à humilier 👇`,
        )
        .setColor(0xff4655);

      const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_PREFIX)
        .setPlaceholder("Choisis un compte…")
        .addOptions(
          accs.map((a) => ({
            label: `${a.riot_name}#${a.riot_tag}`,
            description: `region ${a.region}`,
            value: a.id,
          })),
        );

      pendingPicks.set(SELECT_PREFIX + ":" + i.user.id, {
        guildId: i.guildId!,
        channelId: ch.id,
        invokerId: i.user.id,
        targetId: target.id,
        expiresAt: Date.now() + SELECT_TTL_MS,
        accountIds: new Set(accs.map((a) => a.id)),
      });

      await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const account = pick.account!;
    const cd = checkCooldown(account.id);
    if (!cd.ok) {
      await ephemeralReply(
        i,
        `⏳ J'viens de le rouster, j'ai pas la voix pour deux. Reviens dans **${cd.remaining}**.`,
      );
      return;
    }
    lastRoastByAccount.set(account.id, Date.now());

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const progress: Progress = async (txt) => {
      try {
        await i.editReply({ content: txt });
      } catch {
        // ignore edit failures (interaction may have ended)
      }
    };
    const ch = i.channel;
    if (!(ch instanceof TextChannel)) {
      await i.editReply("Faut un channel texte. Pas un salon vocal.");
      lastRoastByAccount.delete(account.id);
      return;
    }
    const msgs = isSelf ? progressForSelf(account) : progressForOther(target, account);
    const result = await executeRoast(deps, ch, account, msgs, progress);
    if (result.ok) {
      await i.deleteReply().catch(() => {});
    } else {
      await i.editReply(result.reason);
      lastRoastByAccount.delete(account.id);
    }
  };
}

export function makeSelectHandler(deps: RoastDeps) {
  return async (i: StringSelectMenuInteraction): Promise<void> => {
    const accountId = i.values[0]!;
    const pending = pendingPicks.get(SELECT_PREFIX + ":" + i.user.id);
    if (!pending || !pending.accountIds.has(accountId) || pending.expiresAt < Date.now()) {
      await i.update({
        content: "T'as pris trop de temps à choisir. Refais `/roast`.",
        embeds: [],
        components: [],
      });
      return;
    }
    pendingPicks.delete(SELECT_PREFIX + ":" + i.user.id);

    // load the account fresh
    const accs = await deps.repo.listAccountsForGuild(pending.guildId);
    const account = accs.find((a) => a.id === accountId);
    if (!account) {
      await i.update({
        content: "Compte volatilisé entre-temps. Tu rêves ou il s'est unlink ?",
        embeds: [],
        components: [],
      });
      return;
    }

    const cd = checkCooldown(account.id);
    if (!cd.ok) {
      await i.update({
        content: `⏳ J'viens de le rouster, j'ai pas la voix pour deux. Reviens dans **${cd.remaining}**.`,
        embeds: [],
        components: [],
      });
      return;
    }
    lastRoastByAccount.set(account.id, Date.now());

    const isSelf = pending.targetId === i.user.id;
    const msgs = isSelf
      ? progressForSelf(account)
      : progressForOther({ id: pending.targetId }, account);

    // ack the select interaction with the locked message
    await i.update({ content: msgs.locked, embeds: [], components: [] });

    const progress: Progress = async (txt) => {
      try {
        await i.editReply({ content: txt });
      } catch {
        // ignore
      }
    };

    const ch = await i.client.channels.fetch(pending.channelId).catch(() => null);
    if (!(ch instanceof TextChannel)) {
      await i.editReply("Le channel s'est volatilisé. Magique.");
      lastRoastByAccount.delete(account.id);
      return;
    }
    const result = await executeRoast(deps, ch, account, msgs, progress);
    if (result.ok) {
      await i.deleteReply().catch(() => {});
    } else {
      await i.editReply(result.reason);
      lastRoastByAccount.delete(account.id);
    }
  };
}

export const SELECT_CUSTOM_ID = SELECT_PREFIX;

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
