import cron from "node-cron";
import { runTick, type TickDeps } from "./tick.js";
import type { Repo } from "../db/repo.js";
import { logger } from "../log.js";

export function startScheduler(
  repo: Repo,
  deps: TickDeps,
  intervalMinutes: number,
) {
  const expr = `*/${intervalMinutes} * * * *`;
  logger.info("starting scheduler", { expr });
  return cron.schedule(expr, async () => {
    try {
      await runTick(deps, () => repo.listAccounts());
    } catch (e) {
      logger.error("tick top-level failure", { err: String(e) });
    }
  });
}
