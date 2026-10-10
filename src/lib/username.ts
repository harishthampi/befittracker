/**
 * Usernames instead of emails.
 *
 * Supabase Auth needs an email-shaped login, so each username maps to a hidden placeholder
 * address: "harish" -> "harish@users.befittracker.app". No email is ever sent to it, because
 * "Confirm email" is turned off in Supabase and password resets are done by the app owner.
 * People only ever see and type their username.
 */

/** 3–20 characters: lowercase letters, numbers, dot or underscore; starts with a letter or number. */
const USERNAME = /^[a-z0-9][a-z0-9._]{2,19}$/;

/** Lowercases and trims, so "Harish " and "harish" are the same account. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Returns an error message, or null when the username is fine. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3) return "Usernames need at least 3 characters.";
  if (username.length > 20) return "Usernames can be up to 20 characters.";
  if (!USERNAME.test(username)) return "Use only letters, numbers, dots and underscores, starting with a letter or number.";
  if (/[._]{2}/.test(username) || /[._]$/.test(username)) return "Dots and underscores can't be doubled or at the end.";
  return null;
}

/**
 * Domain for the hidden addresses. Server-only setting; change it if Supabase ever rejects
 * the placeholder addresses (see the go-live guide). Changing it later breaks existing logins,
 * so pick it once.
 */
export function usernameDomain(): string {
  return (process.env.USERNAME_EMAIL_DOMAIN || "users.befittracker.app").trim().toLowerCase();
}

export function usernameToEmail(username: string, domain = usernameDomain()): string {
  return `${normalizeUsername(username)}@${domain}`;
}

/**
 * What to sign in with. Accounts made before usernames existed still sign in with their email,
 * so anything containing "@" is used as-is.
 */
export function loginEmail(input: string, domain = usernameDomain()): string {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : usernameToEmail(v, domain);
}
