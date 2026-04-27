import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import { ephemeralReply, isAdmin } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("Retire un lien Valorant (admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addStringOption((o) =>
    o.setName("riot").setDescription("Name#TAG").setRequired(true),
  );

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    if (!isAdmin(i)) {
      await ephemeralReply(i, "❌ Réservé aux admins.");
      return;
    }
    const riot = i.options.getString("riot", true);
    const m = riot.match(/^(.+)#([^\s#]+)$/);
    if (!m) {
      await ephemeralReply(i, "Format invalide. Attendu: `Name#TAG`.");
      return;
    }
    const [, name, tag] = m as [string, string, string];
    const ok = await repo.deleteAccount(i.guildId!, name, tag);
    await ephemeralReply(
      i,
      ok ? `🗑️ \`${name}#${tag}\` retiré.` : "Aucun lien trouvé.",
    );
  };
}
