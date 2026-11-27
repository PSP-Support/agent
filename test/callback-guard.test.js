import test from "node:test";
import assert from "node:assert/strict";
import { createCallbackGuard } from "../handlers/callback-guard.js";

test("same user and callback data are suppressed during the double-click window", async () => {
  let now = 1000,
    calls = 0,
    answers = 0;
  const guard = createCallbackGuard({ cooldownMs: 1200, now: () => now });
  const ctx = {
    from: { id: 42 },
    callbackQuery: { data: "shopbuy:railway" },
    answerCallbackQuery: async () => {
      answers += 1;
    },
  };
  await guard(ctx, async () => {
    calls += 1;
  });
  await guard(ctx, async () => {
    calls += 1;
  });
  assert.equal(calls, 1);
  assert.equal(answers, 1);

  now += 1200;
  await guard(ctx, async () => {
    calls += 1;
  });
  assert.equal(calls, 2);
});

test("different callback actions are not blocked by the same user's prior action", async () => {
  let calls = 0;
  const guard = createCallbackGuard({ now: () => 5000 });
  const ctx = {
    from: { id: 42 },
    callbackQuery: { data: "shopbuy:railway" },
    answerCallbackQuery: async () => {},
  };
  await guard(ctx, async () => {
    calls += 1;
  });
  ctx.callbackQuery.data = "buy:55";
  await guard(ctx, async () => {
    calls += 1;
  });
  assert.equal(calls, 2);
});
