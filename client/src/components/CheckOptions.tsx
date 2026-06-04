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
    key: "punctuation" as const,
    icon: ",.!",
    name: "Punctuation",
    desc: "Commas, periods, spacing & capitalisation",
  },
  {
    key: "paraphrase" as const,
    icon: "↻",
    name: "Paraphrase",
    desc: "Rephrase for clarity in your chosen tone",
  },
];

export default function CheckOptions({
  options,
  setOptions,
  onAnalyse,
  loading,
  error,
}: CheckOptionsProps) {
  const toggle = (key: keyof CheckOptionsState) =>
    setOptions({ ...options, [key]: !options[key] });

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
