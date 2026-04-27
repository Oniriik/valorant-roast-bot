import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { buildRoastPrompt, type RoastInput } from "./prompt.js";

export interface RoastGenerator {
  generate(input: RoastInput): Promise<string>;
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
    const trimmed = text.trim();
    if (!trimmed) throw new Error("ai sdk returned empty response");
    return trimmed.length > 1500 ? trimmed.slice(0, 1500) : trimmed;
  }
}
