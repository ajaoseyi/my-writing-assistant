import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { DetectedTone, RawSuggestion, SuggestionType } from "../types.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
});

const outputParser = new StringOutputParser();

function parseJsonSuggestions(raw: string): RawSuggestion[] {
  let str = raw.trim();

  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) str = fenceMatch[1].trim();

  const arrayMatch = str.match(/\[[\s\S]*\]/);
  if (arrayMatch) str = arrayMatch[0];

  const parsed = JSON.parse(str);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (s) =>
      typeof s.type === "string" &&
      typeof s.original === "string" &&
      typeof s.replacement === "string" &&
      typeof s.explanation === "string" &&
      (["grammar", "punctuation", "paraphrase"] as SuggestionType[]).includes(
        s.type,
      ) &&
      s.original.length > 0,
  );
}

/**
 * Checks grammar, punctuation, and/or paraphrase issues in the given text.
 * @param text - The document text to analyse.
 * @param options - Which check types to enable.
 * @param tone - Optional confirmed tone hint (reserved for domain-specific prompt tuning).
 * @returns Array of raw suggestions found in the text.
 */
export async function checkGrammar(
  text: string,
  options: { grammar: boolean; punctuation: boolean; paraphrase: boolean },
  tone?: DetectedTone,
): Promise<RawSuggestion[]> {
  const enabledTypes: string[] = [];
  const typeDescriptions: string[] = [];

  if (options.grammar) {
    enabledTypes.push("grammar");
    typeDescriptions.push(
      '- "grammar": subject-verb agreement, wrong word form/tense, misspellings, wrong pronoun (their/there/they\'re, its/it\'s), doubled words',
    );
  }
  if (options.punctuation) {
    enabledTypes.push("punctuation");
    typeDescriptions.push(
      '- "punctuation": missing space after comma or period, double spaces, missing capitalisation at sentence start, incorrect comma placement',
    );
  }
  if (options.paraphrase) {
    enabledTypes.push("paraphrase");
    typeDescriptions.push(
      '- "paraphrase": awkward, redundant, or overly wordy phrases — provide a clearer, more concise alternative for the specific phrase only',
    );
  }

  if (enabledTypes.length === 0) enabledTypes.push("grammar");

  const toneNote = tone
    ? `\nThe document has been identified as ${tone} tone — apply domain-appropriate grammar rules.\n`
    : "";

  const instructions = `You are a professional writing editor. Analyze the text below and identify writing issues.${toneNote}

IMPORTANT: Return ONLY a raw JSON array. No markdown, no code blocks, no prose — just the bare JSON array.

Each element must be an object with exactly these four keys:
- "type": must be exactly one of: ${enabledTypes.join(" | ")}
- "original": the EXACT verbatim substring from the text (copy-paste accurate, case-sensitive)
- "replacement": the corrected/improved version of that exact substring
- "explanation": a brief phrase under 10 words describing the issue (no ending period)

Rules for "original":
- Must be an exact substring of the provided text (character-for-character)
- Use the MINIMUM text needed — for a misspelled word, use just the word
- For a spacing issue like ",and", "original" is ",and" and "replacement" is ", and"
- For doubled words like "the the", "original" is "the the" and "replacement" is "the"
- Never include more context than needed

Issue types enabled for this analysis:
${typeDescriptions.join("\n")}

Return [] if no issues are found.

Text:
{text}`;

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a professional editor. Return only valid JSON arrays as instructed.",
    ],
    ["user", instructions],
  ]);

  const chain = prompt.pipe(model).pipe(outputParser);
  const result = await chain.invoke({ text });

  try {
    return parseJsonSuggestions(result);
  } catch {
    console.warn("grammar: failed to parse LLM JSON response");
    return [];
  }
}
