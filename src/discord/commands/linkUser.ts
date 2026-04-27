import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import type { HenrikClient } from "../../valorant/henrik.js";
import { ephemeralReply, isAdmin } from "../permissions.js";
import { logger } from "../../log.js";

export const data = new SlashCommandBuilder()
  .setName("link-user")
  .setDescription("Lie un compte Valorant à un autre user Discord (admin)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addUserOption((o) =>
    o.setName("user").setDescription("Membre Discord").setRequired(true),
  )
  .addStringOption((o) =>
    o.setName("riot").setDescription("Name#TAG").setRequired(true),
  );

export function makeHandler(repo: Repo, henrik: HenrikClient) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    if (!isAdmin(i)) {
      await ephemeralReply(i, "❌ Réservé aux admins (Manage Guild). Pas pour les civils.");
      return;
    }
    const user = i.options.getUser("user", true);
    const riot = i.options.getString("riot", true);
    const m = riot.match(/^(.+)#([^\s#]+)$/);
    if (!m) {
      await ephemeralReply(i, "Format invalide. C'est `Name#TAG`, pas un mot de passe wifi.");
      return;
    }
    const [, name, tag] = m as [string, string, string];

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await i.editReply("🕵️ Je vérifie que ce compte existe vraiment côté Riot, on sait jamais avec toi…");

    let account: { puuid: string; region: string; name: string; tag: string };
    try {
      account = await henrik.getAccount(name, tag);
    } catch (e) {
      const err = e as { notFound?: boolean; rateLimited?: boolean };
      if (err.notFound) {
        await i.editReply(`❌ Personne sous \`${name}#${tag}\`. Tu m'as fait perdre une requête API pour rien.`);
        return;
      }
      if (err.rateLimited) {
        await i.editReply("Henrik a sucké le serveur. Reviens dans une minute.");
        return;
      }
      logger.error("link-user: getAccount failed", { err: String(e) });
      await i.editReply(`Erreur Henrik : ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    await i.editReply(`📂 Allez, j'inscris <@${user.id}> au registre des stats à pleurer…`);

    try {
      await repo.createAccount({
        guildId: i.guildId!,
        discordUserId: user.id,
        riotName: account.name,
        riotTag: account.tag,
        region: account.region,
        puuid: account.puuid,
      });
      await i.editReply(
        `✅ Affaire classée : <@${user.id}> ↔ \`${account.name}#${account.tag}\` (region ${account.region}). Bonne chance pour le coach.`,
      );
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (String(code) === "23505") {
        await i.editReply("Ce compte est déjà lié ici. Une fois ça suffit largement.");
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await i.editReply(`Erreur DB : ${msg}`);
    }
  };
}
