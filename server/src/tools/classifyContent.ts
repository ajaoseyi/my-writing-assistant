import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ContentClassificationSchema } from "../types.js";
import type { ContentClassification } from "../types.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
});

const structuredModel = model.withStructuredOutput(ContentClassificationSchema);

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a content classification expert. Analyse the writing style, format, and subject matter of the given text and return a structured classification. Be precise about the content_type and realistic about platform suitability.",
  ],
  [
    "user",
    "Classify this text and return a JSON object with content_type, suggested_platforms, confidence (0-100), and reasoning.\n\nText:\n{text}",
  ],
]);

const chain = prompt.pipe(structuredModel);

/**
 * Classifies the content type of a document and suggests suitable publishing platforms.
 * Uses Zod-validated structured output to guarantee schema conformance.
 * @param text - The document text to classify.
 * @returns Structured content classification including type, platforms, confidence, and reasoning.
 */
export async function classifyContent(
  text: string,
): Promise<ContentClassification> {
  return chain.invoke({ text }) as Promise<ContentClassification>;
}
