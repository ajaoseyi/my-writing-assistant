import { useState } from "react";
import type { Suggestion } from "../App";

interface SuggestionListProps {
  suggestions: Suggestion[];
  doneCount: number;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onFixAll: () => void;
  onDismissAll: () => void;
}

const INITIAL_VISIBLE = 3;

export default function SuggestionList({
  suggestions,
  doneCount,
  onAccept,
  onDismiss,
  onFixAll,
  onDismissAll,
}: SuggestionListProps) {
  const [showAll, setShowAll] = useState(false);

  const total = suggestions.length;
  const pending = suggestions.filter((s) => s.status === "pending");
  const done = suggestions.filter((s) => s.status !== "pending");

  const visiblePending = showAll ? pending : pending.slice(0, INITIAL_VISIBLE);
  const hiddenCount = pending.length - INITIAL_VISIBLE;

  return (
    <div className="suggestion-panel">
      <div className="suggestion-panel-head">
        <div className="suggestion-panel-title-row">
          <span className="suggestion-panel-title">{total} suggestion{total !== 1 ? "s" : ""}</span>
          <span className="suggestion-panel-progress">{doneCount}/{total} done</span>
        </div>
        <div className="suggestion-bulk-actions">
          <button
            className="btn-fix-all"
            onClick={onFixAll}
            disabled={pending.length === 0}
          >
            ✓ Fix all
          </button>
          <button
            className="btn-dismiss-all"
            onClick={onDismissAll}
            disabled={pending.length === 0}
          >
            Dismiss all
          </button>
        </div>
      </div>

      <div className="suggestion-list">
        {total === 0 && (
          <p className="sg-empty">No issues found — your document looks great!</p>
        )}

        {visiblePending.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onAccept={onAccept}
            onDismiss={onDismiss}
          />
        ))}

        {!showAll && hiddenCount > 0 && (
          <button className="sg-show-more" onClick={() => setShowAll(true)}>
            + {hiddenCount} more suggestion{hiddenCount !== 1 ? "s" : ""}…
          </button>
        )}

        {done.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onAccept={onAccept}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}

function SuggestionCard({ suggestion: s, onAccept, onDismiss }: SuggestionCardProps) {
  const isPending = s.status === "pending";

  return (
    <div className={`sg-card ${s.status}`}>
      <div className="sg-card-top">
        <span className={`sg-badge ${s.type}`}>{s.type}</span>
        {s.status === "accepted" && <span className="sg-done-tag">✓ Accepted</span>}
        {s.status === "dismissed" && <span className="sg-dismissed-tag">Dismissed</span>}
      </div>

      <div className="sg-diff">
        <span className="sg-old">{s.original}</span>
        <span className="sg-arrow">→</span>
        <span className="sg-new">{s.replacement}</span>
      </div>

      <p className="sg-explanation">{s.explanation}</p>

      {isPending && (
        <div className="sg-actions">
          <button className="btn-accept" onClick={() => onAccept(s.id)}>
            ✓ Accept
          </button>
          <button className="btn-dismiss-card" onClick={() => onDismiss(s.id)}>
            ✕ Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
