import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadConfig } from "../../config.js";
import { allCommandData } from "./index.js";
import { logger } from "../../log.js";

const cfg = loadConfig();
const rest = new REST({ version: "10" }).setToken(cfg.discordToken);
const body = allCommandData.map((c) => c.toJSON());

const guildId = process.env.GUILD_ID ?? process.argv[2];
if (guildId) {
  await rest.put(
    Routes.applicationGuildCommands(cfg.discordClientId, guildId),
    { body },
  );
  logger.info("registered guild commands (instant)", {
    guildId,
    count: body.length,
  });
} else {
  await rest.put(Routes.applicationCommands(cfg.discordClientId), { body });
  logger.info("registered global commands (may take up to 1h)", {
    count: body.length,
  });
}
process.exit(0);
