import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { CheckOptionsState } from "../App";

interface CheckOptionsProps {
  options: CheckOptionsState;
  setOptions: (o: CheckOptionsState) => void;
  onAnalyse: () => void;
  loading: boolean;
  error: string;
}

const OPTION_CONFIG = [
  {
    key: "grammar" as const,
    icon: "Aa",
    name: "Grammar",
    desc: "Agreement, tense, word choice & spelling",
  },
  {
    key: "paraphrase" as const,
    icon: "↻",
    name: "Paraphrase",
    desc: "Rephrase for clarity in your chosen tone",
  },
  {
    key: "passiveVoice" as const,
    icon: "◎",
    name: "Passive Voice",
    desc: "Detect passive constructions & suggest active rewrites",
  },
  {
    key: "sentenceLength" as const,
    icon: "≈",
    name: "Long Sentences",
    desc: "Flag sentences over 20 words (SEO best practice)",
  },
];

function CharCounter({ value, min, max }: { value: string; min: number; max: number }) {
  const len = [...value].length;
  const ok = len >= min && len <= max;
  const color = value === "" ? "var(--clr-text-muted)" : ok ? "var(--clr-success)" : "var(--clr-punctuation)";
  return (
    <span style={{ fontSize: "0.7rem", color, marginLeft: "auto", flexShrink: 0 }}>
      {len}/{max}
    </span>
  );
}

export default function CheckOptions({
  options,
  setOptions,
  onAnalyse,
  loading,
  error,
}: CheckOptionsProps) {
  const [seoOpen, setSeoOpen] = useState(false);

  const toggle = (key: keyof Omit<CheckOptionsState, "metaTitle" | "metaDescription" | "focusKeyword">) =>
    setOptions({ ...options, [key]: !options[key] });

  const toggleSeo = () => {
    const next = !options.seo;
    setSeoOpen(next);
    setOptions({ ...options, seo: next });
  };

  return (
    <div className="check-options-panel">
      <div className="check-options-header">
        <span className="check-options-title">What should we check?</span>
        <span className="check-options-pick">Pick one or more</span>
      </div>

      {OPTION_CONFIG.map(({ key, icon, name, desc }) => {
        const selected = options[key];
        return (
          <div
            key={key}
            className={`option-card${selected ? ` selected ${key}` : ""}`}
            onClick={() => toggle(key)}
          >
            <div className="option-icon-wrap">{icon}</div>
            <div className="option-text">
              <div className="option-name">{name}</div>
              <div className="option-desc">{desc}</div>
            </div>
            <div className="option-check">{selected && "✓"}</div>
          </div>
        );
      })}

      {/* SEO Analysis toggle */}
      <div
        className={`option-card${options.seo ? " selected seo" : ""}`}
        onClick={toggleSeo}
        style={{ flexDirection: "column", alignItems: "stretch", gap: 0, padding: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px" }}>
          <div className="option-icon-wrap" style={{ fontSize: "0.85rem" }}>SEO</div>
          <div className="option-text">
            <div className="option-name">SEO Analysis</div>
            <div className="option-desc">Headings, readability, keyword density & more</div>
          </div>
          <div className="option-check">{options.seo && "✓"}</div>
        </div>

        {seoOpen && (
          <div
            style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: "8px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Meta title */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <label style={{ fontSize: "0.72rem", color: "var(--clr-text-secondary)", fontWeight: 500 }}>
                  Meta title <span style={{ color: "var(--clr-text-muted)", fontWeight: 400 }}>(optional, 50–60 chars)</span>
                </label>
                <CharCounter value={options.metaTitle ?? ""} min={50} max={60} />
              </div>
              <input
                type="text"
                value={options.metaTitle ?? ""}
                onChange={(e) => setOptions({ ...options, metaTitle: e.target.value })}
                placeholder="e.g. How to Write Better SEO Content in 2024"
                style={{
                  fontSize: "0.78rem",
                  padding: "6px 8px",
                  border: "1px solid var(--clr-border-input)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--clr-surface)",
                  color: "var(--clr-text)",
                  width: "100%",
                }}
              />
            </div>

            {/* Meta description */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <label style={{ fontSize: "0.72rem", color: "var(--clr-text-secondary)", fontWeight: 500 }}>
                  Meta description <span style={{ color: "var(--clr-text-muted)", fontWeight: 400 }}>(optional, 150–160 chars)</span>
                </label>
                <CharCounter value={options.metaDescription ?? ""} min={150} max={160} />
              </div>
              <textarea
                value={options.metaDescription ?? ""}
                onChange={(e) => setOptions({ ...options, metaDescription: e.target.value })}
                placeholder="A brief summary of your page for search engine results…"
                rows={2}
                style={{
                  fontSize: "0.78rem",
                  padding: "6px 8px",
                  border: "1px solid var(--clr-border-input)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--clr-surface)",
                  color: "var(--clr-text)",
                  width: "100%",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Focus keyword */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "0.72rem", color: "var(--clr-text-secondary)", fontWeight: 500 }}>
                Focus keyword <span style={{ color: "var(--clr-text-muted)", fontWeight: 400 }}>(optional — enables density check)</span>
              </label>
              <input
                type="text"
                value={options.focusKeyword ?? ""}
                onChange={(e) => setOptions({ ...options, focusKeyword: e.target.value })}
                placeholder="e.g. content marketing tips"
                style={{
                  fontSize: "0.78rem",
                  padding: "6px 8px",
                  border: "1px solid var(--clr-border-input)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--clr-surface)",
                  color: "var(--clr-text)",
                  width: "100%",
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="check-options-footer">
        <p className="check-options-note">
          Nothing changes until you approve it.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <button className="btn-analyse" onClick={onAnalyse} disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={15} className="spin" /> Analysing…
            </>
          ) : (
            <>+ Analyse document</>
          )}
        </button>
      </div>
    </div>
  );
}
