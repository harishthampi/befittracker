"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendNote } from "@/app/coaching-actions";
import type { FormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

/** Write a note in a coaching conversation. Optionally attaches it to a day ("about Oct 9"). */
export function NoteForm({ link, date, dateLabel, placeholder }: { link: string; date?: string; dateLabel?: string; placeholder?: string }) {
  const [state, action] = useActionState<FormState, FormData>(sendNote, {});
  const ref = useRef<HTMLFormElement>(null);

  // Clear the box after a note is sent.
  useEffect(() => {
    if (state.message) ref.current?.reset();
  }, [state]);

  const id = `note-${link.slice(0, 8)}`;
  return (
    <form ref={ref} action={action} style={{ marginTop: "0.75rem" }}>
      <input type="hidden" name="link" value={link} />
      <label htmlFor={id} className="visually-hidden">
        Write a note
      </label>
      <textarea id={id} name="body" rows={3} maxLength={1000} placeholder={placeholder ?? "Write a note…"} required />
      {date && (
        <label className="row small" style={{ fontWeight: 400, margin: "0.5rem 0", flexWrap: "nowrap" }}>
          <input type="checkbox" name="date" value={date} style={{ width: 20, minHeight: 20 }} />
          About {dateLabel ?? date}
        </label>
      )}
      <FormMessage state={state} />
      <div style={{ marginTop: "0.5rem" }}>
        <SubmitButton className="btn btn-small" pending="Sending…">
          Send note
        </SubmitButton>
      </div>
    </form>
  );
}
