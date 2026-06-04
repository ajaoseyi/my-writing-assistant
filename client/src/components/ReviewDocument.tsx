import { FileText } from "lucide-react";
import type { Suggestion } from "../App";

interface ReviewDocumentProps {
  content: string;
  suggestions: Suggestion[];
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

export default function ReviewDocument({ content, suggestions }: ReviewDocumentProps) {
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
        </div>
      </div>

      <div className="review-doc-body">
        {segments.map((seg, i) =>
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
        )}
      </div>
    </div>
  );
}
