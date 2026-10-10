"use client";

import { useFormStatus } from "react-dom";

/** A submit button that disables itself and shows progress while its form is sending. */
export function SubmitButton({
  children,
  pending,
  className = "btn btn-block",
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
}) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={isPending} aria-busy={isPending}>
      {isPending ? (pending ?? "Saving…") : children}
    </button>
  );
}
