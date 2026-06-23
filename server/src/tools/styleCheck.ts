import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { retext } from "retext";
import retextPassive from "retext-passive";
import type { DetectedTone, RawSuggestion, SuggestionType } from "../types.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 0,
});

const outputParser = new StringOutputParser();

interface FlaggedItem {
  type: "passive-voice" | "sentence-length";
  original: string;
  agentless?: boolean;
}

function hasExplicitAgent(sentence: string): boolean {
  return /\bby\s+(?:a\s+|an\s+|the\s+)?[a-zA-Z]/i.test(sentence);
}

function extractSentenceBounds(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  // Walk back to the start of the sentence. A newline is a hard boundary too, so
  // a heading or list item never bleeds into the block below it.
  let start = offset;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) {
    start--;
  }
  // Skip leading whitespace
  while (start < text.length && /\s/.test(text[start])) start++;

  // Walk forward to the end of the sentence (stop at .!? or a newline)
  let end = start;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  if (end < text.length && /[.!?]/.test(text[end])) end++; // include terminal punctuation, but not the newline

  if (start >= end || start >= text.length) return null;
  return { start, end };
}

function detectLongSentences(text: string): string[] {
  // Split on whitespace following sentence-ending punctuation, and on newlines
  // (block boundaries) so two separate paragraphs aren't counted as one sentence.
  const parts = text.split(/(?<=[.!?])\s+|\s*\n\s*/);
  const results: string[] = [];
  for (const part of parts) {
    const sentence = part.trim();
    if (!sentence) continue;
    const wordCount = sentence.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount > 20) results.push(sentence);
  }
  return results;
}

function parseRephrases(
  raw: string,
): Array<{ index: number; replacement: string; explanation: string }> {
  let str = raw.trim();
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) str = fenceMatch[1].trim();
  const arrayMatch = str.match(/\[[\s\S]*\]/);
  if (arrayMatch) str = arrayMatch[0];
  const parsed = JSON.parse(str);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((s) => {
      const idx =
        typeof s.index === "number"
          ? s.index
          : parseInt(String(s.index), 10);
      if (
        isNaN(idx) ||
        idx < 1 ||
        typeof s.replacement !== "string" ||
        typeof s.explanation !== "string"
      )
        return null;
      return { index: idx, replacement: s.replacement, explanation: s.explanation };
    })
    .filter((s): s is { index: number; replacement: string; explanation: string } => s !== null);
}

export async function styleCheck(
  text: string,
  options: { passiveVoice: boolean; sentenceLength: boolean },
  tone?: DetectedTone,
): Promise<RawSuggestion[]> {
  if (!options.passiveVoice && !options.sentenceLength) return [];

  const flagged: FlaggedItem[] = [];
  const seen = new Set<string>();

  // --- Passive voice detection ---
  // retext-passive only covers irregular past participles (written, sent, made…).
  // A regex covers the much larger set of regular -ed past participles.
  // Both run and deduplicate by sentence so there are no double entries.
  if (options.passiveVoice) {
    const passiveOffsets: number[] = [];

    // Irregular past participles via retext-passive
    const file = await retext().use(retextPassive).process(text);
    for (const message of file.messages) {
      const place = message.place;
      if (!place || !("start" in place)) continue;
      const startOffset = (place as { start: { offset?: number } }).start.offset;
      if (startOffset !== undefined) passiveOffsets.push(startOffset);
    }

    // Regular -ed past participles via regex: (be-verb) + word ending in -ed
    const edRegex = /\b(am|is|are|was|were|be|been|being)\s+(\w+ed)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = edRegex.exec(text)) !== null) {
      passiveOffsets.push(match.index);
    }

    // Supplementary: common irregular past participles retext-passive may miss
    const irregularPpRegex =
      /\b(was|were|is|are|am|be|been|being)\s+(made|done|seen|said|known|found|given|taken|kept|left|led|lost|met|put|set|sent|told|thought|built|bought|caught|taught|written|broken|chosen|fallen|grown|shown|spoken|stolen|worn|begun|drawn|driven|eaten|hidden|ridden|risen|shut|sung|sunk|swum|thrown|understood|won)\b/gi;
    while ((match = irregularPpRegex.exec(text)) !== null) {
      passiveOffsets.push(match.index);
    }

    for (const offset of passiveOffsets) {
      const bounds = extractSentenceBounds(text, offset);
      if (!bounds) continue;
      const sentence = text.slice(bounds.start, bounds.end);
      if (sentence && !seen.has(sentence)) {
        seen.add(sentence);
        flagged.push({
          type: "passive-voice",
          original: sentence,
          agentless: !hasExplicitAgent(sentence),
        });
      }
    }
  }

  // --- Long sentence detection via word count (Yoast SEO: >20 words) ---
  if (options.sentenceLength) {
    const longSentences = detectLongSentences(text);
    for (const sentence of longSentences) {
      if (!seen.has(sentence)) {
        seen.add(sentence);
        flagged.push({ type: "sentence-length", original: sentence });
      }
    }
  }

  if (flagged.length === 0) return [];

  // --- Single LLM call to generate tone-aware rephrase suggestions ---
  const toneNote = tone
    ? ` The document tone is ${tone} — match that register in all replacements.`
    : "";

  const sentencesList = flagged
    .map((f, i) => {
      const label =
        f.type === "passive-voice" && f.agentless
          ? "passive-voice-agentless"
          : f.type;
      return `${i + 1}. [${label}] "${f.original}"`;
    })
    .join("\n");

  const instructions = `You are a style editor.${toneNote}

For each numbered sentence below, provide an improved version.

Return ONLY a raw JSON array. No markdown, no code blocks, no prose.

Each element must have exactly these three keys:
- "index": the sentence number from the list (integer)
- "replacement": improved version (see rules below)
- "explanation": brief phrase under 10 words describing the issue (no ending period)

Rules by label:
- [passive-voice]: rewrite to active voice using a subject already present in the sentence
- [passive-voice-agentless]: the actor is NOT stated — do NOT invent one. Return the original sentence unchanged as "replacement" and use "Passive voice — actor unclear" as "explanation"
- [sentence-length]: split into 2 clear shorter sentences

IMPORTANT: This list has ${flagged.length} sentence(s). You MUST return exactly ${flagged.length} item(s) — one for every sentence. Do NOT skip any.

Sentences:
${sentencesList}`;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a professional editor. Return only valid JSON arrays."],
    ["user", instructions],
  ]);

  const chain = prompt.pipe(model).pipe(outputParser);

  try {
    const result = await chain.invoke({});
    const rephrases = parseRephrases(result);

    const suggestions: RawSuggestion[] = rephrases
      .map((r) => {
        const item = flagged[r.index - 1];
        if (!item) return null;
        return {
          type: (item.type === "passive-voice" && item.agentless
            ? "passive-voice-agentless"
            : item.type) as SuggestionType,
          original: item.original,
          replacement: r.replacement,
          explanation: r.explanation,
        } satisfies RawSuggestion;
      })
      .filter((s): s is RawSuggestion => s !== null);

    // Fallback: ensure every detected sentence surfaces as a suggestion even if
    // the LLM silently skipped it. Users can still dismiss these manually.
    const returnedIndices = new Set(rephrases.map((r) => r.index));
    for (let i = 1; i <= flagged.length; i++) {
      if (!returnedIndices.has(i)) {
        const item = flagged[i - 1];
        const fallbackType = (item.type === "passive-voice" && item.agentless
          ? "passive-voice-agentless"
          : item.type) as SuggestionType;
        suggestions.push({
          type: fallbackType,
          original: item.original,
          replacement:
            item.type === "passive-voice" && !item.agentless
              ? item.original.replace(
                  /\b(was|were|is|are|be|been|being)\s+(\w+ed|\w+en|\w+wn|\w+ne)\b/gi,
                  "[rewrite in active voice]",
                )
              : item.original,
          explanation:
            item.type === "passive-voice"
              ? item.agentless
                ? "Passive voice — actor unclear"
                : "Passive voice — consider active rewrite"
              : "Sentence exceeds 20 words",
        });
      }
    }

    return suggestions;
  } catch {
    console.warn("styleCheck: failed to parse LLM JSON response");
    // Return all detections as bare suggestions so nothing is silently lost
    return flagged.map((item) => ({
      type: (item.type === "passive-voice" && item.agentless
        ? "passive-voice-agentless"
        : item.type) as SuggestionType,
      original: item.original,
      replacement:
        item.type === "passive-voice" && !item.agentless
          ? item.original.replace(
              /\b(was|were|is|are|be|been|being)\s+(\w+ed|\w+en|\w+wn|\w+ne)\b/gi,
              "[rewrite in active voice]",
            )
          : item.original,
      explanation:
        item.type === "passive-voice"
          ? item.agentless
            ? "Passive voice — actor unclear"
            : "Passive voice — consider active rewrite"
          : "Sentence exceeds 20 words",
    }));
  }
}
