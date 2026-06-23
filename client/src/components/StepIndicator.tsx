interface StepIndicatorProps {
  currentStep: 1 | 2 | 3;
}

const steps = [
  { n: 1, label: "Add document" },
  { n: 2, label: "Review changes" },
  { n: 3, label: "Polished result" },
];

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      {steps.map((s, i) => {
        const state =
          s.n < currentStep ? "done" : s.n === currentStep ? "active" : "pending";
        return (
          <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
            <div className={`step-item ${state}`}>
              <div className="step-circle">
                {state === "done" ? "✓" : s.n}
              </div>
              <span className="step-label">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="step-connector" />}
          </div>
        );
      })}
    </div>
  );
}
