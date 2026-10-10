import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Migration 0005: usernames are copied from sign-up, lowercased, validated and unique. */
it("stores usernames from sign-up safely", async () => {
  const db = new PGlite();
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  const root = path.resolve(__dirname, "..");
  for (const f of ["0001_init.sql", "0002_indb_source.sql", "0003_skipped_meals.sql", "0004_coaching.sql", "0005_usernames.sql"]) {
    await db.exec(readFileSync(path.join(root, "migrations", f), "utf8").replace("create extension if not exists pgcrypto;", ""));
  }
  await db.exec(`insert into auth.users values
    ('a0000000-0000-0000-0000-000000000001', '{"role":"user","username":"Harish"}'),
    ('a0000000-0000-0000-0000-000000000002', '{"role":"instructor","username":"bad name!"}')`);
  const rows = (await db.query<{ username: string | null; display_name: string; role: string }>(
    `select username, display_name, role from public.profiles order by id`,
  )).rows;
  expect(rows[0]).toEqual({ username: "harish", display_name: "harish", role: "user" });
  expect(rows[1].username).toBeNull(); // invalid usernames are not stored
  expect(rows[1].role).toBe("instructor");
  await expect(
    db.exec(`insert into auth.users values ('a0000000-0000-0000-0000-000000000003', '{"role":"user","username":"harish"}')`),
  ).rejects.toThrow(/duplicate key|unique/);
}, 60_000);
