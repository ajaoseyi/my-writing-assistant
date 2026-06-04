// Shared types mirroring the server's types.ts

export type SuggestionType = "grammar" | "punctuation" | "paraphrase";

export type FactVerdict = "verified" | "false" | "unverified";

export interface FactCheckResult {
  claim: string;
  verdict: FactVerdict;
  explanation: string;
  source_url: string;
}

export type ContentType =
  | "article"
  | "tweet_thread"
  | "message"
  | "academic_paper"
  | "legal_doc"
  | "essay";

export type Platform = "substack" | "twitter" | "email" | "medium";

export type DetectedTone =
  | "academic"
  | "legal"
  | "journalistic"
  | "casual"
  | "business"
  | "unknown";

export type PlagiarismVerdict = "original" | "partial" | "plagiarised";

export interface MatchedSource {
  url: string;
  title: string;
  matched_words: number;
  similarity_percentage: number;
}

export interface PlagiarismResult {
  score: number;
  matched_sources: MatchedSource[];
  verdict: PlagiarismVerdict;
}

export interface GrammarErrorGroup {
  type: SuggestionType;
  count: number;
  errors: Array<{
    type: SuggestionType;
    original: string;
    replacement: string;
    explanation: string;
  }>;
}

export interface FullReport {
  document_metadata: {
    language: string;
    tone: DetectedTone;
    content_type: ContentType;
    word_count: number;
  };
  grammar_errors: GrammarErrorGroup[];
  fact_check_results: FactCheckResult[];
  plagiarism_summary: PlagiarismResult;
  platform_suggestions: Platform[];
  executive_summary: string;
}

export interface AnalyzeFullResponse {
  report: FullReport;
  warning?: string;
}

export interface InterruptedResponse {
  interrupted: true;
  threadId: string;
  toneOptions: DetectedTone[];
  detected: DetectedTone;
  confidence: number;
  warning?: string;
}
