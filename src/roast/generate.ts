import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { buildRoastPrompt, USER_PLACEHOLDER, type RoastInput } from "./prompt.js";

export interface RoastGenerator {
  generate(input: RoastInput): Promise<string>;
}

function substituteMention(text: string, mention: string): string {
  // accept lossy variants the LLM might emit: [user], [USER], [ user ], _user_, *user*
  return text
    .replace(/\[\s*user\s*\]/gi, mention)
    .replace(/\bUSER_MENTION\b/g, mention);
}

export class AISDKRoastGenerator implements RoastGenerator {
  private model: ReturnType<ReturnType<typeof createOpenAI>>;

  constructor(apiKey: string, modelId: string) {
    const openai = createOpenAI({ apiKey });
    this.model = openai(modelId);
  }

  async generate(input: RoastInput): Promise<string> {
    const { system, user } = buildRoastPrompt(input);
    const { text } = await generateText({
      model: this.model,
      system,
      prompt: user,
      temperature: 1,
      maxTokens: 600,
    });
    let trimmed = text.trim();
    if (!trimmed) throw new Error("ai sdk returned empty response");

    // safety: if LLM ignored the placeholder and the mention isn't present, prepend it
    trimmed = substituteMention(trimmed, input.discordUserMention);
    if (!trimmed.includes(input.discordUserMention)) {
      trimmed = `${input.discordUserMention} ${trimmed}`;
    }

    // hard cap juste sous la limite Discord plain-message de 2000
    const HARD_LIMIT = 1900;
    if (trimmed.length > HARD_LIMIT) trimmed = trimmed.slice(0, HARD_LIMIT - 1) + "…";
    return trimmed;
  }
}

export { USER_PLACEHOLDER };
