import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function threshold(id: string, minimum: number, amount: number, priority = 1): Promotion {
  return { id, priority, exclusive: false, kind: "threshold", minimum, amount };
}

function fixed(id: string, amount: number, priority: number, tag: string): Promotion {
  return { id, priority, exclusive: false, kind: "fixed", amount, tag };
}

test("[happy-4] a threshold met by the subtotal after line promotions comes off the order", () => {
  const cart = priceCart(
    [line("credits", 2000, 2, ["credits"]), line("extra", 1500, 1)],
    [threshold("spend-5000", 5000, 500), fixed("credit-250", 250, 1, "credits")],
  );

  assert.equal(cart.lines[0].total, 3500);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "credit-250", amount: 500 }]);
  assert.equal(cart.lines[1].total, 1500);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.deepEqual(cart.orderPromotions, [{ promotionId: "spend-5000", amount: 500 }]);
  assert.equal(cart.total, 4500);
});

test("[happy-4] a threshold whose minimum is one cent above the subtotal is not applied or reported", () => {
  const cart = priceCart(
    [line("credits", 2000, 2, ["credits"]), line("extra", 1500, 1)],
    [threshold("spend-5001", 5001, 500), fixed("credit-250", 250, 1, "credits")],
  );

  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 5000);
});

test("[boundary-7] every qualifying threshold applies, in priority order", () => {
  const cart = priceCart(
    [line("big", 10000, 1)],
    [threshold("over-9000", 9000, 1000, 2), threshold("over-5000", 5000, 600, 1)],
  );

  assert.deepEqual(cart.orderPromotions, [
    { promotionId: "over-5000", amount: 600 },
    { promotionId: "over-9000", amount: 1000 },
  ]);
  assert.equal(cart.total, 8400);
});

test("[boundary-7] a later threshold is judged against the subtotal, not what earlier thresholds left", () => {
  const cart = priceCart(
    [line("big", 10000, 1)],
    [threshold("t-b", 9500, 1000, 1), threshold("t-a", 5000, 600, 1)],
  );

  assert.deepEqual(cart.orderPromotions, [
    { promotionId: "t-a", amount: 600 },
    { promotionId: "t-b", amount: 1000 },
  ]);
  assert.equal(cart.total, 8400);
});

test("[boundary-7] the order total never goes below 0", () => {
  const cart = priceCart(
    [line("small", 1000, 1)],
    [threshold("t-1", 500, 800, 1), threshold("t-2", 500, 800, 2)],
  );

  assert.equal(cart.total, 0);
});
