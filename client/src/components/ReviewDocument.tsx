import { FileText } from "lucide-react";
import type { Suggestion } from "../App";
import type { InputMode } from "./DocumentInput";

interface ReviewDocumentProps {
  content: string;
  suggestions: Suggestion[];
  inputMode: InputMode;
  sourceHtml?: string;
}

interface Segment {
  text: string;
  suggestion?: Suggestion;
}

function buildSegments(text: string, suggestions: Suggestion[]): Segment[] {
  const active = suggestions
    .filter((s) => s.start !== -1 && s.status === "pending")
    .sort((a, b) => a.start - b.start);

  const segs: Segment[] = [];
  let last = 0;

  for (const s of active) {
    if (s.start < last) continue;
    if (s.start > last) segs.push({ text: text.slice(last, s.start) });
    segs.push({ text: text.slice(s.start, s.end), suggestion: s });
    last = s.end;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs;
}

function buildHighlightedHtml(html: string, suggestions: Suggestion[]): string {
  const pending = suggestions
    .filter((s) => s.start !== -1 && s.status === "pending")
    .sort((a, b) => b.start - a.start);

  let result = html;
  for (const s of pending) {
    result = result.slice(0, s.end) + "</mark>" + result.slice(s.end);
    const esc = s.explanation.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    result =
      result.slice(0, s.start) +
      `<mark class="hl ${s.type}" title="${esc}">` +
      result.slice(s.start);
  }
  return result;
}

// Text-search-based mark injection into existing HTML (used when richHtml is available).
// Positions from the AI are for stripped plain text; we can't use them against HTML directly,
// so we find each suggestion's original text inside the HTML string and wrap it.
function buildHighlightedHtmlFromSource(html: string, suggestions: Suggestion[]): string {
  const pending = suggestions
    .filter((s) => s.start !== -1 && s.status === "pending")
    .sort((a, b) => b.original.length - a.original.length); // longer first to avoid partial matches

  let result = html;
  for (const s of pending) {
    const idx = result.indexOf(s.original);
    if (idx === -1) continue;
    const esc = s.explanation.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    result =
      result.slice(0, idx) +
      `<mark class="hl ${s.type}" title="${esc}">` +
      s.original +
      `</mark>` +
      result.slice(idx + s.original.length);
  }
  return result;
}

// Renders flat segments as markdown-aware blocks for upload / plain-text content.
// Works entirely within the existing plain-text character offsets so suggestion
// positions remain valid — no HTML-string injection needed.
function MarkdownSegments({ segments }: { segments: Segment[] }) {
  // Split every segment at newline boundaries and rebuild as an array of "lines",
  // where each line is a list of (text, suggestion?) chunks.
  type Chunk = { text: string; suggestion?: Suggestion };
  const lines: Chunk[][] = [[]];

  for (const seg of segments) {
    const parts = seg.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i] !== "") {
        lines[lines.length - 1].push({ text: parts[i], suggestion: seg.suggestion });
      }
    }
  }

  const nodes: React.ReactNode[] = [];
  let pBuffer: Chunk[] = [];

  const flushP = (key: number) => {
    if (!pBuffer.length) return;
    nodes.push(
      <p key={`p-${key}`}>
        {pBuffer.map((c, j) =>
          c.suggestion ? (
            <mark key={j} className={`hl ${c.suggestion.type}`} title={c.suggestion.explanation}>
              {c.text}
            </mark>
          ) : (
            <span key={j}>{c.text}</span>
          ),
        )}
      </p>,
    );
    pBuffer = [];
  };

  lines.forEach((line, idx) => {
    const raw = line.map((c) => c.text).join("");

    // YAML front-matter delimiter — render as muted separator
    if (raw.trim() === "---") {
      flushP(idx);
      nodes.push(<div key={`hr-${idx}`} className="md-hr" />);
      return;
    }

    // Markdown heading: one or more # followed by a space
    const headingMatch = raw.match(/^(#{1,6}) /);
    if (headingMatch) {
      flushP(idx);
      const level = Math.min(headingMatch[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const prefixLen = headingMatch[0].length; // e.g. "## " → 3

      // Split the line's chunks around the prefix so we can strip the `#…` visually
      // but keep the text content otherwise identical for mark positions.
      const contentChunks: Chunk[] = [];
      let consumed = 0;
      for (const c of line) {
        const start = consumed;
        const end = consumed + c.text.length;
        if (end <= prefixLen) {
          // Entirely inside prefix — skip (strip the `# `)
        } else if (start < prefixLen) {
          // Spans the boundary — take only the part after the prefix
          contentChunks.push({ text: c.text.slice(prefixLen - start), suggestion: c.suggestion });
        } else {
          contentChunks.push(c);
        }
        consumed = end;
      }

      nodes.push(
        <Tag key={`h-${idx}`} className="md-heading">
          {contentChunks.map((c, j) =>
            c.suggestion ? (
              <mark key={j} className={`hl ${c.suggestion.type}`} title={c.suggestion.explanation}>
                {c.text}
              </mark>
            ) : (
              <span key={j}>{c.text}</span>
            ),
          )}
        </Tag>,
      );
      return;
    }

    // Blank line — flush paragraph
    if (!raw.trim()) {
      flushP(idx);
      return;
    }

    // Regular text — accumulate into paragraph buffer with a space between lines
    if (pBuffer.length > 0) pBuffer.push({ text: " " });
    pBuffer.push(...line);
  });

  flushP(lines.length);
  return <>{nodes}</>;
}

export default function ReviewDocument({ content, suggestions, inputMode, sourceHtml }: ReviewDocumentProps) {
  const segments = buildSegments(content, suggestions);

  const grammarCount = suggestions.filter(
    (s) => s.type === "grammar" && s.status === "pending",
  ).length;
  const punctCount = suggestions.filter(
    (s) => s.type === "punctuation" && s.status === "pending",
  ).length;
  const paraphraseCount = suggestions.filter(
    (s) => s.type === "paraphrase" && s.status === "pending",
  ).length;
  const passiveCount = suggestions.filter(
    (s) => s.type === "passive-voice" && s.status === "pending",
  ).length;
  const sentenceLengthCount = suggestions.filter(
    (s) => s.type === "sentence-length" && s.status === "pending",
  ).length;

  return (
    <div className="review-doc-panel">
      <div className="review-doc-header">
        <FileText size={14} className="review-doc-icon" />
        <span className="review-doc-title">Your document</span>
        <div className="review-counts">
          {grammarCount > 0 && (
            <span className="review-count-chip">
              <span className="count-dot grammar" />
              {grammarCount}
            </span>
          )}
          {punctCount > 0 && (
            <span className="review-count-chip">
              <span className="count-dot punctuation" />
              {punctCount}
            </span>
          )}
          {paraphraseCount > 0 && (
            <span className="review-count-chip">
              <span className="count-dot paraphrase" />
              {paraphraseCount}
            </span>
          )}
          {passiveCount > 0 && (
            <span className="review-count-chip">
              <span className="count-dot passive-voice" />
              {passiveCount}
            </span>
          )}
          {sentenceLengthCount > 0 && (
            <span className="review-count-chip">
              <span className="count-dot sentence-length" />
              {sentenceLengthCount}
            </span>
          )}
        </div>
      </div>

      <div className="review-doc-body">
        {inputMode === "rich" ? (
          // Rich (Write tab): use sourceHtml (original TipTap HTML) when available so headings
          // are preserved; fall back to content (plain text) if sourceHtml was not passed.
          <div
            className="review-doc-html"
            dangerouslySetInnerHTML={{
              __html: sourceHtml
                ? buildHighlightedHtmlFromSource(sourceHtml, suggestions)
                : buildHighlightedHtml(content, suggestions),
            }}
          />
        ) : inputMode === "upload" ? (
          // Upload: plain text — render with markdown-aware block structure
          <MarkdownSegments segments={segments} />
        ) : (
          // Paste / sample: flat text with inline marks
          segments.map((seg, i) =>
            seg.suggestion ? (
              <mark
                key={i}
                className={`hl ${seg.suggestion.type}`}
                title={seg.suggestion.explanation}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )
        )}
      </div>
    </div>
  );
}
