import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../src/config.js";
import { makeSupabase } from "../src/db/client.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(__dir, "../src/db/schema.sql"), "utf8");

console.log("=== schema.sql ===\n");
console.log(sql);
console.log("\n=== Action requise ===");
console.log("Copie le SQL ci-dessus dans Supabase → SQL Editor → Run.");
console.log("Puis presse Entrée ici pour vérifier que les tables existent.");

await new Promise<void>((r) => process.stdin.once("data", () => r()));

const cfg = loadConfig();
const sb = makeSupabase(cfg);
let allOk = true;
for (const t of ["guilds", "valorant_accounts", "matches"]) {
  const { error } = await sb.from(t).select("*", { head: true, count: "exact" }).limit(0);
  if (error) {
    console.error(`KO: ${t} → ${error.message}`);
    allOk = false;
  } else {
    console.log(`OK: ${t}`);
  }
}
process.exit(allOk ? 0 : 1);
