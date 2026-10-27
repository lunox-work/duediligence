import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceCart,
  type AppliedPromotion,
  type CartLine,
  type PercentPromotion,
  type ThresholdPromotion,
} from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, priority: number, value: number, tag?: string): PercentPromotion {
  return {
    id,
    priority,
    exclusive: false,
    ...(tag !== undefined ? { tag } : {}),
    kind: "percent",
    percent: value,
  };
}

function threshold(id: string, priority: number, minimum: number, amount: number): ThresholdPromotion {
  return { id, priority, exclusive: false, kind: "threshold", minimum, amount };
}

function applied(promotions: AppliedPromotion[]): [string, number][] {
  return promotions.map((p) => [p.promotionId, p.amount]);
}

// 6000 before line promotions, 5000 after: 3000 + 2000.
function cartLines(): CartLine[] {
  return [line("discounted", 2000, 2, ["sale"]), line("full-price", 2000, 1)];
}

test("[happy-4] a threshold met by the subtotal after line promotions comes off the order", () => {
  const cart = priceCart(cartLines(), [percent("sale-25", 1, 25, "sale"), threshold("spend-5000", 1, 5000, 500)]);
  assert.equal(cart.lines[0].total, 3000);
  assert.deepEqual(applied(cart.lines[0].promotions), [["sale-25", 1000]]);
  assert.equal(cart.lines[1].total, 2000);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.deepEqual(applied(cart.orderPromotions), [["spend-5000", 500]]);
  assert.equal(cart.total, 4500);
});

test("[happy-4] a threshold one cent above the subtotal after line promotions is not applied", () => {
  const cart = priceCart(cartLines(), [percent("sale-25", 1, 25, "sale"), threshold("spend-5001", 1, 5001, 500)]);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 5000);
});

test("[boundary-10] every qualifying threshold applies, in priority order", () => {
  const cart = priceCart(
    [line("big-pack", 10000, 1)],
    [threshold("spend-9000", 2, 9000, 1000), threshold("spend-5000", 1, 5000, 600)],
  );
  assert.equal(cart.lines[0].total, 10000);
  assert.deepEqual(applied(cart.orderPromotions), [
    ["spend-5000", 600],
    ["spend-9000", 1000],
  ]);
  assert.equal(cart.total, 8400);
});

test("[boundary-10] a later threshold is judged against the subtotal, not what earlier thresholds left", () => {
  const cart = priceCart(
    [line("big-pack", 10000, 1)],
    [threshold("spend-5000", 1, 5000, 600), threshold("spend-10000", 2, 10000, 1000)],
  );
  assert.deepEqual(applied(cart.orderPromotions), [
    ["spend-5000", 600],
    ["spend-10000", 1000],
  ]);
  assert.equal(cart.total, 8400);
});

test("[boundary-10] the order total never goes below 0", () => {
  const cart = priceCart(
    [line("small-pack", 1000, 1)],
    [threshold("t-1", 1, 500, 800), threshold("t-2", 2, 1000, 800)],
  );
  assert.deepEqual(
    cart.orderPromotions.map((p) => p.promotionId),
    ["t-1", "t-2"],
  );
  assert.equal(cart.total, 0);
});
