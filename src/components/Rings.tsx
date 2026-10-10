/**
 * Apple-Fitness-style concentric rings, drawn as plain SVG (no chart library).
 * Each ring fills to 100% of its goal; past 100% a second, darker lap is drawn
 * on top so overshooting is visible. The whole graphic has a text label for
 * screen readers, and the legend beside it repeats every number as text.
 */

export interface RingSpec {
  label: string;
  value: number;
  goal: number;
  color: string; // CSS colour, usually a var(--ring-*) token
  /** Where tapping this ring goes (its detail screen). */
  href?: string;
}

const SIZE = 180;
const STROKE = 16;
const GAP = 4;

export function Rings({ rings }: { rings: RingSpec[] }) {
  const summary = rings
    .map((r) => `${r.label} ${Math.round(r.value).toLocaleString("en-CA")} of ${r.goal.toLocaleString("en-CA")}, ${pct(r)}%`)
    .join("; ");

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label={summary}>
      <title>{summary}</title>
      {rings.map((r, i) => {
        const radius = SIZE / 2 - STROKE / 2 - i * (STROKE + GAP);
        const circumference = 2 * Math.PI * radius;
        const ratio = r.goal > 0 ? r.value / r.goal : 0;
        const firstLap = Math.min(ratio, 1);
        const secondLap = Math.min(Math.max(ratio - 1, 0), 1);
        const common = {
          cx: SIZE / 2,
          cy: SIZE / 2,
          r: radius,
          fill: "none",
          strokeWidth: STROKE,
          strokeLinecap: "round" as const,
          transform: `rotate(-90 ${SIZE / 2} ${SIZE / 2})`,
        };
        const ring = (
          <g>
            {/* Track */}
            <circle {...common} stroke={r.color} strokeOpacity={0.18} />
            {/* Progress up to 100% */}
            {firstLap > 0 && (
              <circle {...common} stroke={r.color} strokeDasharray={`${firstLap * circumference} ${circumference}`} />
            )}
            {/* Overshoot beyond 100%, darker */}
            {secondLap > 0 && (
              <circle
                {...common}
                stroke={r.color}
                style={{ filter: "brightness(0.7)" }}
                strokeDasharray={`${secondLap * circumference} ${circumference}`}
              />
            )}
          </g>
        );
        // Each ring is its own link; the transparent wide circle makes the whole band easy to tap.
        return r.href ? (
          <a key={r.label} href={r.href} className="ring-link" aria-label={`${r.label}: ${Math.round(r.value).toLocaleString("en-CA")} of ${r.goal.toLocaleString("en-CA")}. Open details`}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" stroke="transparent" strokeWidth={STROKE + GAP} />
            {ring}
          </a>
        ) : (
          <g key={r.label}>{ring}</g>
        );
      })}
    </svg>
  );
}

export function pct(r: Pick<RingSpec, "value" | "goal">): number {
  return r.goal > 0 ? Math.round((r.value / r.goal) * 100) : 0;
}
