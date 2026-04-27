import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { makeSupabase } from "../src/db/client.js";

const cfg = loadConfig();
const sb = makeSupabase(cfg);

const { data: guilds, error: e1 } = await sb.from("guilds").select("*");
const { data: accounts, error: e2 } = await sb.from("valorant_accounts").select("*");
const { data: matches, error: e3 } = await sb
  .from("matches")
  .select("match_id, account_id, played_at, raw_stats, created_at")
  .order("played_at", { ascending: false });

console.log("=== guilds ===");
console.log(JSON.stringify(guilds, null, 2));
console.log("\n=== valorant_accounts ===");
console.log(JSON.stringify(accounts, null, 2));
console.log("\n=== matches (count =", matches?.length ?? 0, ") ===");
console.log(JSON.stringify(matches, null, 2));

if (e1 || e2 || e3) console.error("errors:", { e1, e2, e3 });
process.exit(0);
