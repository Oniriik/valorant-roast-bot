import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import { ephemeralReply } from "../permissions.js";

const SELECT_PREFIX = "unlink-pick";
const SELECT_TTL_MS = 10 * 60 * 1000;

interface PendingPick {
  guildId: string;
  invokerId: string;
  expiresAt: number;
  accountIds: Set<string>;
}
const pendingPicks = new Map<string, PendingPick>();

function purgeExpiredPicks(): void {
  const now = Date.now();
  for (const [k, v] of pendingPicks) if (v.expiresAt < now) pendingPicks.delete(k);
}

export const data = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("Délie un de tes comptes Valorant")
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName("riot")
      .setDescription("Compte à délier (laisse vide si tu n'en as qu'un)")
      .setAutocomplete(true)
      .setRequired(false),
  );

export const SELECT_CUSTOM_ID = SELECT_PREFIX;

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const accs = await repo.listAccountsForGuild(i.guildId!, i.user.id);
    if (accs.length === 0) {
      await ephemeralReply(
        i,
        "T'as rien à délier. Tu te rappelles même plus que t'as jamais link, sérieux ?",
      );
      return;
    }

    const provided = i.options.getString("riot");

    if (provided) {
      const m = provided.match(/^(.+)#([^\s#]+)$/);
      if (!m) {
        await ephemeralReply(i, "Format invalide. C'est `Name#TAG`, pas du braille.");
        return;
      }
      const ok = await repo.deleteAccount(i.guildId!, m[1]!, m[2]!);
      await ephemeralReply(
        i,
        ok
          ? `🗑️ \`${m[1]}#${m[2]}\` viré. T'as enfin compris que c'était irrécupérable.`
          : "Aucun lien trouvé sous ce nom. Tu fantasmes ?",
      );
      return;
    }

    if (accs.length === 1) {
      const a = accs[0]!;
      await repo.deleteAccount(i.guildId!, a.riot_name, a.riot_tag);
      await ephemeralReply(
        i,
        `🗑️ \`${a.riot_name}#${a.riot_tag}\` viré. T'as enfin compris que c'était irrécupérable.`,
      );
      return;
    }

    // multi-accounts → select menu
    purgeExpiredPicks();
    const embed = new EmbedBuilder()
      .setTitle("🗑️ Lequel je débranche ?")
      .setDescription(
        `Tu as **${accs.length}** comptes liés. Choisis lequel je vire 👇`,
      )
      .setColor(0xff4655);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(SELECT_PREFIX)
      .setPlaceholder("Choisis un compte à délier…")
      .addOptions(
        accs.map((a) => ({
          label: `${a.riot_name}#${a.riot_tag}`,
          description: `region ${a.region}`,
          value: a.id,
        })),
      );

    pendingPicks.set(SELECT_PREFIX + ":" + i.user.id, {
      guildId: i.guildId!,
      invokerId: i.user.id,
      expiresAt: Date.now() + SELECT_TTL_MS,
      accountIds: new Set(accs.map((a) => a.id)),
    });

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
  };
}

export function makeSelectHandler(repo: Repo) {
  return async (i: StringSelectMenuInteraction): Promise<void> => {
    const accountId = i.values[0]!;
    const pending = pendingPicks.get(SELECT_PREFIX + ":" + i.user.id);
    if (!pending || !pending.accountIds.has(accountId) || pending.expiresAt < Date.now()) {
      await i.update({
        content: "T'as pris trop de temps à choisir. Refais `/unlink`.",
        embeds: [],
        components: [],
      });
      return;
    }
    pendingPicks.delete(SELECT_PREFIX + ":" + i.user.id);

    const accs = await repo.listAccountsForGuild(pending.guildId, i.user.id);
    const account = accs.find((a) => a.id === accountId);
    if (!account) {
      await i.update({
        content: "Compte volatilisé entre-temps. Tu rêves ?",
        embeds: [],
        components: [],
      });
      return;
    }

    await repo.deleteAccount(pending.guildId, account.riot_name, account.riot_tag);
    await i.update({
      content: `🗑️ \`${account.riot_name}#${account.riot_tag}\` viré. T'as enfin compris que c'était irrécupérable.`,
      embeds: [],
      components: [],
    });
  };
}

export function makeAutocomplete(repo: Repo) {
  return async (i: AutocompleteInteraction): Promise<void> => {
    const focused = i.options.getFocused();
    const accs = await repo.listAccountsForGuild(i.guildId!, i.user.id);
    const choices = accs
      .map((a) => `${a.riot_name}#${a.riot_tag}`)
      .filter((s) => s.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await i.respond(choices);
  };
}
