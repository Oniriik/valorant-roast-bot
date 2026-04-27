import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import { ephemeralReply } from "../permissions.js";

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

export function makeHandler(repo: Repo) {
  return async (i: ChatInputCommandInteraction): Promise<void> => {
    const accs = await repo.listAccountsForGuild(i.guildId!, i.user.id);
    if (accs.length === 0) {
      await ephemeralReply(i, "Tu n'as aucun compte lié sur ce serveur.");
      return;
    }

    const provided = i.options.getString("riot");
    let target: { name: string; tag: string };

    if (provided) {
      const m = provided.match(/^(.+)#([^\s#]+)$/);
      if (!m) {
        await ephemeralReply(i, "Format invalide. Attendu : `Name#TAG`.");
        return;
      }
      target = { name: m[1]!, tag: m[2]! };
    } else if (accs.length === 1) {
      target = { name: accs[0]!.riot_name, tag: accs[0]!.riot_tag };
    } else {
      await ephemeralReply(
        i,
        `Tu as plusieurs comptes liés : ${accs.map((a) => `\`${a.riot_name}#${a.riot_tag}\``).join(", ")}. Précise lequel via l'option \`riot\`.`,
      );
      return;
    }

    const ok = await repo.deleteAccount(i.guildId!, target.name, target.tag);
    await ephemeralReply(
      i,
      ok ? `🗑️ \`${target.name}#${target.tag}\` délié.` : "Aucun lien trouvé.",
    );
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
