"use client";

import { useState } from "react";
import { WorkoutForm } from "../QuickAdd";

/** "+ Log workout" button on the diary that opens the workout form for the day being viewed. */
export function AddWorkoutToggle({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <button
        type="button"
        className={open ? "btn btn-ghost btn-small" : "btn btn-small"}
        aria-expanded={open}
        aria-controls="diary-workout"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close" : "+ Log workout"}
      </button>
      {open && <WorkoutForm date={date} idPrefix="diary" />}
    </div>
  );
}
