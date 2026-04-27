import {
  HenrikAccount,
  type HenrikAccountT,
  StoredMatchesResponse,
  type StoredMatchT,
  CurrentMmrResponse,
  type CurrentMmrResponseT,
  MmrHistoryResponse,
  type MmrHistoryEntryT,
} from "./types.js";

const BASE = "https://api.henrikdev.xyz";

export interface HenrikClient {
  getAccount(name: string, tag: string): Promise<{
    puuid: string;
    region: string;
    name: string;
    tag: string;
  }>;
  getStoredMatches(
    region: string,
    puuid: string,
    mode: string,
    size: number,
  ): Promise<StoredMatchT[]>;
  getCurrentMmr(region: string, puuid: string): Promise<CurrentMmrResponseT["data"]>;
  getMmrHistory(region: string, puuid: string): Promise<MmrHistoryEntryT[]>;
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

function rejectIfBad(res: Response, scope: string): void {
  if (res.status === 429) {
    const e = new HenrikError(`${scope}: rate-limited`);
    e.rateLimited = true;
    e.status = 429;
    e.retryAfter = res.headers.get("retry-after");
    throw e;
  }
  if (res.status === 404) {
    const e = new HenrikError(`${scope}: not found`);
    e.notFound = true;
    e.status = 404;
    throw e;
  }
  if (!res.ok) {
    const e = new HenrikError(`${scope}: http ${res.status}`);
    e.status = res.status;
    throw e;
  }
}

export class HttpHenrikClient implements HenrikClient {
  constructor(private apiKey?: string) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "User-Agent": "bot-valo/0.1" };
    if (this.apiKey) h["Authorization"] = this.apiKey;
    return h;
  }

  async getAccount(name: string, tag: string) {
    const url = `${BASE}/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
    const res = await fetch(url, { headers: this.headers() });
    rejectIfBad(res, "account");
    const json = await res.json();
    const parsed = HenrikAccount.parse(json);
    return {
      puuid: parsed.data.puuid,
      region: parsed.data.region,
      name: parsed.data.name,
      tag: parsed.data.tag,
    };
  }

  async getStoredMatches(
    region: string,
    puuid: string,
    mode: string,
    size: number,
  ): Promise<StoredMatchT[]> {
    const url = `${BASE}/valorant/v1/by-puuid/stored-matches/${region}/${puuid}?mode=${encodeURIComponent(mode)}&size=${size}`;
    const res = await fetch(url, { headers: this.headers() });
    rejectIfBad(res, "stored-matches");
    const json = await res.json();
    return StoredMatchesResponse.parse(json).data;
  }

  async getCurrentMmr(region: string, puuid: string): Promise<CurrentMmrResponseT["data"]> {
    const url = `${BASE}/valorant/v2/by-puuid/mmr/${region}/${puuid}`;
    const res = await fetch(url, { headers: this.headers() });
    rejectIfBad(res, "mmr");
    const json = await res.json();
    return CurrentMmrResponse.parse(json).data;
  }

  async getMmrHistory(region: string, puuid: string): Promise<MmrHistoryEntryT[]> {
    const url = `${BASE}/valorant/v1/by-puuid/mmr-history/${region}/${puuid}`;
    const res = await fetch(url, { headers: this.headers() });
    rejectIfBad(res, "mmr-history");
    const json = await res.json();
    return MmrHistoryResponse.parse(json).data;
  }
}

export type { HenrikAccountT };
