import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountRow, GuildRow, MatchRow, MatchStats } from "./types.js";

export class Repo {
  constructor(private sb: SupabaseClient) {}

  async upsertGuild(guildId: string): Promise<void> {
    const { error } = await this.sb
      .from("guilds")
      .upsert({ guild_id: guildId }, { onConflict: "guild_id" });
    if (error) throw error;
  }

  async setRoastChannel(guildId: string, channelId: string): Promise<void> {
    await this.upsertGuild(guildId);
    const { error } = await this.sb
      .from("guilds")
      .update({ roast_channel_id: channelId })
      .eq("guild_id", guildId);
    if (error) throw error;
  }

  async getGuild(guildId: string): Promise<GuildRow | null> {
    const { data, error } = await this.sb
      .from("guilds")
      .select("*")
      .eq("guild_id", guildId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listAccounts(): Promise<AccountRow[]> {
    const { data, error } = await this.sb
      .from("valorant_accounts")
      .select("*")
      .eq("disabled", false);
    if (error) throw error;
    return data ?? [];
  }

  async listAccountsForGuild(
    guildId: string,
    discordUserId?: string,
  ): Promise<AccountRow[]> {
    let q = this.sb.from("valorant_accounts").select("*").eq("guild_id", guildId);
    if (discordUserId) q = q.eq("discord_user_id", discordUserId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async createAccount(input: {
    guildId: string;
    discordUserId: string;
    riotName: string;
    riotTag: string;
    region: string;
  }): Promise<AccountRow> {
    await this.upsertGuild(input.guildId);
    const { data, error } = await this.sb
      .from("valorant_accounts")
      .insert({
        guild_id: input.guildId,
        discord_user_id: input.discordUserId,
        riot_name: input.riotName,
        riot_tag: input.riotTag,
        region: input.region,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteAccount(
    guildId: string,
    riotName: string,
    riotTag: string,
  ): Promise<boolean> {
    const { data, error } = await this.sb
      .from("valorant_accounts")
      .delete()
      .eq("guild_id", guildId)
      .eq("riot_name", riotName)
      .eq("riot_tag", riotTag)
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async disableAccount(id: string): Promise<void> {
    const { error } = await this.sb
      .from("valorant_accounts")
      .update({ disabled: true })
      .eq("id", id);
    if (error) throw error;
  }

  async existingMatchIds(accountId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await this.sb
      .from("matches")
      .select("match_id")
      .eq("account_id", accountId)
      .in("match_id", ids);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.match_id));
  }

  async insertMatch(
    accountId: string,
    matchId: string,
    playedAt: string,
    stats: MatchStats,
  ): Promise<void> {
    const { error } = await this.sb.from("matches").insert({
      match_id: matchId,
      account_id: accountId,
      played_at: playedAt,
      raw_stats: stats,
    });
    if (error && (error as { code?: string }).code !== "23505") throw error;
  }

  async getRecentMatches(accountId: string, limit = 5): Promise<MatchRow[]> {
    const { data, error } = await this.sb
      .from("matches")
      .select("*")
      .eq("account_id", accountId)
      .order("played_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async updateAccountAfterMatch(
    accountId: string,
    lastMatchId: string,
    pendingCount: number,
  ): Promise<void> {
    const { error } = await this.sb
      .from("valorant_accounts")
      .update({ last_match_id: lastMatchId, pending_match_count: pendingCount })
      .eq("id", accountId);
    if (error) throw error;
  }
}
