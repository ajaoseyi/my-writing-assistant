import type { SeoCheckResult, SeoCheckItem, SeoCheckStatus } from "../types";

interface SeoSectionProps {
  result: SeoCheckResult;
}

const STATUS_CONFIG: Record<SeoCheckStatus, { icon: string; color: string; label: string }> = {
  error:   { icon: "✗", color: "var(--clr-error)",             label: "Error"   },
  warning: { icon: "~", color: "var(--clr-punctuation)",       label: "Warning" },
  pass:    { icon: "✓", color: "var(--clr-success)",           label: "Pass"    },
  skipped: { icon: "⊘", color: "var(--clr-text-muted)",        label: "Skipped" },
};

function CheckRow({ item }: { item: SeoCheckItem }) {
  const cfg = STATUS_CONFIG[item.status];
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
            {item.name}
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
        <div style={{ fontSize: "0.78rem", color: "var(--clr-text-secondary)", marginTop: "2px" }}>
          {item.message}
        </div>
        {item.detail && (
          <div style={{ fontSize: "0.7rem", color: "var(--clr-text-muted)", marginTop: "3px", fontStyle: "italic" }}>
            {item.detail}
          </div>
        )}
      </div>
    </div>
  );
}

const READABILITY_BENCHMARKS: Record<string, string> = {
  fleschReadingEase:    "90–100 = very easy · 60–70 = standard · below 30 = very difficult",
  fleschKincaidGrade:   "Grade level of US education (6–8 = most accessible web content)",
  gunningFog:           "Below 12 = accessible · above 17 = academic/technical",
  smog:                 "Estimates years of education needed to understand the text",
};

const READABILITY_LABELS: Record<string, string> = {
  fleschReadingEase:  "Flesch Reading Ease",
  fleschKincaidGrade: "Flesch-Kincaid Grade",
  gunningFog:         "Gunning Fog",
  smog:               "SMOG",
};

function scoreColor(key: string, value: number): string {
  if (key === "fleschReadingEase") {
    if (value >= 60) return "var(--clr-success)";
    if (value >= 30) return "var(--clr-punctuation)";
    return "var(--clr-error)";
  }
  // grade-level scores: lower is more accessible
  if (value <= 8) return "var(--clr-success)";
  if (value <= 14) return "var(--clr-punctuation)";
  return "var(--clr-error)";
}

export default function SeoSection({ result }: SeoSectionProps) {
  const { checks, readability, llmSummary, llmRecommendations } = result;

  const errorCount  = checks.filter((c) => c.status === "error").length;
  const warnCount   = checks.filter((c) => c.status === "warning").length;

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
          SEO Analysis
        </span>
        {errorCount > 0 && (
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--clr-error)", background: "var(--clr-error)15", padding: "1px 6px", borderRadius: "var(--radius-full)" }}>
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
        {warnCount > 0 && (
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--clr-punctuation)", background: "var(--clr-punctuation)15", padding: "1px 6px", borderRadius: "var(--radius-full)" }}>
            {warnCount} warning{warnCount !== 1 ? "s" : ""}
          </span>
        )}
        {errorCount === 0 && warnCount === 0 && (
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--clr-success)", background: "var(--clr-success)15", padding: "1px 6px", borderRadius: "var(--radius-full)" }}>
            All clear
          </span>
        )}
      </div>

      {/* Summary */}
      {llmSummary && (
        <p style={{ fontSize: "0.82rem", color: "var(--clr-text-secondary)", lineHeight: 1.55, marginBottom: "16px" }}>
          {llmSummary}
        </p>
      )}

      {/* Check list */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--clr-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
          Structural Checks
        </div>
        {checks.map((item) => (
          <CheckRow key={item.id} item={item} />
        ))}
      </div>

      {/* Readability */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--clr-text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
          Readability Scores
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {(Object.keys(READABILITY_LABELS) as Array<keyof typeof readability>).map((key) => {
            const value = readability[key];
            const color = scoreColor(key as string, value);
            return (
              <div key={key} style={{
                padding: "10px 12px",
                background: "var(--clr-bg)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--clr-border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "3px" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--clr-text)" }}>
                    {READABILITY_LABELS[key as string]}
                  </span>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color }}>
                    {value}
                  </span>
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--clr-text-muted)", lineHeight: 1.3 }}>
                  {READABILITY_BENCHMARKS[key as string]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LLM Recommendations */}
      {llmRecommendations.length > 0 && (
        <div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--clr-text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
            Recommendations
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {llmRecommendations.map((rec, i) => (
              <li key={i} style={{
                display: "flex",
                gap: "8px",
                fontSize: "0.8rem",
                color: "var(--clr-text-secondary)",
                lineHeight: 1.5,
              }}>
                <span style={{ color: "var(--clr-primary)", fontWeight: 700, flexShrink: 0, marginTop: "1px" }}>•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
