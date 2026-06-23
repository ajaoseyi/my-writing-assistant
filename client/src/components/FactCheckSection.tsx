import { Loader2, ExternalLink } from "lucide-react";
import type { FactCheckResult, FactVerdict } from "../types";

interface FactCheckSectionProps {
  result: FactCheckResult[] | null;
  loading: boolean;
  onRun: () => void;
}

const VERDICT_CONFIG: Record<FactVerdict, { icon: string; color: string; label: string }> = {
  verified:   { icon: "✓", color: "var(--clr-success)",     label: "Verified"   },
  false:      { icon: "✗", color: "var(--clr-error)",       label: "False"      },
  unverified: { icon: "~", color: "var(--clr-punctuation)", label: "Unverified" },
};

function ClaimRow({ item }: { item: FactCheckResult }) {
  const cfg = VERDICT_CONFIG[item.verdict] ?? VERDICT_CONFIG.unverified;
  const hasSource = !!item.source_url && /^https?:\/\//i.test(item.source_url);
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      padding: "8px 0",
      borderBottom: "1px solid var(--clr-border)",
    }}>
      <span style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: `${cfg.color}18`,
        color: cfg.color,
        fontWeight: 700,
        fontSize: "0.75rem",
        flexShrink: 0,
        marginTop: "1px",
      }}>
        {cfg.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--clr-text)" }}>
            {item.claim}
          </span>
          <span style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: cfg.color,
            background: `${cfg.color}15`,
            padding: "1px 5px",
            borderRadius: "var(--radius-full)",
            textTransform: "uppercase",
          }}>
            {cfg.label}
          </span>
        </div>
        {item.explanation && (
          <div style={{ fontSize: "0.78rem", color: "var(--clr-text-secondary)", marginTop: "2px" }}>
            {item.explanation}
          </div>
        )}
        {hasSource && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "0.7rem",
              color: "var(--clr-primary)",
              marginTop: "3px",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={11} />
            <span style={{ wordBreak: "break-all" }}>{item.source_url}</span>
          </a>
        )}
      </div>
    </div>
  );
}

function CountPill({ count, color, label }: { count: number; color: string; label: string }) {
  if (count === 0) return null;
  return (
    <span style={{ fontSize: "0.68rem", fontWeight: 600, color, background: `${color}15`, padding: "1px 6px", borderRadius: "var(--radius-full)" }}>
      {count} {label}
    </span>
  );
}

export default function FactCheckSection({ result, loading, onRun }: FactCheckSectionProps) {
  const hasResult = result !== null;
  const verifiedCount   = result?.filter((r) => r.verdict === "verified").length   ?? 0;
  const falseCount      = result?.filter((r) => r.verdict === "false").length      ?? 0;
  const unverifiedCount = result?.filter((r) => r.verdict === "unverified").length ?? 0;

  return (
    <div style={{
      background: "var(--clr-surface)",
      border: "1px solid var(--clr-border)",
      borderRadius: "var(--radius-md)",
      padding: "20px 24px",
      marginTop: "16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--clr-text-muted)", textTransform: "uppercase" }}>
          Fact Check
        </span>
        {hasResult && (
          <>
            <CountPill count={verifiedCount}   color="var(--clr-success)"     label="verified" />
            <CountPill count={falseCount}      color="var(--clr-error)"       label="false" />
            <CountPill count={unverifiedCount} color="var(--clr-punctuation)" label="unverified" />
          </>
        )}
        {/* Re-check affordance once results exist */}
        {hasResult && !loading && (
          <button
            onClick={onRun}
            style={{
              marginLeft: "auto",
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "var(--clr-text-secondary)",
              background: "transparent",
              border: "1px solid var(--clr-border)",
              borderRadius: "var(--radius-full)",
              padding: "2px 10px",
              cursor: "pointer",
            }}
          >
            Re-check
          </button>
        )}
      </div>

      <p style={{ fontSize: "0.82rem", color: "var(--clr-text-secondary)", lineHeight: 1.55, marginBottom: "16px" }}>
        Extracts verifiable factual claims and checks each one against live web search.
      </p>

      {/* Initial state — show the trigger button */}
      {!hasResult && (
        <button
          className="btn-primary"
          onClick={onRun}
          disabled={loading}
          style={{ fontSize: "0.85rem" }}
        >
          {loading ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Checking facts…
            </span>
          ) : (
            "Fact-check document"
          )}
        </button>
      )}

      {/* Loading over existing results (re-check) */}
      {hasResult && loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--clr-text-secondary)", padding: "8px 0" }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          Re-checking facts…
        </div>
      )}

      {/* Results */}
      {hasResult && !loading && (
        result.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--clr-text-muted)", padding: "8px 0" }}>
            No verifiable factual claims found.
          </div>
        ) : (
          <div>
            {result.map((item, i) => (
              <ClaimRow key={i} item={item} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
