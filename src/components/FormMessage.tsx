import type { FormState } from "@/app/(auth)/actions";

/** Shows a server action's error or success message, announced to screen readers. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p className="alert alert-error" role="alert">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="alert alert-ok" role="status">
        {state.message}
      </p>
    );
  return null;
}
