import { describe, expect, it } from "vitest";

import { EMAIL_INVALID_MESSAGE, parseEmail } from "@/lib/email-address";

describe("parseEmail", () => {
  it("strips spaces around the address", () => {
    expect(parseEmail("  anna@example.com  ")).toEqual({
      ok: true,
      email: "anna@example.com",
    });
  });

  it("lowercases the address", () => {
    expect(parseEmail(" Anna@Example.COM ")).toEqual({
      ok: true,
      email: "anna@example.com",
    });
  });

  it.each(["anna@", "not-an-email", "@example.com", "anna@example", "a b@c.d"])(
    "rejects %j",
    (value) => {
      expect(parseEmail(value)).toEqual({
        ok: false,
        error: "Проверь адрес почты",
      });
    },
  );

  it("rejects an empty string", () => {
    expect(parseEmail("")).toEqual({ ok: false, error: EMAIL_INVALID_MESSAGE });
  });

  it("rejects spaces only", () => {
    expect(parseEmail("   ")).toEqual({
      ok: false,
      error: EMAIL_INVALID_MESSAGE,
    });
  });

  it("rejects a value that is not a string", () => {
    expect(parseEmail(undefined)).toEqual({
      ok: false,
      error: EMAIL_INVALID_MESSAGE,
    });
    expect(parseEmail(42)).toEqual({ ok: false, error: EMAIL_INVALID_MESSAGE });
  });
});
