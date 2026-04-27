import {
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
  MessageFlags,
} from "discord.js";
import type { Repo } from "../../db/repo.js";
import * as link from "./link.js";
import * as unlink from "./unlink.js";
import * as setchannel from "./setchannel.js";
import * as list from "./list.js";
import { logger } from "../../log.js";

export function attachInteractionHandler(
  client: Client,
  repo: Repo,
  defaultRegion: string,
): void {
  const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
    link: link.makeHandler(repo, defaultRegion),
    unlink: unlink.makeHandler(repo),
    setchannel: setchannel.makeHandler(repo),
    list: list.makeHandler(repo),
  };

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const h = handlers[interaction.commandName];
    if (!h) return;
    try {
      await h(interaction);
    } catch (e) {
      logger.error("command failed", {
        cmd: interaction.commandName,
        err: String(e),
      });
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Erreur interne.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
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
  link.data,
  unlink.data,
  setchannel.data,
  list.data,
];
