import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret-that-is-at-least-32-chars-long";

describe("session cookie", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("round-trips a user id", async () => {
    expect(await verifySession(await signSession(42))).toBe(42);
  });

  it("rejects a cookie whose user id was edited", async () => {
    const [, sig] = (await signSession(42)).split(".");
    expect(await verifySession(`1.${sig}`)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const token = await signSession(42);
    process.env.SESSION_SECRET = "another-secret-that-is-at-least-32-chars";
    expect(await verifySession(token)).toBeNull();
  });

  it.each([undefined, "", "42", "42.", ".abc", "abc.def", "42.sig.extra", "-1.abc"])("rejects malformed %j", async (token) => {
    expect(await verifySession(token)).toBeNull();
  });

  it("refuses to run without a strong secret", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(signSession(1)).rejects.toThrow(/SESSION_SECRET/);
  });
});
