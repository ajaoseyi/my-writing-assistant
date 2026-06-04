import { z } from "zod";
import { ChatGroq } from "@langchain/groq";
import { TavilySearch } from "@langchain/tavily";
import type { FactCheckResult } from "../types.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
});

const ClaimsSchema = z.object({
  claims: z
    .array(z.string())
    .max(100)
    .describe("specific, verifiable factual claims extracted from the text"),
});

const VerdictSchema = z.object({
  verdict: z.enum(["verified", "false", "unverified"]),
  explanation: z
    .string()
    .describe("One or two sentence explanation of the verdict"),
  source_url: z
    .string()
    .describe("URL of the most relevant search result, or empty string if none"),
});

const claimsModel = model.withStructuredOutput(ClaimsSchema);
const verdictModel = model.withStructuredOutput(VerdictSchema);

/**
 * Extracts up to 5 verifiable factual claims from the text and checks each
 * against live Tavily web search results. All claims are searched in parallel.
 * @param text - The document text to fact-check.
 * @returns Array of fact-check results with verdicts, explanations, and source URLs.
 */
export async function factCheck(text: string): Promise<FactCheckResult[]> {
  if (!process.env.TAVILY_API_KEY) {
    console.warn("factCheck: TAVILY_API_KEY not set — skipping fact check");
    return [];
  }

  console.log("[factCheck] Extracting verifiable claims from text…");

  // Stage 1: extract verifiable claims
  let claims: string[] = [];
  try {
    const extracted = await claimsModel.invoke([
      {
        role: "system",
        content:
          "Extract all verifiable factual claims from the text. Include two kinds:\n1. Atomic claims — a single sentence stating a statistic, date, named event, attributed quote, or scientific fact.\n2. Composite narrative claims — two or more related sentences that together describe a historical event, person, cause-and-effect chain, or sequence of events whose combined meaning forms a specific, checkable assertion. Synthesize each such group into one concise claim string before adding it to the list.\nSkip pure opinions and vague subjective statements. Do not skip a claim simply because it spans multiple sentences.",
      },
      { role: "user", content: text },
    ]);
    claims = (extracted as { claims: string[] }).claims ?? [];
  } catch {
    console.warn("factCheck: failed to extract claims");
    return [];
  }

  console.log(`[factCheck] Extracted ${claims.length} claim(s):`, claims);
  if (claims.length === 0) return [];

  // Stage 2: for each claim, run Tavily search + LLM reasoning in parallel
  console.log(`[factCheck] Running Tavily search + LLM reasoning for ${claims.length} claim(s)…`);
  const tavilyTool = new TavilySearch({
    maxResults: 3,
    tavilyApiKey: process.env.TAVILY_API_KEY,
  });

  const stage2 = await Promise.all(
    claims.map(async (claim) => {
      console.log(`[factCheck] Processing claim → "${claim}"`);
      const [reasoning, searchText] = await Promise.all([
        model
          .invoke([
            {
              role: "system",
              content:
                "Based on your training knowledge, assess whether this claim is accurate or false. Be specific about any factual errors, invented entities, incorrect dates, or implausible details.",
            },
            { role: "user", content: claim },
          ])
          .then((r) => (typeof r.content === "string" ? r.content : ""))
          .catch(() => ""),
        tavilyTool
          .invoke({ query: claim })
          .then((r) => (typeof r === "string" ? r : JSON.stringify(r)))
          .catch(() => ""),
      ]);
      return { reasoning, searchText };
    }),
  );

  // Stage 3: determine verdict using both LLM reasoning and Tavily search results
  const results = await Promise.all(
    claims.map(async (claim, i): Promise<FactCheckResult> => {
      const { reasoning, searchText } = stage2[i];
      try {
        const verdict = await verdictModel.invoke([
          {
            role: "system",
            content:
              "You are a fact-checker. Given a claim, LLM reasoning based on training knowledge, and web search results, determine if the claim is verified (confirmed true), false (contradicted), or unverified (ambiguous or insufficient evidence). Prefer web search when it directly addresses the claim; rely on LLM reasoning when search results are absent or irrelevant. Provide a brief explanation and the most relevant source URL.",
          },
          {
            role: "user",
            content: `Claim: ${claim}\n\nLLM reasoning:\n${reasoning || "No reasoning available"}\n\nWeb search results:\n${searchText || "No search results available"}`,
          },
        ]);
        const v = verdict as { verdict: string; explanation: string; source_url: string };
        return {
          claim,
          verdict: v.verdict as FactCheckResult["verdict"],
          explanation: v.explanation,
          source_url: v.source_url ?? "",
        };
      } catch {
        return { claim, verdict: "unverified", explanation: "Could not verify", source_url: "" };
      }
    }),
  );

  return results;
}
