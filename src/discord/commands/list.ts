import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { Repo } from "../../db/repo.js";
import { ephemeralReply } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("Liste les comptes Valorant liés")
  .setDMPermission(false)
  .addUserOption((o) =>
    o.setName("user").setDescription("Filtrer sur un user"),
  );

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const user = i.options.getUser("user");
    const accs = await repo.listAccountsForGuild(i.guildId!, user?.id);
    if (accs.length === 0) {
      await ephemeralReply(i, "Rien à afficher.");
      return;
    }
    const lines = accs.map(
      (a) =>
        `• <@${a.discord_user_id}> → \`${a.riot_name}#${a.riot_tag}\` (${a.region})${a.disabled ? " — désactivé" : ""}`,
    );
    await ephemeralReply(i, lines.join("\n"));
  };
}
