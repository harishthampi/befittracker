import { progressState, type ProgressState } from "@/lib/nutrition";

const STATE_TEXT: Record<ProgressState, string> = { under: "Under", on: "On target", over: "Over" };

/**
 * One labelled progress bar (calories, protein, carbs, fat).
 * Colour is never the only signal: the state is also written as text.
 * `warnWhen` says which side is the problem: calories warn when over, protein when under.
 */
export function ProgressBar({
  label,
  consumed,
  target,
  unit,
  color,
  extra,
  warnWhen = "over",
}: {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
  extra?: string;
  warnWhen?: "over" | "under";
}) {
  const state = progressState(consumed, target);
  const width = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const isWarning = state !== "on" && state === warnWhen;
  const stateClass = state === "on" ? "state-on" : isWarning ? "state-warn" : "state-under";

  return (
    <div className="bar">
      <div className="bar-head">
        <span>
          <strong>{label}</strong> {extra && <span className="muted small">{extra}</span>}
        </span>
        <span>
          {Math.round(consumed).toLocaleString("en-CA")} / {target.toLocaleString("en-CA")} {unit}{" "}
          <span className={`state ${stateClass}`}>{STATE_TEXT[state]}</span>
        </span>
      </div>
      <div
        className="bar-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(consumed)}
        aria-valuetext={`${Math.round(consumed)} of ${target} ${unit}, ${STATE_TEXT[state].toLowerCase()}`}
      >
        <div className="bar-fill" style={{ width: `${width}%`, background: isWarning && state === "over" ? "var(--warn)" : color }} />
      </div>
    </div>
  );
}
