import { z } from "zod";

const Schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  HENRIK_API_KEY: z.string().optional(),
  TICK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(2),
  ROAST_THRESHOLD: z.coerce.number().int().min(1).default(5),
  DEFAULT_REGION: z.enum(["eu", "na", "ap", "kr", "latam", "br"]).default("eu"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  openaiModel: string;
  henrikApiKey?: string;
  tickIntervalMinutes: number;
  roastThreshold: number;
  defaultRegion: string;
  logLevel: string;
}

export function loadConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AppConfig {
  const p = Schema.parse(env);
  return {
    discordToken: p.DISCORD_TOKEN,
    discordClientId: p.DISCORD_CLIENT_ID,
    supabaseUrl: p.SUPABASE_URL,
    supabaseServiceRoleKey: p.SUPABASE_SERVICE_ROLE_KEY,
    openaiApiKey: p.OPENAI_API_KEY,
    openaiModel: p.OPENAI_MODEL,
    henrikApiKey: p.HENRIK_API_KEY,
    tickIntervalMinutes: p.TICK_INTERVAL_MINUTES,
    roastThreshold: p.ROAST_THRESHOLD,
    defaultRegion: p.DEFAULT_REGION,
    logLevel: p.LOG_LEVEL,
  };
}
