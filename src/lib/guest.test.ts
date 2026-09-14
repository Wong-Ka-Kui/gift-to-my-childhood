import { describe, expect, it } from "vitest";
import { normalizeGuestName, validateGuestAvatar } from "./guest";

describe("guest entry", () => {
  it("keeps Chinese names and meaningful internal spaces, trimming outside whitespace", () => {
    expect(normalizeGuestName("  奶蛙 的朋友  ")).toBe("奶蛙 的朋友");
  });
  it("rejects empty, overlong and control-character names", () => {
    for (const name of [" ", "蛙".repeat(25), "奶\u0000蛙"]) expect(() => normalizeGuestName(name)).toThrow();
    expect(normalizeGuestName("蛙".repeat(24))).toHaveLength(24);
  });
  it("accepts local PNG portraits and rejects external, SVG and oversized sources", () => {
    expect(validateGuestAvatar("data:image/png;base64,YQ==")).toBe("data:image/png;base64,YQ==");
    for (const avatar of ["https://example.com/avatar.png", "data:image/svg+xml,<svg/>", "data:image/png;base64," + "A".repeat(250_000)]) {
      expect(() => validateGuestAvatar(avatar)).toThrow();
    }
  });
});
