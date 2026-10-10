import type { Bar } from "@/lib/trends";

/**
 * Bar chart for the ring detail screens, in plain SVG (no chart library, renders on the server).
 *   - rounded bars, darker when the day's goal was met, with a ✓ badge on top (when few bars);
 *   - a horizontal goal line labelled on the right;
 *   - three value ticks on the right axis (0, middle, top), like the reference design.
 * Screen readers get one summary label; every value is also in the list under the chart.
 */
export function BarChart({
  bars,
  goal,
  color,
  strongColor,
  label,
}: {
  bars: Bar[];
  goal?: number;
  color: string;
  strongColor: string;
  label: string;
}) {
  const W = 360;
  const H = 230;
  const left = 8;
  const right = 56; // room for axis labels
  const top = 26; // room for badges
  const bottom = 28; // room for x labels
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const values = bars.map((b) => b.value ?? 0);
  const rawMax = Math.max(...values, goal ?? 0, 1);
  const max = niceCeil(rawMax * 1.08);
  const y = (v: number) => top + plotH - (v / max) * plotH;

  const slot = plotW / Math.max(bars.length, 1);
  const barW = Math.max(3, Math.min(30, slot * 0.62));
  const showBadges = bars.length <= 7;
  const hasMet = bars.some((b) => b.met);
  // Hide an axis label that would sit on top of the goal label.
  // Tick labels sit 4 units below their line, the goal label 6 above its line: keep them 14+ apart.
  const ticks = [0, max / 2, max].filter((t) => goal === undefined || t === 0 || Math.abs(y(t) + 4 - (y(goal) - 6)) > 14);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: "block", overflow: "visible", maxWidth: 560, margin: "0 auto" }}>
      {/* Gridlines and right-hand axis */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={W - 4} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
            {compact(t)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {bars.map((b, i) => {
        const cx = left + slot * i + slot / 2;
        if (b.value === null || b.value <= 0) {
          return b.value === 0 ? (
            <rect key={b.key} x={cx - barW / 2} y={y(0) - 2} width={barW} height={2} rx={1} fill={color} opacity={0.35}>
              <title>{b.title}</title>
            </rect>
          ) : null;
        }
        const h = Math.max(y(0) - y(b.value), barW > 8 ? barW / 2 : 2);
        // Like the reference: goal days in full colour, other days softer, so goal days stand out at a glance.
        const fill = b.met ? strongColor : color;
        const soften = hasMet && !b.met ? 0.55 : 1;
        return (
          <g key={b.key}>
            <rect x={cx - barW / 2} y={y(0) - h} width={barW} height={h} rx={Math.min(barW / 2, 8)} fill={fill} fillOpacity={soften}>
              <title>{b.title}</title>
            </rect>
            {b.met && showBadges && <Badge cx={cx} cy={y(0) - h} fill={strongColor} />}
          </g>
        );
      })}

      {/* Goal line, drawn over the bars like the reference */}
      {goal ? (
        <g>
          <line x1={left} x2={left + plotW} y1={y(goal)} y2={y(goal)} stroke={strongColor} strokeWidth={2} />
          <text x={W - 4} y={y(goal) - 6} textAnchor="end" fontSize={11} fontWeight={700} fill={strongColor}>
            {compact(goal)}
          </text>
        </g>
      ) : null}

      {/* X labels */}
      {bars.map((b, i) =>
        b.label ? (
          <text key={`l-${b.key}`} x={left + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
            {b.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Scalloped "goal met" badge with a tick, sitting on top of the bar. */
function Badge({ cx, cy, fill }: { cx: number; cy: number; fill: string }) {
  const r = 11;
  const points = Array.from({ length: 24 }, (_, k) => {
    const a = (Math.PI * 2 * k) / 24;
    const rr = k % 2 === 0 ? r : r * 0.82;
    return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
  }).join(" ");
  return (
    <g aria-hidden="true">
      <polygon points={points} fill={fill} stroke="var(--surface)" strokeWidth={1.5} />
      <path
        d={`M${cx - 4.5} ${cy} l3 3 l6 -6.5`}
        fill="none"
        stroke="var(--surface)"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Rounds an axis maximum up to a tidy number (1, 2, 2.5 or 5 × a power of ten). */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** 12500 -> "12.5k", 900 -> "900". */
export function compact(v: number): string {
  if (v >= 10000) return `${Math.round(v / 100) / 10}k`.replace(".0k", "k");
  return Math.round(v).toLocaleString("en-CA");
}
