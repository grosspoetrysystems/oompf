import { expect, test } from "bun:test";
import { VERSION } from "@oompf/core";

test("Bun workspace resolves @oompf/core and exposes VERSION", () => {
  expect(typeof VERSION).toBe("string");
  expect(VERSION).toBe("0.0.0");
});
