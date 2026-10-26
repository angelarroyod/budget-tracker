import { describe, expect, it } from "vitest";
import en from "../../messages/en-US.json";
import es from "../../messages/es-MX.json";

const keys = (obj: object, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe("translations", () => {
  it("Spanish has exactly the same keys as English", () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});
