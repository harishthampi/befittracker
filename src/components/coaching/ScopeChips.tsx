import { SCOPES, SCOPE_INFO, type Scope } from "@/lib/coaching";

/** Small chips showing what a client shares; unshared scopes appear struck through. */
export function ScopeChips({ scopes, showMissing = false }: { scopes: Scope[]; showMissing?: boolean }) {
  return (
    <span className="macro-chips" aria-label={`Shares: ${scopes.map((s) => SCOPE_INFO[s].label).join(", ") || "nothing"}`}>
      {SCOPES.filter((s) => showMissing || scopes.includes(s)).map((s) => (
        <span key={s} className={scopes.includes(s) ? "chip" : "chip chip-off"} title={SCOPE_INFO[s].detail}>
          {SCOPE_INFO[s].label}
        </span>
      ))}
    </span>
  );
}
