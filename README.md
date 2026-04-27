# bot-valo

Bot Discord qui surveille les matchs Compétitif Valorant des comptes liés et envoie un roast OpenAI tous les 5 nouveaux matchs par compte.

## Stack

- Node 20+, TypeScript
- discord.js v14
- Supabase (Postgres)
- Vercel AI SDK + OpenAI
- HenrikDev API (Valorant)
- node-cron

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Env** — copier `.env.example` en `.env` et remplir :
   ```
   DISCORD_TOKEN=
   DISCORD_CLIENT_ID=
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   OPENAI_API_KEY=
   OPENAI_MODEL=gpt-5.4-mini
   HENRIK_API_KEY=        # optionnel mais recommandé (v3/matches le requiert maintenant)
   TICK_INTERVAL_MINUTES=2
   ROAST_THRESHOLD=5
   DEFAULT_REGION=eu
   LOG_LEVEL=info
   ```

3. **Schéma Supabase**
   ```bash
   npm run db:apply
   ```
   Le script affiche le SQL — coller dans Supabase → SQL Editor → Run, puis presser Entrée pour vérifier.

4. **Enregistrer les slash commands** (une fois après chaque modif)
   ```bash
   npm run register-commands
   ```

5. **Inviter le bot**
   ```
   https://discord.com/api/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=85056&scope=bot%20applications.commands
   ```

6. **Run**
   ```bash
   npm run dev     # dev (tsx watch)
   npm start       # prod (après npm run build)
   ```

## Slash commands

| Command | Permission | Effet |
|---|---|---|
| `/link user:@Bob riot:Name#TAG region:eu` | Manage Guild | Lie un compte Valorant à un user Discord (multi-comptes possibles) |
| `/unlink riot:Name#TAG` | Manage Guild | Retire un lien |
| `/setchannel channel:#salon` | Manage Guild | Définit le channel où le bot poste les roasts |
| `/list user:@Bob?` | tous | Liste les comptes liés (filtre user optionnel) |

## Comment ça marche

- Toutes les `TICK_INTERVAL_MINUTES` minutes, le bot interroge Henrik pour chaque compte lié, récupère ses 5 derniers matchs Compétitif et insère ceux qui sont nouveaux.
- Chaque compte a un compteur `pending_match_count`. Quand il atteint `ROAST_THRESHOLD` (5 par défaut), le bot génère un roast via OpenAI à partir des stats des 5 derniers matchs et le poste dans le channel configuré, puis remet le compteur à 0.
- Le ton du roast est paramétré dans [src/roast/prompt.ts](src/roast/prompt.ts).

## Tests

```bash
npm test
```

## Probe Henrik (debug)

Pour découvrir tout ce que renvoie l'API Henrik et adapter le prompt :

```bash
npm run henrik:probe -- eu MonNom MonTag
```

Les payloads sont dumpés dans `tmp/henrik/`. Requiert `HENRIK_API_KEY` dans `.env` pour la majorité des endpoints v3.

## Spec & plan

- [docs/superpowers/specs/2026-04-27-bot-valo-design.md](docs/superpowers/specs/2026-04-27-bot-valo-design.md)
- [docs/superpowers/plans/2026-04-27-bot-valo-implementation.md](docs/superpowers/plans/2026-04-27-bot-valo-implementation.md)
