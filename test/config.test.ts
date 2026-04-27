import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses required env vars", () => {
    const env = {
      DISCORD_TOKEN: "x",
      DISCORD_CLIENT_ID: "1",
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
      OPENAI_API_KEY: "ok",
    };
    const c = loadConfig(env);
    expect(c.discordToken).toBe("x");
    expect(c.tickIntervalMinutes).toBe(2);
    expect(c.roastThreshold).toBe(5);
    expect(c.defaultRegion).toBe("eu");
    expect(c.openaiModel).toBe("gpt-5.4-mini");
  });

  it("throws on missing required env", () => {
    expect(() => loadConfig({})).toThrow();
  });

  it("coerces numeric env vars", () => {
    const env = {
      DISCORD_TOKEN: "x",
      DISCORD_CLIENT_ID: "1",
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
      OPENAI_API_KEY: "ok",
      TICK_INTERVAL_MINUTES: "3",
      ROAST_THRESHOLD: "10",
    };
    const c = loadConfig(env);
    expect(c.tickIntervalMinutes).toBe(3);
    expect(c.roastThreshold).toBe(10);
  });
});
