import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";

export function isAdmin(i: ChatInputCommandInteraction): boolean {
  if (!i.inGuild()) return false;
  const perms = i.memberPermissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export async function ephemeralReply(
  i: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  if (i.replied || i.deferred) {
    await i.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await i.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
