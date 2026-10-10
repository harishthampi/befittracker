import { describe, expect, it } from "vitest";
import { loginEmail, normalizeUsername, usernameProblem, usernameToEmail } from "./username";

describe("usernames", () => {
  it("accepts simple usernames", () => {
    for (const u of ["harish", "amma_2026", "coach.anu", "abc"]) expect(usernameProblem(u), u).toBeNull();
  });
  it("rejects bad ones with a reason", () => {
    expect(usernameProblem("ab")).toMatch(/at least 3/);
    expect(usernameProblem("a".repeat(21))).toMatch(/up to 20/);
    expect(usernameProblem("har ish")).toMatch(/letters, numbers/);
    expect(usernameProblem("_harish")).toMatch(/starting with/);
    expect(usernameProblem("har..ish")).toMatch(/doubled/);
    expect(usernameProblem("harish.")).toMatch(/at the end/);
    expect(usernameProblem("hárish")).toMatch(/letters, numbers/);
  });
  it("is case-insensitive", () => {
    expect(normalizeUsername("  Harish ")).toBe("harish");
    expect(usernameToEmail("Harish", "users.example.app")).toBe("harish@users.example.app");
  });
  it("still lets old email accounts sign in", () => {
    expect(loginEmail("Old@Gmail.com", "users.example.app")).toBe("old@gmail.com");
    expect(loginEmail("harish", "users.example.app")).toBe("harish@users.example.app");
  });
});
