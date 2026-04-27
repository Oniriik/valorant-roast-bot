import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadConfig } from "../../config.js";
import { allCommandData } from "./index.js";
import { logger } from "../../log.js";

const cfg = loadConfig();
const rest = new REST({ version: "10" }).setToken(cfg.discordToken);
const body = allCommandData.map((c) => c.toJSON());
await rest.put(Routes.applicationCommands(cfg.discordClientId), { body });
logger.info("registered global commands", { count: body.length });
process.exit(0);
