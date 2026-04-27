import {
  type Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import type { RoastPayload } from "../scheduler/tick.js";
import { logger } from "../log.js";

export function makePoster(client: Client) {
  return async (channelId: string, payload: RoastPayload): Promise<void> => {
    try {
      const ch = await client.channels.fetch(channelId);
      if (!ch || !(ch instanceof TextChannel)) {
        logger.warn("channel not text-based or missing", { channelId });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`🎯 Roast de ${payload.riotName}#${payload.riotTag}`)
        .setDescription(payload.text)
        .setColor(0xff4655);
      await ch.send({
        content: `<@${payload.discordUserId}>`,
        embeds: [embed],
        allowedMentions: { users: [payload.discordUserId] },
      });
    } catch (e) {
      logger.error("post failed", { channelId, err: String(e) });
      throw e;
    }
  };
}

export async function resolvePuuidFromMatch(
  m: {
    players: { all_players: { name: string; tag: string; puuid: string }[] };
  },
  name: string,
  tag: string,
): Promise<string> {
  const lower = (s: string) => s.toLowerCase();
  const p = m.players.all_players.find(
    (x) => lower(x.name) === lower(name) && lower(x.tag) === lower(tag),
  );
  if (!p) throw new Error(`puuid not found for ${name}#${tag}`);
  return p.puuid;
}
