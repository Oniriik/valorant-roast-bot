import { Client, GatewayIntentBits } from "discord.js";

export function makeDiscordClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds] });
}
