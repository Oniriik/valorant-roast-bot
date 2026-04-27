import type { MatchStats } from "../db/types.js";

export interface RoastInput {
  discordUserMention: string;
  riotName: string;
  riotTag: string;
  matches: MatchStats[];
}

export interface RoastPrompt {
  system: string;
  user: string;
}

export interface AggregateStats {
  rank: string;
  kd: string;
  hsPct: string;
  winrate: string;
  winLoss: string;
  mainAgent: string;
  acs: string;
}

export function aggregate(matches: MatchStats[]): AggregateStats {
  if (matches.length === 0) {
    return {
      rank: "Inconnu",
      kd: "N/A",
      hsPct: "N/A",
      winrate: "N/A",
      winLoss: "0W / 0L",
      mainAgent: "Inconnu",
      acs: "N/A",
    };
  }

  const totalKills = matches.reduce((s, m) => s + m.kills, 0);
  const totalDeaths = matches.reduce((s, m) => s + m.deaths, 0);
  const kd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : `${totalKills}.00`;

  const avgHs = Math.round(
    matches.reduce((s, m) => s + m.hs_pct, 0) / matches.length,
  );
  const avgAcs = Math.round(
    matches.reduce((s, m) => s + m.acs, 0) / matches.length,
  );
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const winratePct = Math.round((wins / matches.length) * 100);

  const agentCounts = new Map<string, number>();
  for (const m of matches) agentCounts.set(m.agent, (agentCounts.get(m.agent) ?? 0) + 1);
  const mainAgent =
    [...agentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Inconnu";

  const rank = matches[0]?.rank ?? "Inconnu";

  return {
    rank,
    kd,
    hsPct: `${avgHs}%`,
    winrate: `${winratePct}%`,
    winLoss: `${wins}W / ${losses}L`,
    mainAgent,
    acs: String(avgAcs),
  };
}

export const ROAST_SYSTEM_PROMPT = [
  "Tu es un roast master spécialisé dans les jeux compétitifs comme Valorant.",
  "",
  "Ta mission : faire un roast très sarcastique, drôle et piquant, basé uniquement sur les stats fournies.",
  "",
  "⚠️ Règles importantes :",
  "- Pas d'insultes extrêmes, pas de propos haineux ou discriminants",
  "- Pas d'attaques personnelles (famille, physique, etc.)",
  "- Le roast doit rester centré sur le niveau de jeu et les performances",
  "- Style : agressif, ironique, exagéré, comme un pote très toxique mais drôle",
  "- Utilise des comparaisons absurdes et humiliantes (mais fun)",
  "- Fais plusieurs punchlines courtes + quelques phrases longues bien assassines",
  "- Mentionne le joueur Discord (la mention te sera donnée) au début ou dans la première punchline",
  "- Reste 100% en français",
  "",
  "🎤 Niveau de toxicité : FULL TOXIC (mais drôle, pas haineux)",
  "",
  "Génère un roast structuré, fluide et très impactant.",
].join("\n");

export function buildRoastPrompt(i: RoastInput): RoastPrompt {
  const agg = aggregate(i.matches);

  const detail = i.matches
    .map((m, idx) => {
      const kdMatch = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : `${m.kills}.00`;
      return `Match ${idx + 1}: ${m.agent} sur ${m.map} — ${m.kills}/${m.deaths}/${m.assists} (KD ${kdMatch}), ACS ${m.acs}, HS ${m.hs_pct}%, ${m.result.toUpperCase()} ${m.rounds_won}-${m.rounds_lost}`;
    })
    .join("\n");

  const user = [
    "📊 Stats du joueur :",
    "",
    `Joueur Discord : ${i.discordUserMention}`,
    `Riot ID : ${i.riotName}#${i.riotTag}`,
    `Rank : ${agg.rank}`,
    `K/D : ${agg.kd}`,
    `HS% : ${agg.hsPct}`,
    `Winrate : ${agg.winrate} (${agg.winLoss})`,
    `Main agent : ${agg.mainAgent}`,
    `ACS : ${agg.acs}`,
    "",
    "Détails des derniers matchs comp :",
    detail,
    "",
    "Roast-le maintenant.",
  ].join("\n");

  return { system: ROAST_SYSTEM_PROMPT, user };
}
