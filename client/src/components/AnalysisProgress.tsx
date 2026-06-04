import { Loader2 } from "lucide-react";

export interface ProgressItem {
  stage: string;
  message: string;
  ts: number;
}

const STAGE_LABEL: Record<string, string> = {
  start: "Pipeline",
  classifyAndTone: "Tone detection",
  parallelAnalysis: "Fact check + grammar",
  generateReport: "Report",
};

export default function AnalysisProgress({
  items,
  loading,
}: {
  items: ProgressItem[];
  loading: boolean;
}) {
  if (!loading && items.length === 0) return null;

  return (
    <div
      style={{
        marginTop: "14px",
        padding: "14px 16px",
        background: "var(--clr-surface)",
        border: "1px solid var(--clr-border)",
        borderRadius: "var(--radius-md)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <p
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--clr-text-secondary)",
          marginBottom: "4px",
        }}
      >
        Analysis activity
      </p>

      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            fontSize: "0.8125rem",
            color: "var(--clr-text)",
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--clr-primary)",
              marginTop: "5px",
              flexShrink: 0,
            }}
          />
          <div>
            <span
              style={{
                fontWeight: 600,
                color: "var(--clr-text-secondary)",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginRight: "6px",
              }}
            >
              {STAGE_LABEL[item.stage] ?? item.stage}
            </span>
            {item.message}
          </div>
        </div>
      ))}

      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.8125rem",
            color: "var(--clr-text-secondary)",
            marginTop: "2px",
          }}
        >
          <Loader2
            size={13}
            style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
          />
          <span>Running…</span>
        </div>
      )}
    </div>
  );
}
