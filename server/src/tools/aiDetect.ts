import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { AiDetectionResult } from "../types.js";

const FALLBACK: AiDetectionResult = { score: 0, verdict: "human", skipped: true };

const AiDetectionSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["human", "mixed", "ai"]),
});

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an AI-content detector. Analyze the provided text for signals of LLM generation: uniform sentence length, absence of personal voice, hedging language, perfect grammar, overly generic examples, and repetitive structure.

Return:
- score: integer 0–100 (0 = definitely human, 100 = definitely AI)
- verdict: "human" if score < 30, "mixed" if score 30–69, "ai" if score ≥ 70`,
  ],
  ["human", "{text}"],
]);

export async function aiDetect(text: string): Promise<AiDetectionResult> {
  if (!process.env.GROQ_API_KEY) {
    console.warn("aiDetect: GROQ_API_KEY not set — skipping");
    return FALLBACK;
  }

  try {
    const model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
    });
    const structuredModel = model.withStructuredOutput(AiDetectionSchema);
    const chain = prompt.pipe(structuredModel);
    const result = await chain.invoke({ text });
    return { score: result.score, verdict: result.verdict };
  } catch (err: unknown) {
    console.warn(
      "aiDetect: error —",
      err instanceof Error ? err.message : String(err),
    );
    return FALLBACK;
  }
}
