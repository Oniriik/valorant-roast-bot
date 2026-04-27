import { HenrikMatchesResponse, type HenrikMatchT } from "./types.js";

export interface HenrikClient {
  getCompetitiveMatches(
    region: string,
    name: string,
    tag: string,
    size?: number,
  ): Promise<HenrikMatchT[]>;
}

export class HenrikError extends Error {
  notFound?: boolean;
  rateLimited?: boolean;
  retryAfter?: string | null;
  status?: number;
  constructor(msg: string) {
    super(msg);
    this.name = "HenrikError";
  }
}

export function parseHenrikMatches(payload: unknown): HenrikMatchT[] {
  const parsed = HenrikMatchesResponse.parse(payload);
  return parsed.data;
}

export class HttpHenrikClient implements HenrikClient {
  constructor(private apiKey?: string) {}

  async getCompetitiveMatches(
    region: string,
    name: string,
    tag: string,
    size = 5,
  ): Promise<HenrikMatchT[]> {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=${size}`;
    const headers: Record<string, string> = {
      "User-Agent": "bot-valo/0.1",
    };
    if (this.apiKey) headers["Authorization"] = this.apiKey;

    const res = await fetch(url, { headers });

    if (res.status === 429) {
      const e = new HenrikError("henrik rate-limited");
      e.rateLimited = true;
      e.status = 429;
      e.retryAfter = res.headers.get("retry-after");
      throw e;
    }
    if (res.status === 404) {
      const e = new HenrikError("account not found");
      e.notFound = true;
      e.status = 404;
      throw e;
    }
    if (!res.ok) {
      const e = new HenrikError(`henrik http ${res.status}`);
      e.status = res.status;
      throw e;
    }
    const json = await res.json();
    return parseHenrikMatches(json);
  }
}
