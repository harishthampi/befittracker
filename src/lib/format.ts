/** 1.5 -> "1.5", 2 -> "2", 0.333 -> "0.33" */
export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * How a logged amount reads in the diary, e.g. "1 serving · 283 g" or "2 × idli · 50 g".
 * Serving labels from the databases already start with "1 " and often end with the weight
 * in brackets ("1 serving (283.0g)"), so we drop both to avoid "1 1 serving (283.0g) · 283 g".
 */
export function formatAmount(quantity: number, unitLabel: string, grams: number): string {
  const qty = formatQty(quantity);
  const g = `${Math.round(grams)} g`;
  if (unitLabel === "g") return g;

  const unit = unitLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const single = unit.match(/^1\s+(.+)$/);
  const amount = single ? (quantity === 1 ? unit : `${qty} × ${single[1]}`) : `${qty} ${unit}`;
  return `${amount} · ${g}`;
}
