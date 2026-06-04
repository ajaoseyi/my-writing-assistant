import { z } from "zod";

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

export type SuggestionType = "grammar" | "punctuation" | "paraphrase";

export interface RawSuggestion {
  type: SuggestionType;
  original: string;
  replacement: string;
  explanation: string;
}

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
// Content classification
// ---------------------------------------------------------------------------

export const ContentClassificationSchema = z.object({
  content_type: z.enum([
    "article",
    "tweet_thread",
    "message",
    "academic_paper",
    "legal_doc",
    "essay",
  ]),
  suggested_platforms: z.array(
    z.enum(["substack", "twitter", "email", "medium"]),
  ),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
});

export type ContentClassification = z.infer<typeof ContentClassificationSchema>;
export type ContentType = ContentClassification["content_type"];
export type Platform = ContentClassification["suggested_platforms"][number];

// ---------------------------------------------------------------------------
// Tone detection
// ---------------------------------------------------------------------------

export const ToneDetectionSchema = z.object({
  detected_tone: z.enum([
    "academic",
    "legal",
    "journalistic",
    "casual",
    "business",
    "unknown",
  ]),
  confidence: z.number().min(0).max(100),
  /** Set to true when confidence < 70 — triggers human-in-the-loop interrupt */
  ask_user: z.boolean(),
});

export type ToneDetection = z.infer<typeof ToneDetectionSchema>;
export type DetectedTone = ToneDetection["detected_tone"];

export const TONE_OPTIONS: DetectedTone[] = [
  "academic",
  "legal",
  "journalistic",
  "casual",
  "business",
  "unknown",
];

// ---------------------------------------------------------------------------
// Plagiarism
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

export interface DocumentMetadata {
  language: string;
  tone: DetectedTone;
  content_type: ContentType;
  word_count: number;
}

export interface GrammarErrorGroup {
  type: SuggestionType;
  count: number;
  errors: RawSuggestion[];
}

export interface FullReport {
  document_metadata: DocumentMetadata;
  grammar_errors: GrammarErrorGroup[];
  fact_check_results: FactCheckResult[];
  plagiarism_summary: PlagiarismResult;
  platform_suggestions: Platform[];
  executive_summary: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface AnalyzeFullResponse {
  report: FullReport;
}

export interface InterruptedResponse {
  interrupted: true;
  threadId: string;
  toneOptions: DetectedTone[];
  detected: DetectedTone;
  confidence: number;
}
