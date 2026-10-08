import { test } from "node:test";
import assert from "node:assert/strict";
import { validHandle } from "../lib/handle";

test("display usernames allow natural text while rejecting ambiguous or invisible characters", () => {
  for (const name of ["Inês de Lisboa", "No underscore", "Lee!", "山田 太郎"])
    assert.equal(validHandle(name), true);
  for (const name of [
    "",
    "a",
    " a",
    "a ",
    "a@example.com",
    "line\nbreak",
    "zero\u200dwidth",
  ])
    assert.equal(validHandle(name), false);
});
