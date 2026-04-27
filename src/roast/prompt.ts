import type { CurrentRankInfo, MatchStats } from "../db/types.js";

export interface RoastInput {
  discordUserMention: string;
  riotName: string;
  riotTag: string;
  matches: MatchStats[];
  currentRank?: CurrentRankInfo | null;
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
  adr: string;
  rrSum: string;
}

export function aggregate(matches: MatchStats[], currentRank?: CurrentRankInfo | null): AggregateStats {
  if (matches.length === 0) {
    return {
      rank: currentRank?.tier ?? "Inconnu",
      kd: "N/A",
      hsPct: "N/A",
      winrate: "N/A",
      winLoss: "0W / 0L",
      mainAgent: "Inconnu",
      acs: "N/A",
      adr: "N/A",
      rrSum: "0 RR",
    };
  }

  const totalKills = matches.reduce((s, m) => s + m.kills, 0);
  const totalDeaths = matches.reduce((s, m) => s + m.deaths, 0);
  const kd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : `${totalKills}.00`;

  const avgHs = Math.round(matches.reduce((s, m) => s + m.hs_pct, 0) / matches.length);
  const avgAcs = Math.round(matches.reduce((s, m) => s + m.acs, 0) / matches.length);
  const avgAdr = Math.round(matches.reduce((s, m) => s + m.adr, 0) / matches.length);
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const winratePct = Math.round((wins / matches.length) * 100);

  const agentCounts = new Map<string, number>();
  for (const m of matches) agentCounts.set(m.agent, (agentCounts.get(m.agent) ?? 0) + 1);
  const mainAgent =
    [...agentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Inconnu";

  const rrSum = matches.reduce((s, m) => s + (m.rr_change ?? 0), 0);
  const rrSumStr = rrSum >= 0 ? `+${rrSum} RR` : `${rrSum} RR`;

  const rank = currentRank?.tier ?? matches[0]?.rank ?? "Inconnu";

  return {
    rank,
    kd,
    hsPct: `${avgHs}%`,
    winrate: `${winratePct}%`,
    winLoss: `${wins}W / ${losses}L`,
    mainAgent,
    acs: String(avgAcs),
    adr: String(avgAdr),
    rrSum: rrSumStr,
  };
}

export const ROAST_SYSTEM_PROMPT = [
  "Tu es un roast master spécialisé dans les jeux compétitifs comme Valorant.",
  "",
  "Ta mission : faire un roast très sarcastique, drôle et piquant, basé uniquement sur les stats fournies.",
  "",
  "⚠️ Règles importantes :",
  "- Pas d'insultes extrêmes, pas de propos haineux ou discriminants",
  "- Pas d'attaques personnelles (famille, physique, vie réelle)",
  "- Le roast doit rester centré sur le niveau de jeu et les performances",
  "- Style : agressif, ironique, exagéré, comme un pote très toxique mais drôle",
  "- Utilise des comparaisons absurdes et humiliantes (mais fun)",
  "- Plusieurs punchlines courtes + quelques phrases longues bien assassines",
  "- TU T'ADRESSES DIRECTEMENT au joueur à la 2e personne (\"tu\", pas \"il\") du début à la fin",
  "- Commence par mentionner le joueur Discord (la mention te sera donnée) puis tutoie sec",
  "- Anglicismes et jargon Valorant/FPS bienvenus : whiff, throw, int, feed, diff, clutch, ace, lurk, bait, tilt, ELO hell, smoke, flash, eco, 1v9, hard stuck, smurf, GG ez, uninstall, etc. — c'est naturel pour la communauté",
  "- Reste 100% en français pour la grammaire/structure, anglicismes ponctuels OK",
  "",
  "🎤 Niveau de toxicité : FULL TOXIC (mais drôle, pas haineux)",
  "",
  "Génère un roast structuré, fluide et très impactant.",
].join("\n");

export function buildRoastPrompt(i: RoastInput): RoastPrompt {
  const agg = aggregate(i.matches, i.currentRank);

  const detail = i.matches
    .map((m, idx) => {
      const kdMatch = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : `${m.kills}.00`;
      const rr =
        m.rr_change == null
          ? ""
          : m.rr_change >= 0
            ? `   RR: +${m.rr_change}`
            : `   RR: ${m.rr_change}`;
      const rankPart = m.rank ? `Rank: ${m.rank}` : "";
      return [
        `Match ${idx + 1} — ${m.map} (${m.agent}) → ${m.result.toUpperCase()} ${m.rounds_won}-${m.rounds_lost}`,
        `  K/D/A : ${m.kills}/${m.deaths}/${m.assists} (KD ${kdMatch})  ACS ${m.acs}  ADR ${m.adr}  HS ${m.hs_pct}% (head ${m.shots.head} / body ${m.shots.body} / leg ${m.shots.leg})`,
        `  Damage: ${m.damage_made} inflicted / ${m.damage_received} received`,
        rankPart || rr ? `  ${rankPart}${rr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const rankLine = i.currentRank
    ? `Rank actuel : ${i.currentRank.tier} (${i.currentRank.elo} elo${
        i.currentRank.highest_tier ? `, peak ${i.currentRank.highest_tier}` : ""
      })`
    : `Rank actuel : ${agg.rank}`;

  const user = [
    "📊 Stats du joueur :",
    "",
    `Joueur Discord : ${i.discordUserMention}`,
    `Riot ID : ${i.riotName}#${i.riotTag}`,
    rankLine,
    `RR cumulé sur ${i.matches.length} matchs : ${agg.rrSum}`,
    `K/D : ${agg.kd}`,
    `HS% : ${agg.hsPct}`,
    `Winrate : ${agg.winrate} (${agg.winLoss})`,
    `Main agent : ${agg.mainAgent}`,
    `ACS moyen : ${agg.acs}`,
    `ADR moyen : ${agg.adr}`,
    "",
    "Détails des derniers matchs comp :",
    "",
    detail,
    "",
    "Roast-le maintenant. Tutoie-le directement.",
  ].join("\n");

  return { system: ROAST_SYSTEM_PROMPT, user };
}
