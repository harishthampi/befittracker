#!/usr/bin/env node
/**
 * Reset someone's password (owner only). There's no email reset because accounts use usernames.
 *
 *   node scripts/reset-password.mjs <username> <new-password>
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (the service
 * role key is on Supabase → Project Settings → API Keys → Secret keys). Never share that key.
 * Run it from the befittracker folder on your own computer.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local; rely on real environment variables
  }
}
loadEnv(".env.local");

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: node scripts/reset-password.mjs <username> <new-password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Use at least 8 characters.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.");
  process.exit(1);
}

const domain = (process.env.USERNAME_EMAIL_DOMAIN || "users.befittracker.app").trim().toLowerCase();
const login = username.includes("@") ? username.toLowerCase() : `${username.trim().toLowerCase()}@${domain}`;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Find the account by its login address (pages through users; fine for a family-sized app).
let found = null;
for (let page = 1; page <= 50 && !found; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("Couldn't list users:", error.message);
    process.exit(1);
  }
  found = data.users.find((u) => u.email?.toLowerCase() === login);
  if (data.users.length < 200) break;
}
if (!found) {
  console.error(`No account found for "${username}".`);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(found.id, { password });
if (error) {
  console.error("Couldn't reset the password:", error.message);
  process.exit(1);
}
console.log(`Password reset for "${username}". Ask them to sign in and change it under Account.`);
