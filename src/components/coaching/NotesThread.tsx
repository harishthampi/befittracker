import type { Note } from "@/lib/coach-server";
import { dayLabel } from "@/lib/trends";

/** A coaching conversation, oldest first. The other person's unread notes are highlighted. */
export function NotesThread({
  notes,
  me,
  otherName,
  timeZone,
  today,
}: {
  notes: Note[];
  me: string;
  otherName: string;
  timeZone: string;
  today: string;
}) {
  if (notes.length === 0) {
    return <p className="muted small">No notes yet.</p>;
  }
  const when = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
  return (
    <ul className="notes">
      {notes.map((n) => {
        const mine = n.author_id === me;
        return (
          <li key={n.id} className={mine ? "note note-mine" : n.read_at ? "note" : "note note-unread"}>
            <div className="small muted">
              <strong>{mine ? "You" : otherName}</strong> · {when.format(new Date(n.created_at))}
              {n.local_date && <> · about {dayLabel(n.local_date, today)}</>}
              {!mine && !n.read_at && <span className="new-tag">New</span>}
            </div>
            <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap" }}>{n.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
