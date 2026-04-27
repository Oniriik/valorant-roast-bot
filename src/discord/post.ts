import { type Client, TextChannel } from "discord.js";
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
      await ch.send({
        content: payload.text,
        allowedMentions: { users: [payload.discordUserId] },
      });
    } catch (e) {
      logger.error("post failed", { channelId, err: String(e) });
      throw e;
    }
  };
}
