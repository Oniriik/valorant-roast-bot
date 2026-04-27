import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import { ephemeralReply, isAdmin } from "../permissions.js";

export const data = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Lie un compte Valorant à un user Discord (admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addUserOption((o) =>
    o.setName("user").setDescription("Membre Discord").setRequired(true),
  )
  .addStringOption((o) =>
    o.setName("riot").setDescription("Name#TAG").setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("region")
      .setDescription("Région (defaut: eu)")
      .addChoices(
        { name: "EU", value: "eu" },
        { name: "NA", value: "na" },
        { name: "AP", value: "ap" },
        { name: "KR", value: "kr" },
        { name: "LATAM", value: "latam" },
        { name: "BR", value: "br" },
      ),
  );

export function makeHandler(repo: Repo, defaultRegion: string) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    if (!isAdmin(i)) {
      await ephemeralReply(i, "❌ Réservé aux admins (Manage Guild).");
      return;
    }
    const user = i.options.getUser("user", true);
    const riot = i.options.getString("riot", true);
    const region = i.options.getString("region") ?? defaultRegion;
    const m = riot.match(/^(.+)#([^\s#]+)$/);
    if (!m) {
      await ephemeralReply(i, "Format invalide. Attendu: `Name#TAG`.");
      return;
    }
    const [, name, tag] = m as [string, string, string];
    try {
      await repo.createAccount({
        guildId: i.guildId!,
        discordUserId: user.id,
        riotName: name,
        riotTag: tag,
        region,
      });
      await ephemeralReply(
        i,
        `✅ Lié <@${user.id}> → \`${name}#${tag}\` (${region}).`,
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (String(code) === "23505") {
        await ephemeralReply(i, "Ce compte est déjà lié sur ce serveur.");
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await ephemeralReply(i, `Erreur: ${msg}`);
    }
  };
}
