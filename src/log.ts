const levels = ["debug", "info", "warn", "error"] as const;
type Level = typeof levels[number];

const current = (process.env.LOG_LEVEL ?? "info") as Level;
const idx = (l: Level) => levels.indexOf(l);

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (idx(level) < idx(current)) return;
  const line = { ts: new Date().toISOString(), level, msg, ...meta };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else console.log(out);
}

export const logger = {
  debug: (m: string, x?: Record<string, unknown>) => log("debug", m, x),
  info: (m: string, x?: Record<string, unknown>) => log("info", m, x),
  warn: (m: string, x?: Record<string, unknown>) => log("warn", m, x),
  error: (m: string, x?: Record<string, unknown>) => log("error", m, x),
};
