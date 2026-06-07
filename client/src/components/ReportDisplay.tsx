import { FileDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { AiVerdict, FullReport } from "../types";

interface ReportDisplayProps {
  report: FullReport;
  onNewDocument: () => void;
}

const VERDICT_STYLES: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  verified: { bg: "#ecfdf5", color: "#059669", label: "Verified" },
  false: { bg: "#fef2f2", color: "#ef4444", label: "False" },
  unverified: { bg: "#fffbeb", color: "#d97706", label: "Unverified" },
};

const PLAGIARISM_STYLES: Record<
  string,
  { bg: string; color: string; bar: string }
> = {
  original: { bg: "#ecfdf5", color: "#059669", bar: "#10b981" },
  partial: { bg: "#fffbeb", color: "#d97706", bar: "#f59e0b" },
  plagiarised: { bg: "#fef2f2", color: "#ef4444", bar: "#ef4444" },
};

const AI_DETECTION_STYLES: Record<AiVerdict, { bg: string; color: string; bar: string; label: string }> = {
  human: { bg: "#ecfdf5", color: "#059669", bar: "#10b981", label: "Human-written" },
  mixed: { bg: "#fffbeb", color: "#d97706", bar: "#f59e0b", label: "Mixed" },
  ai:    { bg: "#fef2f2", color: "#ef4444", bar: "#ef4444", label: "AI-generated" },
};

const GRAMMAR_TYPE_COLORS: Record<string, string> = {
  grammar: "var(--clr-grammar)",
  punctuation: "var(--clr-punctuation)",
  paraphrase: "var(--clr-paraphrase)",
};

const PLATFORM_LABELS: Record<string, string> = {
  substack: "Substack",
  twitter: "Twitter / X",
  email: "Email",
  medium: "Medium",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  article: "Article",
  tweet_thread: "Tweet Thread",
  message: "Message",
  academic_paper: "Academic Paper",
  legal_doc: "Legal Document",
  essay: "Essay",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--clr-text-secondary)",
        marginBottom: "12px",
      }}
    >
      {children}
    </h3>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--clr-surface)",
        border: "1px solid var(--clr-border)",
        borderRadius: "var(--radius-md)",
        padding: "20px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <span
        style={{
          fontSize: "0.7rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--clr-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          color: "var(--clr-text)",
          textTransform: "capitalize",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const PDF_STAGES = [
  { at: 0,  label: "Preparing report data…" },
  { at: 22, label: "Building document layout…" },
  { at: 46, label: "Rendering all sections…" },
  { at: 72, label: "Finalising PDF…" },
  { at: 90, label: "Opening print dialog…" },
];

function PdfExportOverlay({
  onTriggerPdf,
  onDone,
}: {
  onTriggerPdf: () => void;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const triggered = useRef(false);

  useEffect(() => {
    let p = 0;
    const tick = () => {
      const step = p < 40 ? 2.4 : p < 75 ? 1.4 : p < 92 ? 0.7 : 0.35;
      p = Math.min(p + step + Math.random() * step * 0.4, 100);
      setProgress(Math.round(p));

      if (p >= 78 && !triggered.current) {
        triggered.current = true;
        onTriggerPdf();
      }

      if (p < 100) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(onDone, 420);
      }
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [onTriggerPdf, onDone]);

  const stage =
    [...PDF_STAGES].reverse().find((s) => progress >= s.at)?.label ??
    PDF_STAGES[0].label;

  const done = progress >= 100;
  const circumference = 2 * Math.PI * 44; // r=44

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          background: "var(--clr-surface)",
          border: "1px solid var(--clr-border)",
          borderRadius: "var(--radius-lg, 16px)",
          padding: "40px 48px",
          width: "min(420px, 90vw)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          textAlign: "center",
        }}
      >
        {/* Ring */}
        <div style={{ position: "relative", width: 100, height: 100, marginBottom: 28 }}>
          <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
            {/* Track */}
            <circle
              cx={50} cy={50} r={44}
              fill="none"
              stroke="var(--clr-border)"
              strokeWidth={5}
            />
            {/* Progress arc */}
            <circle
              cx={50} cy={50} r={44}
              fill="none"
              stroke={done ? "#10b981" : "var(--clr-primary, #1e2c6e)"}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress / 100)}
              style={{ transition: "stroke-dashoffset 0.08s linear, stroke 0.3s" }}
            />
          </svg>
          {/* Centre label */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
            }}
          >
            {done ? (
              <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>✓</span>
            ) : (
              <>
                <span
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "var(--clr-text)",
                    lineHeight: 1,
                  }}
                >
                  {progress}%
                </span>
              </>
            )}
          </div>
        </div>

        <p
          style={{
            fontSize: "1.05rem",
            fontWeight: 700,
            color: "var(--clr-text)",
            marginBottom: 6,
          }}
        >
          {done ? "PDF ready!" : "Generating your PDF report"}
        </p>

        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--clr-text-secondary)",
            minHeight: "1.4em",
            marginBottom: 24,
            transition: "opacity 0.2s",
          }}
        >
          {done ? "The print dialog is opening…" : stage}
        </p>

        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            height: 6,
            background: "var(--clr-border)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: done
                ? "#10b981"
                : "linear-gradient(90deg, var(--clr-primary, #1e2c6e), #4f6ef7)",
              borderRadius: 999,
              transition: "width 0.08s linear, background 0.3s",
            }}
          />
        </div>

        {/* Stage chips */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: 18,
          }}
        >
          {PDF_STAGES.map((s) => {
            const active = progress >= s.at;
            return (
              <span
                key={s.at}
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: active ? "#eff2ff" : "var(--clr-bg)",
                  color: active ? "var(--clr-primary, #1e2c6e)" : "var(--clr-text-muted)",
                  border: `1px solid ${active ? "#c7d2fe" : "var(--clr-border)"}`,
                  transition: "all 0.25s",
                }}
              >
                {s.label.replace("…", "")}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReportDisplay({ report, onNewDocument }: ReportDisplayProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const pl = report.plagiarism_summary;
  const plStyle =
    PLAGIARISM_STYLES[pl.verdict] ?? PLAGIARISM_STYLES["original"];
  const totalGrammarErrors = report.grammar_errors.reduce(
    (sum, g) => sum + g.count,
    0,
  );

  const executePdfDownload = () => {
    const aiStyle = AI_DETECTION_STYLES[report.ai_detection.verdict] ?? AI_DETECTION_STYLES["human"];

    const factRows = report.fact_check_results.map((fc) => {
      const vs = VERDICT_STYLES[fc.verdict] ?? VERDICT_STYLES["unverified"];
      return `
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;">
            <span style="padding:2px 9px;border-radius:999px;background:${vs.bg};color:${vs.color};font-size:0.7rem;font-weight:700;text-transform:uppercase;flex-shrink:0;">${vs.label}</span>
            <span style="font-size:0.875rem;color:#111827;line-height:1.5;">${fc.claim}</span>
          </div>
          <p style="font-size:0.8rem;color:#6b7280;margin:0 0 ${fc.source_url ? "4px" : "0"};">${fc.explanation}</p>
          ${fc.source_url ? `<a href="${fc.source_url}" style="font-size:0.75rem;color:#1e2c6e;word-break:break-all;">${fc.source_url}</a>` : ""}
        </div>`;
    }).join("");

    const grammarRows = report.grammar_errors.map((group) =>
      group.errors.map((err) =>
        `<div style="padding:7px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:5px;font-size:0.8rem;margin-bottom:5px;">
          <span style="color:#ef4444;">${err.original}</span>
          <span style="color:#9ca3af;margin:0 6px;">→</span>
          <span style="color:#10b981;">${err.replacement}</span>
          <span style="color:#6b7280;margin-left:10px;">${err.explanation}</span>
        </div>`
      ).join("")
    ).join("");

    const sourceRows = pl.matched_sources.map((src) =>
      `<div style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:5px;font-size:0.8rem;margin-bottom:5px;display:flex;gap:10px;align-items:center;">
        <span style="font-weight:600;color:#ef4444;flex-shrink:0;">${src.similarity_percentage}%</span>
        <span style="color:#111827;">${src.title || src.url}</span>
        <span style="color:#9ca3af;margin-left:auto;flex-shrink:0;">${src.matched_words} words</span>
      </div>`
    ).join("");

    const platformTags = report.platform_suggestions.map((p) =>
      `<span style="padding:3px 11px;background:#eff2ff;color:#1e2c6e;border-radius:999px;font-size:0.78rem;font-weight:500;border:1px solid #c7d2fe;margin:0 4px 4px 0;display:inline-block;">${PLATFORM_LABELS[p] ?? p}</span>`
    ).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Document Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;background:#fff;padding:40px;max-width:800px;margin:0 auto;font-size:14px;line-height:1.6;}
    h1{font-size:1.6rem;font-weight:700;margin-bottom:4px;}
    .eyebrow{font-size:0.65rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#1e2c6e;margin-bottom:6px;}
    .section{margin-bottom:28px;}
    .section-title{font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:18px 20px;margin-bottom:12px;}
    .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;}
    .meta-label{font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;margin-bottom:2px;}
    .meta-value{font-size:0.9rem;font-weight:600;text-transform:capitalize;}
    .progress-bar-bg{height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;}
    .progress-bar-fill{height:100%;border-radius:999px;}
    @media print{body{padding:20px;}@page{margin:1.5cm;}}
  </style>
</head>
<body>
  <div class="eyebrow">Full analysis report</div>
  <h1>Document Report</h1>
  <p style="font-size:0.78rem;color:#9ca3af;margin:4px 0 32px;">Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="card"><p style="font-size:0.9375rem;line-height:1.7;">${report.executive_summary}</p></div>
  </div>

  <div class="section">
    <div class="section-title">Document Metadata</div>
    <div class="card">
      <div class="meta-grid">
        <div><div class="meta-label">Content Type</div><div class="meta-value">${CONTENT_TYPE_LABELS[report.document_metadata.content_type] ?? report.document_metadata.content_type}</div></div>
        <div><div class="meta-label">Tone</div><div class="meta-value">${report.document_metadata.tone}</div></div>
        <div><div class="meta-label">Word Count</div><div class="meta-value">${report.document_metadata.word_count.toLocaleString()}</div></div>
        <div><div class="meta-label">Language</div><div class="meta-value">${report.document_metadata.language.toUpperCase()}</div></div>
      </div>
      ${platformTags ? `<div style="margin-top:10px;"><p style="font-size:0.72rem;font-weight:600;color:#6b7280;margin-bottom:6px;">Suggested platforms</p>${platformTags}</div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Grammar Analysis (${totalGrammarErrors} issue${totalGrammarErrors !== 1 ? "s" : ""})</div>
    ${totalGrammarErrors === 0
      ? `<p style="font-size:0.875rem;color:#6b7280;">No issues detected.</p>`
      : `<div class="card">${grammarRows}</div>`}
  </div>

  <div class="section">
    <div class="section-title">Fact Check (${report.fact_check_results.length} claim${report.fact_check_results.length !== 1 ? "s" : ""})</div>
    ${report.fact_check_results.length === 0
      ? `<p style="font-size:0.875rem;color:#6b7280;">No verifiable factual claims detected.</p>`
      : factRows}
  </div>

  <div class="section">
    <div class="section-title">AI Detection</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span>AI-generated probability</span>
        <span style="font-weight:600;color:${aiStyle.color};">${report.ai_detection.score}%</span>
      </div>
      <div class="progress-bar-bg" style="margin-bottom:12px;">
        <div class="progress-bar-fill" style="width:${Math.min(report.ai_detection.score, 100)}%;background:${aiStyle.bar};"></div>
      </div>
      <span style="padding:4px 12px;border-radius:999px;background:${aiStyle.bg};color:${aiStyle.color};font-size:0.75rem;font-weight:700;">${aiStyle.label}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Plagiarism Check</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span>Similarity score</span>
        <span style="font-weight:600;color:${plStyle.color};">${pl.score}%</span>
      </div>
      <div class="progress-bar-bg" style="margin-bottom:12px;">
        <div class="progress-bar-fill" style="width:${Math.min(pl.score, 100)}%;background:${plStyle.bar};"></div>
      </div>
      <span style="padding:4px 12px;border-radius:999px;background:${plStyle.bg};color:${plStyle.color};font-size:0.75rem;font-weight:700;text-transform:capitalize;">${pl.verdict}</span>
      ${sourceRows ? `<div style="margin-top:14px;">${sourceRows}</div>` : ""}
    </div>
  </div>

  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500);}</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const downloadPdf = () => setPdfLoading(true);

  return (
    <>
    {pdfLoading && (
      <PdfExportOverlay
        onTriggerPdf={executePdfDownload}
        onDone={() => setPdfLoading(false)}
      />
    )}
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "860px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--clr-primary)",
              marginBottom: "4px",
            }}
          >
            Full analysis report
          </p>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--clr-text)",
              lineHeight: 1.2,
            }}
          >
            Document Report
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            className="btn-ghost"
            onClick={downloadPdf}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <FileDown size={14} />
            Download PDF
          </button>
          <button className="btn-ghost" onClick={onNewDocument}>
            New document
          </button>
        </div>
      </div>

      {/* Executive summary */}
      <Card>
        <SectionHeading>Executive Summary</SectionHeading>
        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--clr-text)",
            lineHeight: 1.7,
          }}
        >
          {report.executive_summary}
        </p>
      </Card>

      {/* Document metadata */}
      <Card>
        <SectionHeading>Document Metadata</SectionHeading>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: "16px",
          }}
        >
          <MetaChip
            label="Content Type"
            value={CONTENT_TYPE_LABELS[report.document_metadata.content_type] ?? report.document_metadata.content_type}
          />
          <MetaChip
            label="Tone"
            value={report.document_metadata.tone}
          />
          <MetaChip
            label="Word Count"
            value={report.document_metadata.word_count.toLocaleString()}
          />
          <MetaChip
            label="Language"
            value={report.document_metadata.language.toUpperCase()}
          />
        </div>

        {report.platform_suggestions.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <p
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--clr-text-secondary)",
                marginBottom: "8px",
              }}
            >
              Suggested platforms
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {report.platform_suggestions.map((p) => (
                <span
                  key={p}
                  style={{
                    padding: "3px 11px",
                    background: "#eff2ff",
                    color: "var(--clr-primary)",
                    borderRadius: "var(--radius-full)",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    border: "1px solid #c7d2fe",
                  }}
                >
                  {PLATFORM_LABELS[p] ?? p}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Grammar errors */}
      <Card>
        <SectionHeading>
          Grammar Analysis ({totalGrammarErrors} issue
          {totalGrammarErrors !== 1 ? "s" : ""})
        </SectionHeading>

        {totalGrammarErrors === 0 ? (
          <p
            style={{ fontSize: "0.875rem", color: "var(--clr-text-secondary)" }}
          >
            No grammar, punctuation, or paraphrase issues detected.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {report.grammar_errors.map((group) => (
              <div key={group.type}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background:
                        GRAMMAR_TYPE_COLORS[group.type] ??
                        "var(--clr-text-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--clr-text)",
                      textTransform: "capitalize",
                    }}
                  >
                    {group.type}
                  </span>
                  <span
                    style={{
                      fontSize: "0.775rem",
                      color: "var(--clr-text-muted)",
                    }}
                  >
                    {group.count} issue{group.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    paddingLeft: "16px",
                  }}
                >
                  {group.errors.map((err, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        background: "var(--clr-bg)",
                        border: "1px solid var(--clr-border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <span style={{ color: "#ef4444" }}>{err.original}</span>
                      <span
                        style={{
                          color: "var(--clr-text-muted)",
                          margin: "0 6px",
                        }}
                      >
                        →
                      </span>
                      <span style={{ color: "#10b981" }}>{err.replacement}</span>
                      <span
                        style={{
                          color: "var(--clr-text-secondary)",
                          marginLeft: "10px",
                          fontSize: "0.775rem",
                        }}
                      >
                        {err.explanation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Fact check */}
      <Card>
        <SectionHeading>
          Fact Check ({report.fact_check_results.length} claim
          {report.fact_check_results.length !== 1 ? "s" : ""})
        </SectionHeading>

        {report.fact_check_results.length === 0 ? (
          <p
            style={{ fontSize: "0.875rem", color: "var(--clr-text-secondary)" }}
          >
            No verifiable factual claims detected in this document.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {report.fact_check_results.map((fc, i) => {
              const vs =
                VERDICT_STYLES[fc.verdict] ?? VERDICT_STYLES["unverified"];
              return (
                <div
                  key={i}
                  style={{
                    padding: "12px 14px",
                    background: "var(--clr-bg)",
                    border: "1px solid var(--clr-border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 9px",
                        borderRadius: "var(--radius-full)",
                        background: vs.bg,
                        color: vs.color,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        flexShrink: 0,
                      }}
                    >
                      {vs.label}
                    </span>
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--clr-text)",
                        lineHeight: 1.5,
                      }}
                    >
                      {fc.claim}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--clr-text-secondary)",
                      marginBottom: fc.source_url ? "4px" : "0",
                      lineHeight: 1.5,
                    }}
                  >
                    {fc.explanation}
                  </p>
                  {fc.source_url && (
                    <a
                      href={fc.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "0.775rem",
                        color: "var(--clr-primary)",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {fc.source_url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Plagiarism */}
      <Card>
        <SectionHeading>Plagiarism Check</SectionHeading>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span
                style={{ fontSize: "0.875rem", color: "var(--clr-text)" }}
              >
                Similarity score
              </span>
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: plStyle.color,
                }}
              >
                {pl.score}%
              </span>
            </div>
            <div
              style={{
                height: "6px",
                background: "var(--clr-border)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(pl.score, 100)}%`,
                  background: plStyle.bar,
                  borderRadius: "var(--radius-full)",
                  transition: "width 0.4s",
                }}
              />
            </div>
          </div>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              background: plStyle.bg,
              color: plStyle.color,
              fontSize: "0.775rem",
              fontWeight: 700,
              textTransform: "capitalize",
              flexShrink: 0,
              border: `1px solid ${plStyle.color}33`,
            }}
          >
            {pl.verdict}
          </span>
        </div>

        {pl.matched_sources.length > 0 && (
          <div>
            <p
              style={{
                fontSize: "0.775rem",
                fontWeight: 600,
                color: "var(--clr-text-secondary)",
                marginBottom: "8px",
              }}
            >
              Matched sources ({pl.matched_sources.length})
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {pl.matched_sources.map((src, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    background: "var(--clr-bg)",
                    border: "1px solid var(--clr-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--clr-error)",
                      flexShrink: 0,
                    }}
                  >
                    {src.similarity_percentage}%
                  </span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        color: "var(--clr-text)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: "1px",
                      }}
                    >
                      {src.title || src.url}
                    </div>
                    {src.title && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--clr-primary)",
                          fontSize: "0.75rem",
                          textDecoration: "underline",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "block",
                        }}
                      >
                        {src.url}
                      </a>
                    )}
                  </div>
                  <span
                    style={{
                      color: "var(--clr-text-muted)",
                      fontSize: "0.775rem",
                      flexShrink: 0,
                    }}
                  >
                    {src.matched_words} words
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {pl.score === 0 && pl.matched_sources.length === 0 && (
          <p
            style={{ fontSize: "0.875rem", color: "var(--clr-text-secondary)" }}
          >
            No plagiarism detected. Document appears to be original.
          </p>
        )}
      </Card>

      {/* AI Detection */}
      {(() => {
        const ai = report.ai_detection;
        const aiStyle = AI_DETECTION_STYLES[ai.verdict] ?? AI_DETECTION_STYLES["human"];
        return (
          <Card>
            <SectionHeading>AI Detection</SectionHeading>
            {ai.skipped ? (
              <p style={{ fontSize: "0.875rem", color: "var(--clr-text-secondary)" }}>
                AI detection could not run — check that <code>SAPLING_API_KEY</code> is set and valid in the server environment.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ fontSize: "0.875rem", color: "var(--clr-text)" }}>
                        AI-generated probability
                      </span>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: aiStyle.color,
                        }}
                      >
                        {ai.score}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "var(--clr-border)",
                        borderRadius: "var(--radius-full)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(ai.score, 100)}%`,
                          background: aiStyle.bar,
                          borderRadius: "var(--radius-full)",
                          transition: "width 0.4s",
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "var(--radius-full)",
                      background: aiStyle.bg,
                      color: aiStyle.color,
                      fontSize: "0.775rem",
                      fontWeight: 700,
                      flexShrink: 0,
                      border: `1px solid ${aiStyle.color}33`,
                    }}
                  >
                    {aiStyle.label}
                  </span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--clr-text-secondary)" }}>
                  {ai.verdict === "human" && "This document appears to be predominantly human-written."}
                  {ai.verdict === "mixed" && "This document contains a mix of human and AI-generated content."}
                  {ai.verdict === "ai" && "This document is likely AI-generated. Consider reviewing for authenticity."}
                </p>
              </>
            )}
          </Card>
        );
      })()}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          paddingBottom: "32px",
        }}
      >
        <button className="btn-primary" onClick={onNewDocument}>
          Analyse another document
        </button>
      </div>
    </div>
    </>
  );
}
