import { ChatGroq } from "@langchain/groq";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type {
  ContentClassification,
  FactCheckResult,
  FullReport,
  GrammarErrorGroup,
  PlagiarismResult,
  RawSuggestion,
  SuggestionType,
  ToneDetection,
} from "../types.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
});

const outputParser = new StringOutputParser();

const SUGGESTION_TYPES: SuggestionType[] = ["grammar", "punctuation", "paraphrase"];

/**
 * Compiles all tool outputs into a structured FullReport and generates a
 * plain-English executive summary using the LLM.
 * @param text - Original document text (used for word count computation).
 * @param grammar - Grammar check results from checkGrammar().
 * @param factCheckResults - Fact check results from factCheck().
 * @param plagiarism - Plagiarism check results from plagiarismCheck().
 * @param classification - Content classification from classifyContent().
 * @param tone - Tone detection result from detectTone() (with confirmed tone applied).
 * @returns A fully structured FullReport including an LLM-generated executive summary.
 */
export async function generateReport(
  text: string,
  grammar: RawSuggestion[],
  factCheckResults: FactCheckResult[],
  plagiarism: PlagiarismResult,
  classification: ContentClassification,
  tone: ToneDetection,
): Promise<FullReport> {
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const grammarErrors: GrammarErrorGroup[] = SUGGESTION_TYPES.map((type) => ({
    type,
    count: grammar.filter((s) => s.type === type).length,
    errors: grammar.filter((s) => s.type === type),
  })).filter((g) => g.count > 0);

  // Build a human-readable digest of all findings for the executive summary prompt
  const grammarSummary =
    grammarErrors.length === 0
      ? "No grammar/punctuation/paraphrase issues found."
      : grammarErrors
          .map((g) => `${g.count} ${g.type} issue(s)`)
          .join(", ") + ".";

  const factSummary =
    factCheckResults.length === 0
      ? "No verifiable factual claims detected."
      : factCheckResults
          .map(
            (f) =>
              `"${f.claim.slice(0, 60)}…" → ${f.verdict}`,
          )
          .join("; ") + ".";

  const plagiarismSummary = `Plagiarism score: ${plagiarism.score}% (${plagiarism.verdict}). ${plagiarism.matched_sources.length} source(s) matched.`;

  const summaryPrompt = `You are an editorial assistant. Write a 3–4 sentence plain-English executive summary of a document analysis. Be concise and professional.

Document details:
- Content type: ${classification.content_type} (${classification.confidence}% confidence)
- Tone: ${tone.detected_tone}
- Word count: ${wordCount}
- Grammar issues: ${grammarSummary}
- Fact check: ${factSummary}
- Plagiarism: ${plagiarismSummary}
- Suggested platforms: ${classification.suggested_platforms.join(", ") || "none"}

Write the executive summary now (plain text, no headers, no lists):`;

  let executiveSummary = "";
  try {
    executiveSummary = await model
      .pipe(outputParser)
      .invoke(summaryPrompt);
  } catch {
    executiveSummary =
      `This ${classification.content_type} contains ${wordCount} words with a ${tone.detected_tone} tone. ` +
      `Grammar analysis found ${grammar.length} issue(s). ` +
      `Plagiarism score is ${plagiarism.score}%.`;
  }

  return {
    document_metadata: {
      language: "en",
      tone: tone.detected_tone,
      content_type: classification.content_type,
      word_count: wordCount,
    },
    grammar_errors: grammarErrors,
    fact_check_results: factCheckResults,
    plagiarism_summary: plagiarism,
    platform_suggestions: classification.suggested_platforms,
    executive_summary: executiveSummary.trim(),
  };
}
