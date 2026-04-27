import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
  MessageFlags,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import type { HenrikClient } from "../../valorant/henrik.js";
import type { RoastGenerator } from "../../roast/generate.js";
import * as linkMe from "./linkMe.js";
import * as linkUser from "./linkUser.js";
import * as unlink from "./unlink.js";
import * as setchannel from "./setchannel.js";
import * as list from "./list.js";
import * as roast from "./roast.js";
import { logger } from "../../log.js";

export interface CommandDeps {
  repo: Repo;
  henrik: HenrikClient;
  roast: RoastGenerator;
}

export function attachInteractionHandler(client: Client, deps: CommandDeps): void {
  const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
    "link-me": linkMe.makeHandler(deps.repo, deps.henrik),
    "link-user": linkUser.makeHandler(deps.repo, deps.henrik),
    unlink: unlink.makeHandler(deps.repo),
    setchannel: setchannel.makeHandler(deps.repo),
    list: list.makeHandler(deps.repo),
    roast: roast.makeHandler(deps),
  };

  const autocompleters: Record<string, (i: AutocompleteInteraction) => Promise<void>> = {
    unlink: unlink.makeAutocomplete(deps.repo),
    roast: roast.makeAutocomplete(deps.repo),
  };

  const roastSelectHandler = roast.makeSelectHandler(deps);
  const unlinkSelectHandler = unlink.makeSelectHandler(deps.repo);

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const ac = autocompleters[interaction.commandName];
        if (!ac) return;
        try {
          await ac(interaction);
        } catch (e) {
          logger.error("autocomplete failed", {
            cmd: interaction.commandName,
            err: String(e),
          });
          try {
            await interaction.respond([]);
          } catch {
            // ignore
          }
        }
        return;
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === roast.SELECT_CUSTOM_ID) {
          await roastSelectHandler(interaction);
        } else if (interaction.customId === unlink.SELECT_CUSTOM_ID) {
          await unlinkSelectHandler(interaction);
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;
      const h = handlers[interaction.commandName];
      if (!h) return;
      await h(interaction);
    } catch (e) {
      logger.error("interaction failed", { err: String(e) });
      try {
        if (
          interaction.isRepliable() &&
          !(interaction.replied || interaction.deferred)
        ) {
          await interaction.reply({
            content: "Erreur interne.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch {
        // ignore
      }
    }
  });
}

export const allCommandData = [
  linkMe.data,
  linkUser.data,
  unlink.data,
  setchannel.data,
  list.data,
  roast.data,
];
