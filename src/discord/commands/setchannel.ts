import {
  ChannelType,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import { ephemeralReply, isAdmin } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("setchannel")
  .setDescription("Définit le channel de roast (admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Channel texte")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    if (!isAdmin(i)) {
      await ephemeralReply(i, "❌ Réservé aux admins. Pas pour les civils.");
      return;
    }
    const ch = i.options.getChannel("channel", true);
    await repo.setRoastChannel(i.guildId!, ch.id);
    await ephemeralReply(i, `📍 Channel des roasts mis à jour. Préparez l'infirmerie : <#${ch.id}>.`);
  };
}
