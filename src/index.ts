import "dotenv/config";
import { loadConfig } from "./config.js";
import { logger } from "./log.js";
import { makeSupabase } from "./db/client.js";
import { Repo } from "./db/repo.js";
import { makeDiscordClient } from "./discord/client.js";
import { attachInteractionHandler } from "./discord/commands/index.js";
import { HttpHenrikClient } from "./valorant/henrik.js";
import { AISDKRoastGenerator } from "./roast/generate.js";
import { startScheduler } from "./scheduler/index.js";
import { makePoster } from "./discord/post.js";

async function main() {
  const cfg = loadConfig();
  logger.info("starting bot-valo", {
    tickMin: cfg.tickIntervalMinutes,
    threshold: cfg.roastThreshold,
    model: cfg.openaiModel,
  });

  const sb = makeSupabase(cfg);
  const repo = new Repo(sb);

  const henrik = new HttpHenrikClient(cfg.henrikApiKey);
  const roast = new AISDKRoastGenerator(cfg.openaiApiKey, cfg.openaiModel);

  const client = makeDiscordClient();
  attachInteractionHandler(client, { repo, henrik, roast });

  client.once("ready", (c) => logger.info("discord ready", { tag: c.user.tag }));
  await client.login(cfg.discordToken);

  const post = makePoster(client);

  startScheduler(
    repo,
    {
      henrik,
      repo,
      roast,
      post,
      threshold: cfg.roastThreshold,
    },
    cfg.tickIntervalMinutes,
  );

  const shutdown = (sig: string) => {
    logger.info("shutdown", { sig });
    client.destroy();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  logger.error("fatal", { err: String(e) });
  process.exit(1);
});
