import { describe, expect, it } from "vitest";
import { formatAmount, formatQty } from "./format";

describe("formatAmount", () => {
  it("fixes the doubled '1 1 serving (283.0g)' label", () => {
    expect(formatAmount(1, "1 serving (283.0g)", 283)).toBe("1 serving · 283 g");
  });
  it("shows a multiplier for more than one serving", () => {
    expect(formatAmount(2, "1 idli (25 g)", 50)).toBe("2 × idli · 50 g");
  });
  it("keeps plain units", () => {
    expect(formatAmount(1.5, "cup", 237)).toBe("1.5 cup · 237 g");
    expect(formatAmount(3, "oz", 85.05)).toBe("3 oz · 85 g");
  });
  it("shows grams once for gram entries", () => {
    expect(formatAmount(150, "g", 150)).toBe("150 g");
  });
});

describe("formatQty", () => {
  it("trims trailing zeros", () => {
    expect(formatQty(0.5)).toBe("0.5");
    expect(formatQty(1 / 3)).toBe("0.33");
    expect(formatQty(2)).toBe("2");
  });
});
