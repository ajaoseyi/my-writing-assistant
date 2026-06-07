import { useState } from "react";
import { Copy, Download, Search, ExternalLink, Linkedin, Facebook, Instagram } from "lucide-react";
import type { Suggestion } from "../App";
import { countWords } from "../App";

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.638L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function ThreadsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="currentColor">
      <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.372-39.134 15.265-38.105 34.569.522 9.792 5.4 18.216 13.735 23.719 6.976 4.68 15.957 6.977 25.294 6.488 12.339-.652 22.024-5.386 28.776-14.07 5.196-6.666 8.489-15.268 9.9-25.95 5.832 3.523 10.164 8.556 12.577 14.98 4.232 11.25 4.48 29.765-8.24 42.441-11.114 11.079-24.49 15.56-44.832 15.709-22.481-.169-39.57-7.388-50.806-21.454C91.533 145.025 85 127.949 84.811 105.5c.189-22.449 6.722-39.525 19.416-50.754C115.463 44.57 132.552 37.352 155.033 37.183c22.637.17 39.938 7.42 51.456 21.544 5.65 6.99 9.903 15.83 12.64 26.188l16.028-4.15c-3.333-12.67-8.764-23.668-16.146-32.542C203.774 31.023 182.6 21.906 155.147 21.71h-.114c-27.284.195-48.216 9.368-63.836 27.281-14.067 16.148-21.308 38.367-21.516 66.043.208 27.676 7.449 49.895 21.516 66.043 15.62 17.912 36.552 27.085 63.836 27.281h.114c24.583-.175 41.96-6.634 56.289-20.906 18.073-17.998 17.647-40.43 11.662-55.9-4.407-11.72-12.967-21.1-24.561-26.564z" />
    </svg>
  );
}

type Tab = "polished" | "original" | "changes";

interface PolishedResultProps {
  polishedContent: string;
  originalContent: string;
  suggestions: Suggestion[];
  onReview: () => void;
  onNewDocument: () => void;
  onFullReport?: () => void;
  fullReportLoading?: boolean;
}

interface DiffPart {
  type: "unchanged" | "removed" | "added";
  text: string;
}

function buildDiff(original: string, accepted: Suggestion[]): DiffPart[] {
  const sorted = accepted
    .filter((s) => s.start !== -1)
    .sort((a, b) => a.start - b.start);

  const parts: DiffPart[] = [];
  let last = 0;

  for (const s of sorted) {
    if (s.start < last) continue;
    if (s.start > last) {
      parts.push({ type: "unchanged", text: original.slice(last, s.start) });
    }
    parts.push({ type: "removed", text: s.original });
    parts.push({ type: "added", text: s.replacement });
    last = s.end;
  }
  if (last < original.length) {
    parts.push({ type: "unchanged", text: original.slice(last) });
  }
  return parts;
}

export default function PolishedResult({
  polishedContent,
  originalContent,
  suggestions,
  onReview,
  onNewDocument,
  onFullReport,
  fullReportLoading,
}: PolishedResultProps) {
  const [tab, setTab] = useState<Tab>("polished");
  const [copied, setCopied] = useState(false);

  const accepted = suggestions.filter((s) => s.status === "accepted");
  const grammarCount = accepted.filter((s) => s.type === "grammar").length;
  const punctCount = accepted.filter((s) => s.type === "punctuation").length;
  const paraphraseCount = accepted.filter((s) => s.type === "paraphrase").length;
  const totalAccepted = accepted.length;

  const displayContent = tab === "polished" ? polishedContent : originalContent;
  const wc = countWords(displayContent);

  const diffParts = buildDiff(originalContent, accepted);

  const handleCopy = () => {
    navigator.clipboard.writeText(polishedContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([polishedContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "polished.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="refine-step3-panels">
      {/* Left: document tabs */}
      <div className="polished-panel">
        {onFullReport && (
          <button
            className="fact-check-cta"
            onClick={onFullReport}
            disabled={fullReportLoading}
          >
            <Search size={15} />
            {fullReportLoading ? "Analysing…" : "Run Fact & Plagiarism Check"}
          </button>
        )}
        <div className="polished-tabs-bar">
          {(["polished", "original", "changes"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`polished-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <span className="polished-wc">
            {tab !== "changes" ? `${wc} word${wc !== 1 ? "s" : ""}` : ""}
          </span>
        </div>

        {tab !== "changes" && (
          <div className="polished-body">{displayContent}</div>
        )}

        {tab === "changes" && (
          <div className="changes-body">
            {totalAccepted === 0 ? (
              <p style={{ color: "var(--clr-text-muted)", fontSize: "0.875rem" }}>
                No changes were accepted.
              </p>
            ) : (
              diffParts.map((part, i) => {
                if (part.type === "unchanged") return <span key={i}>{part.text}</span>;
                if (part.type === "removed")
                  return (
                    <span key={i} className="diff-del">
                      {part.text}
                    </span>
                  );
                return (
                  <span key={i} className="diff-ins">
                    {part.text}
                  </span>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Right: summary */}
      <div className="summary-panel">
        <div className="summary-title-row">
          <div className="summary-check-wrap">✓</div>
          <span className="summary-title">{totalAccepted} change{totalAccepted !== 1 ? "s" : ""} applied</span>
        </div>

        <div className="summary-breakdown">
          <div className="summary-row">
            <span className="summary-dot grammar" />
            <span className="summary-row-label">Grammar</span>
            <span className="summary-row-count">{grammarCount}</span>
          </div>
          <div className="summary-row">
            <span className="summary-dot punctuation" />
            <span className="summary-row-label">Punctuation</span>
            <span className="summary-row-count">{punctCount}</span>
          </div>
          <div className="summary-row">
            <span className="summary-dot paraphrase" />
            <span className="summary-row-label">Paraphrase</span>
            <span className="summary-row-count">{paraphraseCount}</span>
          </div>
        </div>

        <div className="summary-actions">
          <button className="btn-copy-text" onClick={handleCopy}>
            <Copy size={14} />
            {copied ? "Copied!" : "Copy text"}
          </button>
          <button className="btn-download" onClick={handleDownload}>
            <Download size={14} />
            Download
          </button>
        </div>

        <div className="social-section">
          <div className="social-section-header-row">
            <ExternalLink size={14} className="social-section-icon" />
            <span className="social-section-header">Ask agent to post on socials</span>
          </div>
          <div className="social-grid">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(polishedContent.slice(0, 280))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
            >
              <XIcon size={13} />
              <span>X</span>
              <ExternalLink size={10} className="social-external" />
            </a>
            <a
              href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(polishedContent.slice(0, 700))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
            >
              <Linkedin size={13} />
              <span>LinkedIn</span>
              <ExternalLink size={10} className="social-external" />
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(polishedContent.slice(0, 500))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
            >
              <Facebook size={13} />
              <span>Facebook</span>
              <ExternalLink size={10} className="social-external" />
            </a>
            <a
              href="https://www.instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
            >
              <Instagram size={13} />
              <span>Instagram</span>
              <ExternalLink size={10} className="social-external" />
            </a>
            <a
              href={`https://www.threads.net/intent/post?text=${encodeURIComponent(polishedContent.slice(0, 500))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn social-btn-wide"
            >
              <ThreadsIcon size={13} />
              <span>Threads</span>
              <ExternalLink size={10} className="social-external" />
            </a>
          </div>
        </div>

        <div className="summary-footer-links">
          <button className="summary-link-btn" onClick={onReview}>
            ← Review
          </button>
          <button className="summary-link-btn" onClick={onNewDocument}>
            New doc
          </button>
        </div>
      </div>
    </div>
  );
}
