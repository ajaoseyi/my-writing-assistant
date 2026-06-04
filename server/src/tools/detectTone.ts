import { ChatGroq } from "@langchain/groq"; // LangChain wrapper for the Groq inference API
import { ChatPromptTemplate } from "@langchain/core/prompts"; // utility for building reusable chat prompt templates
import { ToneDetectionSchema } from "../types.js"; // Zod schema used to validate and parse the model's structured output
import type { ToneDetection } from "../types.js"; // TypeScript type inferred from ToneDetectionSchema

const model = new ChatGroq({ // initialise a Groq chat model instance
  apiKey: process.env.GROQ_API_KEY, // authenticate using the API key stored in the environment
  model: "llama-3.3-70b-versatile", // select the 70 B Llama 3.3 model hosted on Groq
});

const structuredModel = model.withStructuredOutput(ToneDetectionSchema); // wrap the model so it always returns JSON that matches ToneDetectionSchema

const prompt = ChatPromptTemplate.fromMessages([ // build a two-message prompt template (system + user)
  [
    "system",
    // instruct the model to act as a writing style analyst and explains when ask_user must be true
    "You are a writing style analyst. Detect the tone of the given text and return a structured result. Set ask_user to true whenever your confidence is below 70 — this signals that a human should confirm the tone before grammar rules are applied.",
  ],
  [
    "user",
    // define the expected output fields and inject the {text} placeholder that will be filled at call time
    "Detect the tone of this text. Return detected_tone (academic | legal | journalistic | casual | business | unknown), confidence (0-100), and ask_user (true if confidence < 70).\n\nText:\n{text}",
  ],
]);

const chain = prompt.pipe(structuredModel); // compose prompt and structured model into a single invocable chain

/**
 * Detects the writing tone of a document using a structured LLM call.
 * The interrupt() call that triggers the human-in-the-loop pause lives in graph.ts,
 * keeping this function pure and independently testable.
 * @param text - The document text to analyse.
 * @returns Tone detection result including ask_user flag (true when confidence < 70).
 */
export async function detectTone(text: string): Promise<ToneDetection> {
  const result = await (chain.invoke({ text }) as Promise<ToneDetection>);
  console.log(`[detectTone] ${result.detected_tone} (${result.confidence}% confidence, ask_user: ${result.ask_user})`);
  return result;
}
