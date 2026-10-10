import { beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Database security tests for coaching (migration 0004), run against a real Postgres engine
 * (PGlite) with Supabase-style roles, so Row-Level Security actually applies.
 * Three people: a coach (C), their client (U) and a stranger (X).
 * Run with `npm test`.
 */

const root = path.resolve(__dirname, "..");
const db = new PGlite();
const C = "c0000000-0000-0000-0000-000000000001";
const U = "a0000000-0000-0000-0000-000000000002";
const X = "b0000000-0000-0000-0000-000000000003";

/** Run SQL as a signed-in person (sets the JWT subject and switches to the authenticated role). */
async function as(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.sub','${uid}',false); set role authenticated;`);
  return (await db.query<Record<string, any>>(sql, params)).rows;
}

const results: { name: string; ok: boolean }[] = [];
const ok = (name: string, cond: boolean) => results.push({ name, ok: cond });
async function throws(name: string, fn: () => Promise<unknown>, msg?: string) {
  try {
    await fn();
    ok(`${name} (should fail)`, false);
  } catch (e) {
    ok(name, !msg || (e as Error).message.includes(msg));
  }
}

beforeAll(async () => {
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  `);
  // pgcrypto isn't bundled with PGlite; gen_random_uuid() is built into Postgres anyway.
  for (const f of ["migrations/0001_init.sql", "migrations/0002_indb_source.sql", "migrations/0003_skipped_meals.sql", "migrations/0004_coaching.sql", "migrations/0004_coaching.sql"]) {
    await db.exec(readFileSync(path.join(root, f), "utf8").replace("create extension if not exists pgcrypto;", ""));
  }
  await db.exec(`grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await db.exec(`insert into auth.users values ('${C}','{"role":"instructor","display_name":"Coach Anu"}'),('${U}','{"role":"user","display_name":"Harish"}'),('${X}','{"role":"user","display_name":"Stranger"}');
    update public.profiles set weight_kg=80, timezone='America/Toronto', birth_date='1990-05-01' where id in ('${U}','${X}');`);
}, 60_000);

it("coaching links, scopes and revocation are enforced by the database", async () => {

// client and stranger log data
for (const id of [U,X]) {
  await as(id, `insert into public.step_logs (user_id, local_date, steps) values ($1, current_date, 9000)`, [id]);
  await as(id, `insert into public.food_entries (user_id, local_date, meal, source, name, quantity, unit_label, grams, kcal, protein_g) values ($1, current_date, 'lunch','custom','Rice',1,'cup',158,205,4)`, [id]);
  await as(id, `insert into public.targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g) values ($1, current_date - 10, 2200, 120, 250, 70)`, [id]);
}
await throws("user cannot create invite", () => as(U, `select * from public.create_invite(array['activity'])`), "Only instructors");
const [inv] = await as(C, `select * from public.create_invite(array['activity','nutrition','goals'])`);
ok("invite code is 8 chars", /^[A-HJ-NP-Z2-9]{8}$/.test(inv.invite_code));
ok("coach sees nothing before acceptance", (await as(C, `select * from public.food_entries`)).length === 0);
const [pv] = await as(U, `select * from public.preview_invite($1)`, [inv.invite_code.toLowerCase()]);
ok("client previews invite (case-insensitive)", pv?.instructor_name === "Coach Anu" && pv.requested_scopes.length === 3);
await throws("bad scope rejected", () => as(U, `select public.accept_invite($1, array['photos'])`, [inv.invite_code]), "Choose at least one");
await throws("instructor cannot accept", () => as(C, `select public.accept_invite($1, array['activity'])`, [inv.invite_code]), "Only user");
const [{accept_invite: link}] = await as(U, `select public.accept_invite($1, array['activity','nutrition'])`, [inv.invite_code]);
await throws("code can't be reused", () => as(X, `select public.accept_invite($1, array['activity'])`, [inv.invite_code]), "invalid or has expired");
ok("coach sees client's food", (await as(C, `select * from public.food_entries`)).every((r) => r.user_id === U) && (await as(C, `select * from public.food_entries`)).length === 1);
ok("coach sees client's steps only", (await as(C, `select user_id from public.step_logs`)).length === 1);
ok("coach can't see targets without goals", (await as(C, `select * from public.targets`)).length === 0);
ok("coach can't read stranger", (await as(C, `select * from public.food_entries where user_id=$1`, [X])).length === 0);
ok("stranger can't read client", (await as(X, `select * from public.food_entries where user_id=$1`, [U])).length === 0);
const cl = await as(C, `select * from public.coach_clients()`);
ok("coach_clients hides body without body scope", cl.length === 1 && cl[0].display_name === "Harish" && cl[0].weight_kg === null && cl[0].age === null);
const daily = await as(C, `select * from public.coach_daily($1, current_date - 6, current_date)`, [U]);
ok("coach_daily burned uses client weight (9000*0.04*80/70=411)", daily.length === 1 && daily[0].burned_kcal === 411 && Number(daily[0].intake_kcal) === 205);
ok("coach_daily empty for stranger", (await as(C, `select * from public.coach_daily($1, current_date - 6, current_date)`, [X])).length === 0);
await throws("coach can't write client food", () => as(C, `insert into public.food_entries (user_id, local_date, meal, source, name, quantity, unit_label, grams, kcal) values ($1, current_date,'lunch','custom','x',1,'g',1,1)`, [U]));
await throws("coach can't edit link directly", async () => { const r = await as(C, `update public.coach_links set scopes = array['activity','nutrition','body','goals'] where id=$1 returning id`, [link]); if (r.length === 0) throw new Error("no rows updated (blocked by RLS)"); }, "blocked");
await throws("propose needs goals scope", () => as(C, `select public.propose_targets($1, 2000, 140, 200, 60, 10000, 'try')`, [link]), "does not share goals");
await as(U, `select public.set_link_scopes($1, array['activity','nutrition','goals','body'])`, [link]);
ok("after sharing goals coach sees targets", (await as(C, `select * from public.targets`)).length === 1);
ok("after sharing body coach sees age/weight", (await as(C, `select * from public.coach_clients()`))[0].weight_kg == 80);
const [{propose_targets: pid}] = await as(C, `select public.propose_targets($1, 2000, 140, 200, 60, 10000, 'Cut a bit')`, [link]);
await throws("stranger can't accept proposal", () => as(X, `select public.respond_proposal($1, true)`, [pid]), "not found");
await as(U, `select public.respond_proposal($1, true)`, [pid]);
const t = await as(U, `select * from public.targets order by effective_from desc limit 1`);
ok("accepted proposal becomes today's targets", t[0].kcal === 2000 && t[0].set_by === "instructor" && t[0].water_ml === 2500);
await as(C, `select public.add_note($1, 'Great protein today!', current_date)`, [link]);
await as(U, `select public.add_note($1, 'Thanks coach', null)`, [link]);
ok("both see 2 notes", (await as(U, `select * from public.coach_notes`)).length === 2 && (await as(C, `select * from public.coach_notes`)).length === 2);
ok("stranger sees no notes", (await as(X, `select * from public.coach_notes`)).length === 0);
await as(U, `select public.mark_notes_read($1)`, [link]);
const notes = await as(U, `select author_id, read_at from public.coach_notes`);
ok("mark read only marks the other person's notes", notes.find((n) => n.author_id === C)!.read_at !== null && notes.find((n) => n.author_id === U)!.read_at === null);
ok("my_coaches shows coach", (await as(U, `select * from public.my_coaches()`))[0]?.instructor_name === "Coach Anu");
await as(U, `select public.end_link($1)`, [link]);
ok("after ending, coach sees no food", (await as(C, `select * from public.food_entries`)).length === 0);
ok("after ending, coach list empty", (await as(C, `select * from public.coach_clients()`)).length === 0);
ok("after ending, coach_daily empty", (await as(C, `select * from public.coach_daily($1, current_date - 6, current_date)`, [U])).length === 0);
await throws("can't note on ended link", () => as(C, `select public.add_note($1, 'hi', null)`, [link]), "not found");
const [inv2] = await as(C, `select * from public.create_invite(array['activity'])`);
ok("coach can delete own pending invite", (await as(C, `delete from public.coach_links where id=$1 returning id`, [inv2.id])).length === 1);

  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  expect(failed).toEqual([]);
  expect(results.length).toBe(31);
}, 60_000);
