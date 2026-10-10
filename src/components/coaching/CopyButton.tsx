"use client";

import { useState } from "react";

/** Copies text (an invite message) to the clipboard, with a visible and announced confirmation. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. plain http on a phone); select-and-copy still works.
      setCopied(false);
    }
  }
  return (
    <button type="button" className="btn btn-ghost btn-small" onClick={copy} aria-live="polite">
      {copied ? "Copied ✓" : label}
    </button>
  );
}
