"use server";

/**
 * Coaching Server Actions for both sides. Each one calls a database function that checks
 * who the caller is and what they're allowed to do (migration 0004), so these stay thin:
 * read the form, validate the shape, call the function, refresh the pages.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cleanScopes, normalizeCode } from "@/lib/coaching";
import { friendly } from "@/lib/coach-server";
import type { FormState } from "@/app/(auth)/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function client() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return supabase;
}

function refreshAll() {
  revalidatePath("/coach", "layout");
  revalidatePath("/app", "layout");
}

// ---------------------------------------------------------------------------
// Instructor
// ---------------------------------------------------------------------------

export async function createInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await client();
  const scopes = cleanScopes(form.getAll("scopes"));
  if (scopes.length === 0) return { error: "Choose at least one thing to ask for." };
  const { error } = await supabase.rpc("create_invite", { p_scopes: scopes });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/coach/invite");
  return { message: "New code created. Share it with your client." };
}

export async function cancelInvite(form: FormData) {
  const supabase = await client();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  await supabase.from("coach_links").delete().eq("id", id).eq("status", "pending");
  revalidatePath("/coach/invite");
}

export async function proposeTargets(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await client();
  const link = String(form.get("link") ?? "");
  if (!UUID.test(link)) return { error: "Client not found." };
  const n = (k: string) => Math.round(Number(form.get(k)));
  const v = { kcal: n("kcal"), protein: n("protein_g"), carbs: n("carbs_g"), fat: n("fat_g"), steps: n("steps") };
  const limits: Record<keyof typeof v, [number, number]> = {
    kcal: [800, 6000],
    protein: [0, 500],
    carbs: [0, 1000],
    fat: [0, 400],
    steps: [0, 100000],
  };
  for (const [k, [lo, hi]] of Object.entries(limits) as [keyof typeof v, [number, number]][]) {
    if (!Number.isFinite(v[k]) || v[k] < lo || v[k] > hi) return { error: `Check ${k}: allowed ${lo}–${hi.toLocaleString("en-CA")}.` };
  }
  const message = String(form.get("message") ?? "").slice(0, 500);
  const { error } = await supabase.rpc("propose_targets", {
    p_link: link,
    p_kcal: v.kcal,
    p_protein: v.protein,
    p_carbs: v.carbs,
    p_fat: v.fat,
    p_steps: v.steps,
    p_message: message,
  });
  if (error) return { error: friendly(error.message) };
  refreshAll();
  return { message: "Sent. Your client will see it on their Coach page and can accept or decline." };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export async function acceptInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await client();
  const code = normalizeCode(String(form.get("code") ?? ""));
  const scopes = cleanScopes(form.getAll("scopes"));
  if (code.length !== 8) return { error: "Codes are 8 letters and numbers." };
  if (scopes.length === 0) return { error: "Choose at least one thing to share." };
  const { error } = await supabase.rpc("accept_invite", { p_code: code, p_scopes: scopes });
  if (error) return { error: friendly(error.message) };
  refreshAll();
  redirect("/app/coach?joined=1");
}

export async function saveScopes(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await client();
  const link = String(form.get("link") ?? "");
  const scopes = cleanScopes(form.getAll("scopes"));
  if (!UUID.test(link)) return { error: "Coach not found." };
  if (scopes.length === 0) return { error: "Choose at least one, or use Stop sharing instead." };
  const { error } = await supabase.rpc("set_link_scopes", { p_link: link, p_scopes: scopes });
  if (error) return { error: friendly(error.message) };
  refreshAll();
  return { message: "Sharing updated." };
}

export async function respondProposal(form: FormData) {
  const supabase = await client();
  const id = String(form.get("id") ?? "");
  const accept = form.get("accept") === "yes";
  if (!UUID.test(id)) return;
  await supabase.rpc("respond_proposal", { p_proposal: id, p_accept: accept });
  refreshAll();
  revalidatePath("/app/targets");
}

// ---------------------------------------------------------------------------
// Both
// ---------------------------------------------------------------------------

/** Ends the coaching link (either side). Access stops immediately. */
export async function endCoaching(form: FormData) {
  const supabase = await client();
  const link = String(form.get("link") ?? "");
  const back = form.get("back") === "coach" ? "/coach" : "/app/coach";
  if (UUID.test(link)) await supabase.rpc("end_link", { p_link: link });
  refreshAll();
  redirect(back);
}

export async function sendNote(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await client();
  const link = String(form.get("link") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const date = String(form.get("date") ?? "");
  if (!UUID.test(link)) return { error: "Conversation not found." };
  if (body.length === 0) return { error: "Write a note first." };
  if (body.length > 1000) return { error: "Notes are up to 1,000 characters." };
  const { error } = await supabase.rpc("add_note", { p_link: link, p_body: body, p_date: DATE.test(date) ? date : null });
  if (error) return { error: friendly(error.message) };
  refreshAll();
  return { message: "Sent." };
}
