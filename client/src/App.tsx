import { useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import StepIndicator from "./components/StepIndicator";
import DocumentInput from "./components/DocumentInput";
import CheckOptions from "./components/CheckOptions";
import ReviewDocument from "./components/ReviewDocument";
import SuggestionList from "./components/SuggestionList";
import PolishedResult from "./components/PolishedResult";
import ToneSelector from "./components/ToneSelector";
import ReportDisplay from "./components/ReportDisplay";
import AnalysisProgress, { type ProgressItem } from "./components/AnalysisProgress";
import type {
  AnalyzeFullResponse,
  DetectedTone,
  FullReport,
} from "./types";

export type SuggestionType = "grammar" | "punctuation" | "paraphrase";
export type SuggestionStatus = "pending" | "accepted" | "dismissed";

export interface Suggestion {
  id: string;
  type: SuggestionType;
  original: string;
  replacement: string;
  explanation: string;
  status: SuggestionStatus;
  start: number;
  end: number;
}

export interface CheckOptionsState {
  grammar: boolean;
  punctuation: boolean;
  paraphrase: boolean;
}

export const SAMPLE_TEXT =
  "The Eiffel Tower, completed in 1889, stands 330 metres tall and attract over 7 million visitors " +
  "each year, making it the most visited paid monument in the world. Albert Einstein published his " +
  "special theory of relativity in 1905, and it have since been confirmed by many experiments. " +
  "The Amazon rainforest produce approximately 20 percent of the world's oxygen, a figure that " +
  "scientists considers well-established. Many employee feels that remote work are more productive " +
  "than office-based roles, and companys that adopts flexible policies often reports higher staff " +
  "retention. It is definately important to balance these finding with rigorous scientific evidence.";

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function computePositions(
  text: string,
  raw: Array<{
    id: string;
    type: SuggestionType;
    original: string;
    replacement: string;
    explanation: string;
  }>,
): Suggestion[] {
  const usedRanges: Array<[number, number]> = [];
  return raw.map((s) => {
    let searchFrom = 0;
    let pos = -1;
    while (searchFrom <= text.length) {
      const found = text.indexOf(s.original, searchFrom);
      if (found === -1) break;
      const end = found + s.original.length;
      const overlaps = usedRanges.some(([us, ue]) => found < ue && end > us);
      if (!overlaps) {
        pos = found;
        usedRanges.push([found, end]);
        break;
      }
      searchFrom = found + 1;
    }
    return {
      ...s,
      status: "pending",
      start: pos,
      end: pos === -1 ? -1 : pos + s.original.length,
    };
  });
}

export function applyAccepted(text: string, suggestions: Suggestion[]): string {
  const accepted = suggestions
    .filter((s) => s.status === "accepted" && s.start !== -1)
    .sort((a, b) => b.start - a.start);
  let result = text;
  for (const s of accepted) {
    result = result.slice(0, s.start) + s.replacement + result.slice(s.end);
  }
  return result;
}

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [inputMode, setInputMode] = useState<"paste" | "upload" | "sample">("paste");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<CheckOptionsState>({
    grammar: true,
    punctuation: true,
    paraphrase: false,
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fullError, setFullError] = useState("");
  const [warning, setWarning] = useState("");

  // Full analysis report state
  const [fullReport, setFullReport] = useState<FullReport | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [toneQuestion, setToneQuestion] = useState<{
    options: DetectedTone[];
    detected: DetectedTone;
    confidence: number;
  } | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);

  /** Builds FormData for both analysis endpoints. Reports validation errors via the provided setter. */
  function buildFormData(onError: (msg: string) => void): FormData | null {
    const textForAnalysis =
      inputMode === "sample"
        ? SAMPLE_TEXT
        : inputMode === "paste"
          ? content
          : null;

    if (inputMode !== "upload" && !textForAnalysis?.trim()) {
      onError("Please enter some text or choose a file.");
      return null;
    }
    if (inputMode === "upload" && !file) {
      onError("Please select a file to upload.");
      return null;
    }

    const formData = new FormData();
    if (inputMode === "upload" && file) {
      formData.append("document", file);
    } else {
      formData.append("content", textForAnalysis || "");
    }
    return formData;
  }

  /** Original grammar-only analysis — drives steps 1 → 2 → 3. */
  const handleAnalyze = async () => {
    const formData = buildFormData(setError);
    if (!formData) return;

    setLoading(true);
    setError("");
    setWarning("");
    formData.append("options", JSON.stringify(options));

    try {
      const response = await axios.post("/api/analyze", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const sourceContent: string =
        response.data.sourceContent ||
        (inputMode === "sample" ? SAMPLE_TEXT : content) ||
        "";

      const rawSuggestions: Array<{
        type: SuggestionType;
        original: string;
        replacement: string;
        explanation: string;
      }> = response.data.suggestions || [];

      const withIds = rawSuggestions.map((s, i) => ({ ...s, id: String(i) }));
      const computed = computePositions(sourceContent, withIds);

      setContent(sourceContent);
      setSuggestions(computed);
      if (response.data.warning) setWarning(response.data.warning);

      setStep(2);
    } catch {
      setError("Failed to analyse document. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  };

  /** Full autonomous analysis via SSE — drives step 1 → 4 (via optional tone interrupt). */
  const handleFullAnalyze = async () => {
    const formData = buildFormData(setFullError);
    if (!formData) return;

    setFullLoading(true);
    setProgressItems([]);
    setFullError("");
    setWarning("");

    try {
      const response = await fetch("/api/analyze-full-stream", {
        method: "POST",
        body: formData,
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let currentData = "";

      const handleEvent = (eventName: string, dataStr: string) => {
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>;
          if (eventName === "status") {
            setProgressItems((prev) => [
              ...prev,
              { stage: data.stage as string, message: data.message as string, ts: Date.now() },
            ]);
          } else if (eventName === "warning") {
            setWarning(data.message as string);
          } else if (eventName === "interrupt") {
            setThreadId(data.threadId as string);
            setToneQuestion({
              options: data.options as DetectedTone[],
              detected: data.detected as DetectedTone,
              confidence: data.confidence as number,
            });
          } else if (eventName === "report") {
            setFullReport((data.report as AnalyzeFullResponse["report"]));
            setStep(4);
          } else if (eventName === "error") {
            setFullError(data.message as string);
          }
        } catch { /* ignore parse errors */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6).trim();
          } else if (line === "" && currentEvent && currentData) {
            handleEvent(currentEvent, currentData);
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } catch {
      setFullError("Full analysis failed. Make sure the server is running.");
    } finally {
      setFullLoading(false);
    }
  };

  /** Resume full analysis after human confirms tone. */
  const handleToneConfirm = async (tone: string) => {
    if (!threadId) return;
    setFullLoading(true);
    setProgressItems((prev) => [
      ...prev,
      { stage: "resume", message: `Tone confirmed: "${tone}" — resuming analysis…`, ts: Date.now() },
    ]);
    try {
      const response = await axios.post<AnalyzeFullResponse>(
        "/api/resume-analysis",
        { threadId, tone },
      );
      setToneQuestion(null);
      setProgressItems((prev) => [
        ...prev,
        { stage: "parallelAnalysis", message: "Grammar, fact-check, and plagiarism checks complete", ts: Date.now() },
        { stage: "generateReport", message: "Executive summary generated", ts: Date.now() },
      ]);
      setFullReport(response.data.report);
      setStep(4);
    } catch {
      setFullError("Failed to resume analysis.");
    } finally {
      setFullLoading(false);
    }
  };

  const handleAccept = (id: string) =>
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "accepted" } : s)),
    );

  const handleDismiss = (id: string) =>
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "dismissed" } : s)),
    );

  const handleFixAll = () =>
    setSuggestions((prev) =>
      prev.map((s) => (s.status === "pending" ? { ...s, status: "accepted" } : s)),
    );

  const handleDismissAll = () =>
    setSuggestions((prev) =>
      prev.map((s) => (s.status === "pending" ? { ...s, status: "dismissed" } : s)),
    );

  const handleNewDocument = () => {
    setStep(1);
    setContent("");
    setFile(null);
    setSuggestions([]);
    setError("");
    setFullError("");
    setWarning("");
    setInputMode("paste");
    setFullReport(null);
    setThreadId(null);
    setToneQuestion(null);
    setProgressItems([]);
  };

  const polishedContent = applyAccepted(content, suggestions);
  const acceptedCount = suggestions.filter((s) => s.status === "accepted").length;
  const doneCount = suggestions.filter((s) => s.status !== "pending").length;

  return (
    <div className="refine-app">
      {/* Tone selector overlay — shown when full analysis needs user input */}
      {toneQuestion && (
        <ToneSelector
          detected={toneQuestion.detected}
          confidence={toneQuestion.confidence}
          options={toneQuestion.options}
          onConfirm={handleToneConfirm}
          loading={fullLoading}
        />
      )}

      <header className="refine-header">
        <div className="refine-logo">
          <div className="refine-logo-icon">✦</div>
          <div>
            <div className="refine-logo-name">Refine</div>
            <div className="refine-logo-sub">AI WRITING ASSISTANT by Samad</div>
          </div>
        </div>

        <StepIndicator currentStep={step} />

        <div className={`refine-status ${step === 1 ? "ready" : "live"}`}>
          <span className="status-dot" />
          {step === 1 ? "ready" : "AI · live"}
        </div>
      </header>

      <main className="refine-main">
        {step === 1 && (
          <>
            <div className="refine-hero">
              <p className="refine-eyebrow">THREE STEPS TO A CLEANER DRAFT</p>
              <h1 className="refine-headline">
                Polish your writing,
                <br />
                <em>one change at a time.</em>
              </h1>
              <p className="refine-subhead">
                Add a document, choose what to check, and approve each suggestion. Grammar,
                punctuation and paraphrasing — you stay in control of every change.
              </p>
            </div>

            <div className="refine-step1-panels">
              <DocumentInput
                inputMode={inputMode}
                setInputMode={setInputMode}
                content={content}
                setContent={setContent}
                file={file}
                setFile={setFile}
              />
              <CheckOptions
                options={options}
                setOptions={setOptions}
                onAnalyse={handleAnalyze}
                loading={loading || fullLoading}
                error={error}
              />
            </div>

            {/* Full analysis button */}
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "10px",
              }}
            >
              {fullError && (
                <span style={{ fontSize: "0.8rem", color: "var(--clr-error)" }}>
                  {fullError}
                </span>
              )}
              <button
                className="btn-primary"
                onClick={handleFullAnalyze}
                disabled={loading || fullLoading}
                style={{ fontSize: "0.875rem", width: "100%" }}
              >
                {fullLoading && progressItems.length === 0 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                    Starting…
                  </span>
                ) : (
                  "Full report (fact check + plagiarism)"
                )}
              </button>
            </div>

            <AnalysisProgress items={progressItems} loading={fullLoading} />
          </>
        )}

        {step === 2 && (
          <div className="refine-step2">
            {warning && <div className="warning-banner">{warning}</div>}
            <div className="refine-step2-panels">
              <ReviewDocument content={content} suggestions={suggestions} />
              <SuggestionList
                suggestions={suggestions}
                doneCount={doneCount}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onFixAll={handleFixAll}
                onDismissAll={handleDismissAll}
              />
            </div>
            <div className="refine-step2-footer">
              <button className="btn-ghost" onClick={() => setStep(1)}>
                ← Back to edit
              </button>
              <span className="changes-label">
                {acceptedCount} change{acceptedCount !== 1 ? "s" : ""} will be applied
              </span>
              <button
                className="btn-primary"
                onClick={() => setStep(3)}
                disabled={loading}
              >
                See polished result →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <PolishedResult
            polishedContent={polishedContent}
            originalContent={content}
            suggestions={suggestions}
            onReview={() => setStep(2)}
            onNewDocument={handleNewDocument}
            onFullReport={handleFullAnalyze}
            fullReportLoading={fullLoading}
          />
        )}

        {step === 4 && fullReport && (
          <ReportDisplay report={fullReport} onNewDocument={handleNewDocument} />
        )}
      </main>
    </div>
  );
}
