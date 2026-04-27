import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { Repo } from "../../db/repo.js";
import type { AccountRow } from "../../db/types.js";
import { ephemeralReply } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("Liste les comptes Valorant liés sur le serveur")
  .setDMPermission(false)
  .addUserOption((o) =>
    o.setName("user").setDescription("Filtrer sur un user Discord"),
  );

function groupByDiscordUser(accs: AccountRow[]): Map<string, AccountRow[]> {
  const map = new Map<string, AccountRow[]>();
  for (const a of accs) {
    const arr = map.get(a.discord_user_id) ?? [];
    arr.push(a);
    map.set(a.discord_user_id, arr);
  }
  return map;
}

function formatAccount(a: AccountRow): string {
  const flags: string[] = [];
  if (a.disabled) flags.push("désactivé");
  if (!a.puuid) flags.push("sans puuid");
  const suffix = flags.length ? ` — ${flags.join(", ")}` : "";
  return `\`${a.riot_name}#${a.riot_tag}\` (${a.region})${suffix}`;
}

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const user = i.options.getUser("user");
    const accs = await repo.listAccountsForGuild(i.guildId!, user?.id);
    if (accs.length === 0) {
      await ephemeralReply(i, "Aucun compte lié sur ce serveur.");
      return;
    }

    const grouped = groupByDiscordUser(accs);
    const lines: string[] = [];
    for (const [discordId, list] of grouped) {
      lines.push(`<@${discordId}>`);
      for (const a of list) lines.push(`  • ${formatAccount(a)}`);
    }

    await ephemeralReply(i, lines.join("\n"));
  };
}
