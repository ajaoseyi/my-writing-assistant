interface ToneSelectorProps {
  detected: string;
  confidence: number;
  options: string[];
  onConfirm: (tone: string) => void;
  loading: boolean;
}

const TONE_LABELS: Record<string, string> = {
  academic: "Academic",
  legal: "Legal",
  journalistic: "Journalistic",
  casual: "Casual",
  business: "Business",
  unknown: "General",
};

const TONE_DESCRIPTIONS: Record<string, string> = {
  academic: "Formal citations, passive voice, scholarly vocabulary",
  legal: "Precise legal terminology, formal structure",
  journalistic: "Clear, active voice, news-style conventions",
  casual: "Conversational, relaxed grammar rules",
  business: "Professional, concise, corporate register",
  unknown: "Apply standard grammar rules",
};

export default function ToneSelector({
  detected,
  confidence,
  options,
  onConfirm,
  loading,
}: ToneSelectorProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--clr-surface)",
          border: "1px solid var(--clr-border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)",
          padding: "32px",
          maxWidth: "520px",
          width: "100%",
        }}
      >
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--clr-primary)",
            marginBottom: "10px",
          }}
        >
          Tone confirmation needed
        </p>
        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--clr-text)",
            marginBottom: "8px",
            lineHeight: 1.3,
          }}
        >
          What tone should the grammar check apply?
        </h2>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--clr-text-secondary)",
            marginBottom: "24px",
            lineHeight: 1.6,
          }}
        >
          We detected a{" "}
          <strong style={{ color: "var(--clr-text)" }}>
            {TONE_LABELS[detected] ?? detected}
          </strong>{" "}
          tone with {confidence}% confidence — too low to apply automatically.
          Choose the tone that best fits your document so grammar rules are
          applied correctly.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginBottom: "20px",
          }}
        >
          {options.map((tone) => (
            <button
              key={tone}
              disabled={loading}
              onClick={() => onConfirm(tone)}
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                border:
                  tone === detected
                    ? "2px solid var(--clr-primary)"
                    : "1.5px solid var(--clr-border)",
                background:
                  tone === detected ? "#f0f2ff" : "var(--clr-surface)",
                textAlign: "left",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                transition: "border-color 0.14s, background 0.14s",
              }}
            >
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--clr-text)",
                  marginBottom: "2px",
                }}
              >
                {TONE_LABELS[tone] ?? tone}
                {tone === detected && (
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 500,
                      color: "var(--clr-primary)",
                      marginLeft: "6px",
                    }}
                  >
                    detected
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--clr-text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                {TONE_DESCRIPTIONS[tone] ?? ""}
              </div>
            </button>
          ))}
        </div>

        {loading && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--clr-text-muted)",
              textAlign: "center",
            }}
          >
            Running full analysis…
          </p>
        )}
      </div>
    </div>
  );
}
