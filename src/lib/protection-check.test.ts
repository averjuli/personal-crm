import { expect, test } from "vitest";

// Deliberately failing: checks that branch protection blocks a red PR. Never merge
test("fails on purpose", () => {
  expect(1 + 1).toBe(3);
});
