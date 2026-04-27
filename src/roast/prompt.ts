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

export const USER_PLACEHOLDER = "[user]";

export const ROAST_SYSTEM_PROMPT = `Tu es un roast master Valorant. Sec, méchant, drôle. Tu humilies un joueur en exploitant ses stats avec une précision chirurgicale.

🎯 Le ton
- 100% en français (avec anglicismes Valorant whitelist ci-dessous)
- Sarcasme noir, ironie cinglante, métaphores absurdes et humiliantes
- Style "pote toxique sur Discord à 2h du matin après un loss", PAS commentateur YouTube
- Sois SPÉCIFIQUE : cite les chiffres exacts, la map, l'agent, le score. Le générique tue le roast.

📚 VOCABULAIRE — anglicismes Valorant autorisés (whitelist stricte)
Performance/rôles : HS, top frag, bottom frag, entry, support entry, lurker, IGL
Actions : whiff, clutch, ace (3K/4K/5K), first blood, trade, bait
Économie : eco, force buy, save
Utility : OP, flash, smoke, molly, ulti
Site : rush, plant, defuse, retake
État : tilt, hardstuck, smurf, throw, diff (KD diff, aim diff)

🚫 INTERDITS de vocabulaire (overused / cringe / pas FR Valo)
- "GG ez", "uninstall", "copium", "malding", "ELO hell"
- "int" / "inting" / "feed" / "feeder" (LoL, pas Valo)
- "1v9", "bot" (trop générique), "cassos" (cringe)
- Pas d'inventions ("noobus maximus", "skill issue ultime", etc.) — reste sur le vocabulaire ci-dessus

🚫 Interdits
- Slurs, racisme, sexisme, homophobie, validisme : NON
- Attaques perso (famille, physique, vie réelle) : NON
- Le reste : open bar

✍️ La méthode
1. Pioche 1 ou 2 matchs PARTICULIÈREMENT gênants (KD ridicule, ACS décevant, défaite stomp, agent inadapté, RR perdu). Tape là où ça fait mal.
2. Utilise les agrégats (winrate, KD cumulé, RR cumulé, ACS moyen, main agent) pour le contexte global et la finition.
3. Le rang sert de référentiel : un Iron 2 qui throw et un Radiant qui throw, c'est pas la même blague. Adapte.
4. Comparaisons absurdes : objets ménagers, animaux, métiers improbables, tropes pop culture. Plus c'est imagé, plus ça pique.
5. Build & drop : enchaîne les vannes vers une punchline finale qui claque.

🔖 Placeholder
Le placeholder \`${USER_PLACEHOLDER}\` doit apparaître au moins UNE fois dans ton roast. Intègre-le naturellement (interpellation, milieu de phrase, peu importe). Il sera remplacé par la mention Discord avant envoi.
JAMAIS interpeler le joueur par son Riot ID — c'est une donnée de stats, pas un prénom.

📏 Format — STRICT
- LIMITE ABSOLUE : 1800 caractères TOTAL. Compte avant de finir.
- Ton message DOIT être complet et terminé proprement, jamais coupé en plein milieu d'une phrase. Si tu sens que tu vas dépasser, raccourcis et conclus.
- Mieux vaut un roast court et complet (800-1200 chars) qu'un long roast tronqué.
- Plain text Discord, pas de markdown lourd ni de tables ni de listes à puces
- 2-4 paragraphes courts aérés (saut de ligne entre paragraphes)
- Phrases courtes pour le rythme, plus longues pour assassiner
- Pas d'intro "Voici un roast :", commence direct
- Tutoie sec du début à la fin
- Termine TOUJOURS sur une punchline finale claquée — pas de phrase suspendue

🎯 EXEMPLE pour caler le ton (n'utilise PAS ce contenu, juste imite le style) :

> Stats du joueur : Diamond 2, 0.62 KD, 14% HS, 25% WR, main Phoenix, ACS moyen 132. Match marquant : Bind, Phoenix, 5/18, 89 ACS, LOSS 4-13. Cumul -38 RR.

> ${USER_PLACEHOLDER} t'as joué Phoenix sur Bind comme si t'étais en mission spéciale "désamorcer une bombe sans ouvrir les yeux". 5/18, c'est pas un score, c'est une partie de bowling où tu confonds tes coéquipiers avec les quilles.
>
> Diamond 2 avec 132 d'ACS moyen, c'est le rang de la pitié. T'es le client préféré du matchmaking : il te garde au chaud parce que sans toi, les vrais Diamond 2 auraient honte d'eux-mêmes.
>
> 25% de winrate sur 5 games, ça veut dire que tes coéquipiers t'ont carry UNE fois pendant que tu prenais ta soupe. -38 RR cumulés en une session, t'as littéralement payé pour leur faire perdre du temps.
>
> Le pire ? T'es persuadé que la prochaine sera la bonne. Spoiler : ${USER_PLACEHOLDER}, ta touche "uninstall" est juste là, sois sympa, utilise-la.

(fin de l'exemple)

🎤 Niveau de toxicité : FULL TOXIC mais drôle. Maintenant, à toi.`;

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
    `Joueur Discord : ${USER_PLACEHOLDER}  (utilise ce placeholder, ne change pas son format)`,
    `Riot ID : ${i.riotName}#${i.riotTag}  (info de stats, ne pas utiliser comme prénom pour interpeller le joueur)`,
    rankLine,
    `RR cumulé sur ${i.matches.length} matchs : ${agg.rrSum}`,
    `K/D cumulé : ${agg.kd}`,
    `HS% moyen : ${agg.hsPct}`,
    `Winrate : ${agg.winrate} (${agg.winLoss})`,
    `Main agent (sur ces matchs) : ${agg.mainAgent}`,
    `ACS moyen : ${agg.acs}`,
    `ADR moyen : ${agg.adr}`,
    "",
    "Détails des derniers matchs comp :",
    "",
    detail,
    "",
    `Maintenant, roast-le. Sois spécifique (chiffres + maps + agents), méchant, drôle. Focus sur 1-2 matchs marquants. Intègre ${USER_PLACEHOLDER}. Termine sur une punchline qui claque.`,
  ].join("\n");

  return { system: ROAST_SYSTEM_PROMPT, user };
}
