import { expect, test } from "bun:test";
import { mergeEnvironment } from "./with-env.ts";

test("local values fill missing process values without overriding CI values", () => {
  expect(
    mergeEnvironment(
      { DATABASE_URL: "from-local", LOCAL_ONLY: "yes" },
      { CI_ONLY: "yes", DATABASE_URL: "from-ci" }
    )
  ).toEqual({
    CI_ONLY: "yes",
    DATABASE_URL: "from-ci",
    LOCAL_ONLY: "yes",
  });
});
