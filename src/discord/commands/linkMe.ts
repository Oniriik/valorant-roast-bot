import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import type { HenrikClient } from "../../valorant/henrik.js";
import { ephemeralReply } from "../permissions.js";
import { logger } from "../../log.js";

export const data = new SlashCommandBuilder()
  .setName("link-me")
  .setDescription("Lie ton compte Valorant à ton user Discord")
  .setDMPermission(false)
  .addStringOption((o) =>
    o.setName("riot").setDescription("Name#TAG").setRequired(true),
  );

export function makeHandler(repo: Repo, henrik: HenrikClient) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const riot = i.options.getString("riot", true);
    const m = riot.match(/^(.+)#([^\s#]+)$/);
    if (!m) {
      await ephemeralReply(i, "Format invalide. C'est `Name#TAG`, pas un mot de passe wifi.");
      return;
    }
    const [, name, tag] = m as [string, string, string];

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await i.editReply("📞 J'appelle Riot pour vérifier que t'existes vraiment…");

    let account;
    try {
      account = await henrik.getAccount(name, tag);
    } catch (e) {
      const err = e as { notFound?: boolean; rateLimited?: boolean };
      if (err.notFound) {
        await i.editReply(`❌ Aucun compte Riot trouvé pour \`${name}#${tag}\`. T'as inventé ton pseudo ?`);
        return;
      }
      if (err.rateLimited) {
        await i.editReply("Henrik a sucké le serveur. Reviens dans une minute.");
        return;
      }
      logger.error("link-me: getAccount failed", { err: String(e) });
      await i.editReply(`Erreur Henrik : ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    await i.editReply("💾 Je te rajoute à la liste des cas désespérés…");

    try {
      await repo.createAccount({
        guildId: i.guildId!,
        discordUserId: i.user.id,
        riotName: account.name,
        riotTag: account.tag,
        region: account.region,
        puuid: account.puuid,
      });
      await i.editReply(
        `✅ T'es lié : \`${account.name}#${account.tag}\` (region ${account.region}). Que ça serve à quelque chose.`,
      );
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (String(code) === "23505") {
        await i.editReply("Ce compte est déjà lié sur ce serveur. Une fois ça suffit, j'aime pas la répétition.");
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await i.editReply(`Erreur DB : ${msg}`);
    }
  };
}
