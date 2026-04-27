import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Probe Henrik endpoints to discover what data is available.
 *
 * Usage:
 *   tsx scripts/probe-henrik.ts <region> <name> <tag>
 *
 * Requires HENRIK_API_KEY in .env (most v3 endpoints are gated now).
 *
 * Dumps each response into ./tmp/henrik/ for inspection.
 */

const API = "https://api.henrikdev.xyz";
const apiKey = process.env.HENRIK_API_KEY;
const [, , region = "eu", name = "TenZ", tag = "0001"] = process.argv;

const headers: Record<string, string> = {
  "User-Agent": "bot-valo-probe/0.1",
};
if (apiKey) headers["Authorization"] = apiKey;

const outDir = resolve(process.cwd(), "tmp/henrik");
mkdirSync(outDir, { recursive: true });

interface Endpoint {
  name: string;
  url: string;
}

const endpoints: Endpoint[] = [
  { name: "account-v1", url: `${API}/valorant/v1/account/${name}/${tag}` },
  { name: "mmr-v2", url: `${API}/valorant/v2/mmr/${region}/${name}/${tag}` },
  { name: "mmr-history-v1", url: `${API}/valorant/v1/mmr-history/${region}/${name}/${tag}` },
  { name: "matches-v3", url: `${API}/valorant/v3/matches/${region}/${name}/${tag}?mode=competitive&size=3` },
  { name: "stored-matches-v1", url: `${API}/valorant/v1/stored-matches/${region}/${name}/${tag}?mode=competitive&size=3` },
  { name: "lifetime-matches-v1", url: `${API}/valorant/v1/lifetime/matches/${region}/${name}/${tag}?mode=competitive&size=3` },
  { name: "mmr-v3", url: `${API}/valorant/v3/mmr/${region}/pc/${name}/${tag}` },
];

async function probe(ep: Endpoint): Promise<void> {
  const res = await fetch(ep.url, { headers });
  const txt = await res.text();
  const path = resolve(outDir, `${ep.name}.json`);
  writeFileSync(path, txt);
  let summary = `${res.status}`;
  try {
    const j = JSON.parse(txt) as { status?: number; errors?: { message?: string }[] };
    if (j.errors) summary += ` ${j.errors[0]?.message ?? ""}`;
    else if (j.status) summary += ` ok`;
  } catch {
    // not json
  }
  console.log(`${ep.name.padEnd(22)} ${ep.url}\n  → ${summary} (${path})`);
}

console.log(`Probing Henrik for ${name}#${tag} (${region})${apiKey ? " [authed]" : " [no key]"}\n`);

for (const ep of endpoints) {
  try {
    await probe(ep);
  } catch (e) {
    console.error(`${ep.name}: ${String(e)}`);
  }
}

console.log(`\nDumps in ${outDir}/`);
