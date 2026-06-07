import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import type {
  AiDetectionResult,
  ContentClassification,
  DetectedTone,
  FactCheckResult,
  FullReport,
  PlagiarismResult,
  RawSuggestion,
  ToneDetection,
} from "./types.js";
import { TONE_OPTIONS } from "./types.js";
import { classifyContent } from "./tools/classifyContent.js";
import { detectTone } from "./tools/detectTone.js";
import { checkGrammar } from "./tools/grammar.js";
import { factCheck } from "./tools/factCheck.js";
import { plagiarismCheck } from "./tools/plagiarismCheck.js";
import { aiDetect } from "./tools/aiDetect.js";
import { generateReport } from "./tools/generateReport.js";

// ---------------------------------------------------------------------------
// State definition
// ---------------------------------------------------------------------------

const AnalysisAnnotation = Annotation.Root({
  text: Annotation<string>,
  classification: Annotation<ContentClassification | undefined>,
  tone: Annotation<ToneDetection | undefined>,
  confirmedTone: Annotation<DetectedTone | undefined>,
  grammar: Annotation<RawSuggestion[] | undefined>,
  factCheckResults: Annotation<FactCheckResult[] | undefined>,
  plagiarism: Annotation<PlagiarismResult | undefined>,
  aiDetection: Annotation<AiDetectionResult | undefined>,
  report: Annotation<FullReport | undefined>,
});

type AnalysisState = typeof AnalysisAnnotation.State;

// ---------------------------------------------------------------------------
// Node: classifyAndTone
// Runs classification and tone detection in parallel. Sets confirmedTone
// immediately when confidence >= 70; leaves it undefined otherwise so the
// interruptTone node can fill it in after human confirmation.
// ---------------------------------------------------------------------------

async function classifyAndToneNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  const [classification, tone] = await Promise.all([
    classifyContent(state.text),
    detectTone(state.text),
  ]);

  return {
    classification,
    tone,
    confirmedTone: tone.ask_user ? undefined : tone.detected_tone,
  };
}

// ---------------------------------------------------------------------------
// Node: interruptTone
// Only reached when tone.ask_user is true. Calls interrupt() to pause the
// graph and surface a tone question to the HTTP caller. On resume the caller
// passes Command({ resume: chosenTone }) and this node returns immediately.
// Keeping the interrupt in its own node ensures classifyAndTone never re-runs.
// ---------------------------------------------------------------------------

function interruptToneNode(
  state: AnalysisState,
): Partial<AnalysisState> {
  const chosen = interrupt<{ detected: DetectedTone; options: DetectedTone[] }, string>({
    detected: state.tone?.detected_tone ?? "unknown",
    options: TONE_OPTIONS,
  });

  return { confirmedTone: chosen as DetectedTone };
}

// ---------------------------------------------------------------------------
// Node: parallelAnalysis
// Runs grammar, fact-check, and plagiarism in parallel.
// Uses confirmedTone (set by either classifyAndTone or interruptTone).
// ---------------------------------------------------------------------------

async function parallelAnalysisNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  const plagiarismEnabled = process.env.ENABLE_PLAGIARISM_CHECK === "true";
  const [grammar, factCheckResults, aiDetection, plagiarism] = await Promise.all([
    checkGrammar(
      state.text,
      { grammar: true, punctuation: true, paraphrase: false },
      state.confirmedTone,
    ),
    factCheck(state.text),
    aiDetect(state.text),
    plagiarismEnabled
      ? plagiarismCheck(state.text)
      : Promise.resolve<PlagiarismResult>({ score: 0, matched_sources: [], verdict: "original" }),
  ]);

  return { grammar, factCheckResults, plagiarism, aiDetection };
}

// ---------------------------------------------------------------------------
// Node: generateReportNode
// ---------------------------------------------------------------------------

async function generateReportNode(
  state: AnalysisState,
): Promise<Partial<AnalysisState>> {
  const report = await generateReport(
    state.text,
    state.grammar ?? [],
    state.factCheckResults ?? [],
    state.plagiarism ?? { score: 0, matched_sources: [], verdict: "original" },
    state.aiDetection ?? { score: 0, verdict: "human" },
    state.classification!,
    state.tone!,
  );

  return { report };
}

// ---------------------------------------------------------------------------
// Graph wiring
// ---------------------------------------------------------------------------

const graph = new StateGraph(AnalysisAnnotation)
  .addNode("classifyAndTone", classifyAndToneNode)
  .addNode("interruptTone", interruptToneNode)
  .addNode("parallelAnalysis", parallelAnalysisNode)
  .addNode("generateReport", generateReportNode)
  .addEdge(START, "classifyAndTone")
  .addConditionalEdges("classifyAndTone", (state) =>
    state.tone?.ask_user ? "interruptTone" : "parallelAnalysis",
  )
  .addEdge("interruptTone", "parallelAnalysis")
  .addEdge("parallelAnalysis", "generateReport")
  .addEdge("generateReport", END);

// MemorySaver is a module-level singleton so thread state persists across
// the two HTTP requests needed for the human-in-the-loop interrupt flow.
export const checkpointer = new MemorySaver();
export const compiledGraph = graph.compile({ checkpointer });

// Re-export Command so index.ts can resume without importing langgraph directly
export { Command };
