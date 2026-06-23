// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

export type SuggestionType = "grammar" | "punctuation" | "paraphrase" | "passive-voice" | "passive-voice-agentless" | "sentence-length";

export interface RawSuggestion {
  type: SuggestionType;
  original: string;
  replacement: string;
  explanation: string;
}

/** Writing tone — used to keep style rephrases voice-appropriate. */
export type DetectedTone =
  | "academic"
  | "legal"
  | "journalistic"
  | "casual"
  | "business"
  | "unknown";

// ---------------------------------------------------------------------------
// Fact check
// ---------------------------------------------------------------------------

export type FactVerdict = "verified" | "false" | "unverified";

export interface FactCheckResult {
  claim: string;
  verdict: FactVerdict;
  explanation: string;
  source_url: string;
}

// ---------------------------------------------------------------------------
// SEO analysis
// ---------------------------------------------------------------------------

export type SeoCheckStatus = "pass" | "warning" | "error" | "skipped";

export interface SeoCheckItem {
  id: string;
  name: string;
  status: SeoCheckStatus;
  message: string;
  detail?: string;
}

export interface ReadabilityScores {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  gunningFog: number;
  smog: number;
}

export interface SeoCheckResult {
  checks: SeoCheckItem[];
  readability: ReadabilityScores;
  llmSummary: string;
  llmRecommendations: string[];
}
