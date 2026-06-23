import { useState, useEffect, useCallback, useRef } from "react";
import { useHarperLint, lintTextWithHarper } from "./hooks/useHarperLint";
import { useGdocsSync } from "./hooks/useGdocsSync";
import { htmlToText } from "./utils/htmlToText";
import axios from "axios";
import StepIndicator from "./components/StepIndicator";
import DocumentInput from "./components/DocumentInput";
import CheckOptions from "./components/CheckOptions";
import ReviewDocument from "./components/ReviewDocument";
import SuggestionList from "./components/SuggestionList";
import PolishedResult from "./components/PolishedResult";
import SeoSection from "./components/SeoSection";
import FactCheckSection from "./components/FactCheckSection";
import type {
  SeoCheckResult,
  FactCheckResult,
} from "./types";

export type SuggestionType = "grammar" | "punctuation" | "paraphrase" | "passive-voice" | "passive-voice-agentless" | "sentence-length";
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
  passiveVoice: boolean;
  sentenceLength: boolean;
  seo: boolean;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
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
  const out: Suggestion[] = [];

  for (const s of raw) {
    // Mechanical fixes (spelling, spacing, doubled words) are identical wherever
    // they appear, so surface EVERY occurrence — otherwise "fix all" leaves the
    // repeats behind and they reappear as "new" issues on the next run. Context-
    // dependent rewrites (paraphrase/passive/sentence-length) only ever apply to
    // the single span the model judged, so those keep their first-match behaviour.
    const expandAll = s.type === "grammar" || s.type === "punctuation";
    let searchFrom = 0;
    let occurrence = 0;

    while (searchFrom <= text.length) {
      const found = text.indexOf(s.original, searchFrom);
      if (found === -1) break;
      const end = found + s.original.length;
      const overlaps = usedRanges.some(([us, ue]) => found < ue && end > us);
      const alreadyApplied = text.slice(found, found + s.replacement.length) === s.replacement;
      if (!overlaps && !alreadyApplied) {
        usedRanges.push([found, end]);
        out.push({
          ...s,
          id: occurrence === 0 ? s.id : `${s.id}-${occurrence}`,
          status: "pending" as const,
          start: found,
          end,
        });
        occurrence++;
        if (!expandAll) break;
      }
      searchFrom = found + 1;
    }
  }

  return out;
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

// Replace the first occurrence of `original` with `replacement` across the text
// nodes of `root`. Operating on text-node values (not the raw HTML string) means
// matching is done against the same decoded text the suggestions were computed
// from, so it is immune to HTML entity escaping (&amp;, &lt;) and to text being
// split across inline formatting tags (<strong>, <em>). Returns true if applied.
function replaceFirstAcrossTextNodes(
  root: HTMLElement,
  original: string,
  replacement: string,
): boolean {
  if (!original) return false;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  // Concatenate node values with their offsets so we can locate a match that
  // may span several nodes. No separators are inserted, so a span that crosses
  // a block boundary (which only exists in the stripped text) won't false-match.
  let combined = "";
  const ranges: Array<{ node: Text; start: number; end: number }> = [];
  for (const node of nodes) {
    const start = combined.length;
    combined += node.nodeValue ?? "";
    ranges.push({ node, start, end: combined.length });
  }

  const idx = combined.indexOf(original);
  if (idx === -1) return false;
  const endIdx = idx + original.length;

  let placed = false;
  for (const r of ranges) {
    if (r.end <= idx || r.start >= endIdx) continue; // node outside the match
    const value = r.node.nodeValue ?? "";
    const localStart = Math.max(idx, r.start) - r.start;
    const localEnd = Math.min(endIdx, r.end) - r.start;
    if (!placed) {
      // First spanned node carries the whole replacement.
      r.node.nodeValue = value.slice(0, localStart) + replacement + value.slice(localEnd);
      placed = true;
    } else {
      // Remaining spanned nodes just drop their portion of the match.
      r.node.nodeValue = value.slice(0, localStart) + value.slice(localEnd);
    }
  }
  return placed;
}

// Applies all accepted corrections to an HTML document while preserving its
// formatting (headings, bold, etc.). Used for Google Docs / rich-text mode.
export function applyAcceptedToHtml(html: string, suggestions: Suggestion[]): string {
  const accepted = suggestions.filter(
    (s) => s.status === "accepted" && s.original && s.original !== s.replacement,
  );
  if (accepted.length === 0) return html;

  const div = document.createElement("div");
  div.innerHTML = html;
  for (const s of accepted) {
    replaceFirstAcrossTextNodes(div, s.original, s.replacement);
  }
  return div.innerHTML;
}

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inputMode, setInputMode] = useState<"paste" | "rich" | "upload" | "sample">("paste");
  const [richHtml, setRichHtml] = useState("");
  const [content, setContent] = useState("");
  const [displayHtml, setDisplayHtml] = useState<string | undefined>(undefined);

  // ── Google Docs state ──────────────────────────────────────────────────────
  const [richEditorResetKey, setRichEditorResetKey] = useState(0);
  const [gdocsConnected, setGdocsConnected] = useState(false);
  const [gdocsConfigured, setGdocsConfigured] = useState(false);
  const [gdocsImporting, setGdocsImporting] = useState(false);
  const [gdocsCreating, setGdocsCreating] = useState(false);
  const [gdocsDocUrl, setGdocsDocUrl] = useState<string | null>(null);
  const [importedDocTitle, setImportedDocTitle] = useState<string | null>(null);
  const [importedDocId, setImportedDocId] = useState<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gdocsPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gdocsSyncStatus, setGdocsSyncStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [gdocsExternalChangeNotice, setGdocsExternalChangeNotice] = useState<string | null>(null);
  const [fixAllSaved, setFixAllSaved] = useState(false);
  const gdocsSessionId = localStorage.getItem("gdocs_session");

  // Check connection status on mount + handle OAuth redirect callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gdocsParam = params.get("gdocs");
    const sessionParam = params.get("session");

    if (gdocsParam === "connected" && sessionParam) {
      localStorage.setItem("gdocs_session", sessionParam);
      setGdocsConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const stored = localStorage.getItem("gdocs_session");
    if (stored) {
      axios
        .get<{ connected: boolean; configured: boolean }>("/api/gdocs/status", {
          headers: { "x-gdocs-session": stored },
        })
        .then((r) => {
          setGdocsConfigured(r.data.configured);
          setGdocsConnected(r.data.connected);
        })
        .catch(() => {});
    } else {
      // Still check if the integration is configured even without a session
      axios
        .get<{ connected: boolean; configured: boolean }>("/api/gdocs/status")
        .then((r) => setGdocsConfigured(r.data.configured))
        .catch(() => {});
    }
  }, []);

  const gdocsHeaders = () => {
    const s = localStorage.getItem("gdocs_session");
    return s ? { "x-gdocs-session": s } : {};
  };

  const handleGdocsConnect = async () => {
    const res = await axios.get<{ url: string }>("/api/gdocs/auth-url");
    window.location.href = res.data.url;
  };

  const handleGdocsDisconnect = async () => {
    const s = localStorage.getItem("gdocs_session");
    if (s) {
      try {
        await axios.post("/api/gdocs/disconnect", {}, { headers: { "x-gdocs-session": s } });
      } catch {
        // best-effort — clear client state regardless
      }
      localStorage.removeItem("gdocs_session");
      localStorage.removeItem("gdocs_last_doc");
    }
    setGdocsConnected(false);
    setImportedDocId(null);
    setImportedDocTitle(null);
    setGdocsDocUrl(null);
  };

  const handleGdocsImport = async (fileId: string) => {
    setGdocsImporting(true);
    try {
      const res = await axios.post<{ content: string; title: string; docId: string }>(
        "/api/gdocs/import",
        { fileId },
        { headers: gdocsHeaders() },
      );
      // Server now returns HTML with heading styles and inline formatting preserved.
      const htmlContent = res.data.content;
      setContent(htmlContent);
      setRichHtml(htmlContent);
      setRichEditorResetKey((k) => k + 1); // force Tiptap to re-mount with new content
      setImportedDocTitle(res.data.title);
      setImportedDocId(res.data.docId);
      setGdocsDocUrl(`https://docs.google.com/document/d/${res.data.docId}/edit`);
      setInputMode("rich");
      localStorage.setItem("gdocs_last_doc", JSON.stringify({ docId: res.data.docId, title: res.data.title }));
    } finally {
      setGdocsImporting(false);
    }
  };

  const handleCreateGdoc = async () => {
    setGdocsCreating(true);
    try {
      const textToSave = inputMode === "rich" ? richHtml : content;
      const res = await axios.post<{ docId: string; docUrl: string }>(
        "/api/gdocs/create-doc",
        { content: textToSave, title: importedDocTitle || "New Document" },
        { headers: gdocsHeaders() },
      );
      setGdocsDocUrl(res.data.docUrl);
      setImportedDocId(res.data.docId);
      window.open(res.data.docUrl, "_blank", "noopener,noreferrer");
    } finally {
      setGdocsCreating(false);
    }
  };
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<CheckOptionsState>({
    grammar: true,
    // Punctuation check retired — too many phantom/hallucinated fixes. Grammar
    // still covers genuine sentence-level mistakes.
    punctuation: false,
    paraphrase: false,
    passiveVoice: false,
    sentenceLength: false,
    seo: false,
    metaTitle: "",
    metaDescription: "",
    focusKeyword: "",
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const [seoResult, setSeoResult] = useState<SeoCheckResult | null>(null);

  // Fact-check state (triggered by a button on steps 2 & 3)
  const [factCheckResult, setFactCheckResult] = useState<FactCheckResult[] | null>(null);
  const [factChecking, setFactChecking] = useState(false);

  const onExternalChange = useCallback((html: string, title: string) => {
    setGdocsExternalChangeNotice(`"${title}" was updated in Google Docs — editor refreshed.`);
    setRichHtml(html);
    setRichEditorResetKey((k) => k + 1);
    setTimeout(() => setGdocsExternalChangeNotice(null), 5000);
  }, []);

  const onSyncError = useCallback((_msg: string) => {
    setGdocsSyncStatus("error");
  }, []);

  const { pushToGdoc, syncStatus, suppressEmitRef } = useGdocsSync({
    docId: importedDocId,
    sessionId: gdocsSessionId,
    enabled: step === 1 && gdocsConnected,
    onExternalChange,
    onSyncError,
  });

  // Keep gdocsSyncStatus in sync with hook's syncStatus
  useEffect(() => {
    setGdocsSyncStatus(syncStatus);
  }, [syncStatus]);

  const computePolishedContent = (sug: typeof suggestions) => {
    if (inputMode === "rich" && richHtml) {
      return applyAcceptedToHtml(richHtml, sug);
    }
    return applyAccepted(content, sug);
  };

  // Step-2 debounced sync: push accepted corrections back to Google Docs via HTTP.
  // For rich mode we apply corrections directly to the HTML so formatting is preserved.
  useEffect(() => {
    if (step !== 2 || !importedDocId || !gdocsConnected) return;

    // Only sync once the user has actually accepted something. Posting with no
    // accepted corrections would round-trip the unchanged document through Drive's
    // HTML conversion for no reason (and can subtly reflow its formatting).
    if (!suggestions.some((s) => s.status === "accepted")) return;

    const contentToSync = computePolishedContent(suggestions);

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      setGdocsSyncStatus("syncing");
      try {
        const s = localStorage.getItem("gdocs_session");
        await axios.post(
          "/api/gdocs/update-doc",
          { docId: importedDocId, content: contentToSync },
          { headers: s ? { "x-gdocs-session": s } : {} },
        );
        setGdocsSyncStatus("idle");
      } catch (err) {
        console.error("Google Docs sync failed:", err);
        setGdocsSyncStatus("error");
      }
    }, 1500);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [suggestions, step, importedDocId, gdocsConnected, inputMode, richHtml, content]);

  const handleRichHtmlChange = useCallback(
    (html: string) => {
      setRichHtml(html);
      if (step === 1 && importedDocId && gdocsConnected && !suppressEmitRef.current) {
        if (gdocsPushTimerRef.current) clearTimeout(gdocsPushTimerRef.current);
        gdocsPushTimerRef.current = setTimeout(() => {
          pushToGdoc(html);
          // Cleared once flushed so a pending-edit check can tell whether the
          // local editor is ahead of the Google Doc (see refreshRichHtmlFromGdoc).
          gdocsPushTimerRef.current = null;
        }, 500);
      }
    },
    [step, importedDocId, gdocsConnected, suppressEmitRef, pushToGdoc],
  );

  // Harper live lint — drives the live grammar-issue count badge in the editor.
  // The actual suggestions used for review are produced by a one-shot lint in
  // handleAnalyze so positions match the analyzed text across all input modes.
  const harperText =
    inputMode === "sample" ? SAMPLE_TEXT :
    inputMode === "paste" ? content :
    inputMode === "rich" ? htmlToText(richHtml) :
    "";
  const { count: harperCount, loading: harperLoading } = useHarperLint(harperText);

  /** Builds FormData for both analysis endpoints. Reports validation errors via the provided setter. */
  function buildFormData(onError: (msg: string) => void, richHtmlOverride?: string): FormData | null {
    const richSource = richHtmlOverride ?? richHtml;
    const textForAnalysis =
      inputMode === "sample" ? SAMPLE_TEXT :
      inputMode === "paste" ? htmlToText(content) :
      inputMode === "rich" ? htmlToText(richSource) :
      null;

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

  /**
   * For a connected Google Doc, re-read its CURRENT content so analysis reflects
   * the live document rather than a local mirror that may have drifted — e.g.
   * corrections applied in a previous run/session live in the doc but not always
   * in `richHtml`, which otherwise makes the tool re-flag already-fixed issues.
   * Returns the freshest HTML to analyze (falls back to local `richHtml`).
   */
  const refreshRichHtmlFromGdoc = async (): Promise<string> => {
    if (inputMode !== "rich" || !gdocsConnected || !importedDocId) return richHtml;
    // A pending push means the local editor has unsaved edits the doc doesn't
    // have yet — local is the freshest copy, so don't overwrite it from the doc.
    if (gdocsPushTimerRef.current) return richHtml;
    try {
      const res = await axios.post<{ content: string }>(
        "/api/gdocs/import",
        { fileId: importedDocId },
        { headers: gdocsHeaders() },
      );
      const fresh = res.data.content;
      if (fresh && fresh !== richHtml) {
        setRichHtml(fresh);
        setRichEditorResetKey((k) => k + 1);
      }
      return fresh || richHtml;
    } catch {
      return richHtml; // offline / transient error — analyze the local copy
    }
  };

  /** Original grammar-only analysis — drives steps 1 → 2 → 3. */
  const handleAnalyze = async () => {
    setLoading(true);
    const freshRichHtml = await refreshRichHtmlFromGdoc();

    const formData = buildFormData(setError, freshRichHtml);
    if (!formData) {
      setLoading(false);
      return;
    }

    // Capture original HTML for display (headings, formatting) before we strip it.
    // For rich mode use the freshly-read HTML; for paste mode use content if it contains HTML tags.
    const capturedDisplayHtml =
      inputMode === "rich" ? freshRichHtml :
      (inputMode === "paste" && /<[^>]+>/.test(content) ? content : undefined);

    // Pre-compute stripped text for rich mode so we have clean plain-text positions
    // regardless of what the server echoes back as sourceContent.
    const richStripped =
      inputMode === "rich"
        ? htmlToText(freshRichHtml)
        : null;

    setError("");
    setWarning("");
    formData.append("options", JSON.stringify(options));

    try {
      const response = await axios.post("/api/analyze", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const sourceContent: string =
        richStripped ||
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

      // Grammar comes solely from Harper now (the LLM grammar layer was removed
      // for hallucinating). Lint the exact analyzed text so offsets are correct
      // for every input mode — including uploads, which the live lint never saw.
      // Punctuation-kind lints are dropped (that check is retired); Harper
      // grammar is only included when the user enabled the Grammar option.
      const harperGrammar = options.grammar
        ? (await lintTextWithHarper(sourceContent))
            .filter((h) => h.type === "grammar")
            .filter(
              (h) =>
                h.end <= sourceContent.length &&
                !computed.some(
                  (l) => l.start !== -1 && h.start < l.end && h.end > l.start,
                ),
            )
            .map((h, i) => ({ ...h, id: `harper-${i}` }))
        : [];

      setContent(sourceContent);
      setDisplayHtml(capturedDisplayHtml);
      setSuggestions([...computed, ...harperGrammar]);
      if (response.data.seoResult) setSeoResult(response.data.seoResult as SeoCheckResult);
      else setSeoResult(null);
      if (response.data.warning) setWarning(response.data.warning);

      setStep(2);
    } catch {
      setError("Failed to analyse document. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  };

  /** Fact-check the current document text via the /api/fact-check endpoint. */
  const handleFactCheck = async () => {
    setFactChecking(true);
    try {
      const res = await axios.post("/api/fact-check", { content });
      setFactCheckResult(res.data.factCheckResults as FactCheckResult[]);
    } catch {
      setError("Fact check failed. Make sure the server is running.");
    } finally {
      setFactChecking(false);
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

  const handleFixAll = () => {
    const newSuggestions = suggestions.map((s) =>
      s.status === "pending" && s.type !== "passive-voice-agentless"
        ? { ...s, status: "accepted" as const }
        : s,
    );
    setSuggestions(newSuggestions);

    if (inputMode === "rich") {
      const polished = computePolishedContent(newSuggestions);
      setRichHtml(polished);
      if (gdocsConnected && importedDocId) {
        const sid = localStorage.getItem("gdocs_session");
        setGdocsSyncStatus("syncing");
        axios
          .post(
            "/api/gdocs/update-doc",
            { docId: importedDocId, content: polished },
            { headers: sid ? { "x-gdocs-session": sid } : {} },
          )
          .then(() => {
            setGdocsSyncStatus("idle");
            setFixAllSaved(true);
            setTimeout(() => setFixAllSaved(false), 3000);
          })
          .catch((err) => {
            console.error("Google Docs fix-all sync failed:", err);
            setGdocsSyncStatus("error");
          });
      }
    } else {
      setContent(applyAccepted(content, newSuggestions));
    }
  };

  const handleDismissAll = () =>
    setSuggestions((prev) =>
      prev.map((s) => (s.status === "pending" ? { ...s, status: "dismissed" } : s)),
    );

  const handleNewDocument = () => {
    if (gdocsPushTimerRef.current) {
      clearTimeout(gdocsPushTimerRef.current);
      gdocsPushTimerRef.current = null;
    }
    setStep(1);
    setContent("");
    setRichHtml("");
    setDisplayHtml(undefined);
    setFile(null);
    setSuggestions([]);
    setError("");
    setWarning("");
    setInputMode("paste");
    setSeoResult(null);
    setFactCheckResult(null);
    setFactChecking(false);
    setGdocsDocUrl(null);
    setImportedDocTitle(null);
    setImportedDocId(null);
    setRichEditorResetKey(0);
  };

  const polishedContent = applyAccepted(content, suggestions);
  const acceptedCount = suggestions.filter((s) => s.status === "accepted").length;
  const doneCount = suggestions.filter((s) => s.status !== "pending").length;
  const isWriteMode = inputMode === "rich" && gdocsConnected && !!importedDocId;

  return (
    <div className="refine-app">
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
                richHtml={richHtml}
                setRichHtml={handleRichHtmlChange}
                file={file}
                setFile={setFile}
                harperCount={harperCount}
                harperLoading={harperLoading}
                gdocsConnected={gdocsConnected}
                gdocsConfigured={gdocsConfigured}
                gdocsImporting={gdocsImporting}
                gdocsCreating={gdocsCreating}
                gdocsDocUrl={gdocsDocUrl}
                importedDocTitle={importedDocTitle}
                richEditorResetKey={richEditorResetKey}
                onGdocsConnect={handleGdocsConnect}
                onGdocsImport={handleGdocsImport}
                onCreateGdoc={handleCreateGdoc}
                onGdocsDisconnect={handleGdocsDisconnect}
                gdocsSyncStatus={gdocsSyncStatus}
                gdocsExternalChangeNotice={gdocsExternalChangeNotice}
              />
              <CheckOptions
                options={options}
                setOptions={setOptions}
                onAnalyse={handleAnalyze}
                loading={loading}
                error={error}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="refine-step2">
              {warning && <div className="warning-banner">{warning}</div>}
              <div className="refine-step2-panels">
                <ReviewDocument
                  content={content}
                  suggestions={suggestions}
                  inputMode={inputMode}
                  sourceHtml={displayHtml}
                />
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

                {isWriteMode ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {fixAllSaved && gdocsSyncStatus !== "error" && (
                      <span className="gdocs-sync-pill ok" style={{ marginLeft: 0 }}>
                        ✓ Saved to Google Docs
                      </span>
                    )}
                    {gdocsSyncStatus === "syncing" && (
                      <span className="gdocs-sync-pill" style={{ marginLeft: 0 }}>
                        Saving to Google Docs…
                      </span>
                    )}
                    {gdocsSyncStatus === "error" && (
                      <span className="gdocs-sync-pill error" style={{ marginLeft: 0 }}>
                        ⚠ Couldn’t save to Google Docs
                      </span>
                    )}
                    <button className="btn-ghost" onClick={handleNewDocument}>
                      New Document
                    </button>
                    <a
                      className="btn-primary"
                      href={`https://docs.google.com/document/d/${importedDocId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Google Docs ↗
                    </a>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
            <FactCheckSection result={factCheckResult} loading={factChecking} onRun={handleFactCheck} />
            {seoResult && <SeoSection result={seoResult} />}
          </>
        )}

        {step === 3 && (
          <>
            <PolishedResult
              polishedContent={polishedContent}
              originalContent={content}
              sourceHtml={displayHtml}
              suggestions={suggestions}
              onReview={() => setStep(2)}
              onNewDocument={handleNewDocument}
            />
            <FactCheckSection result={factCheckResult} loading={factChecking} onRun={handleFactCheck} />
            {seoResult && <SeoSection result={seoResult} />}
          </>
        )}
      </main>
    </div>
  );
}
