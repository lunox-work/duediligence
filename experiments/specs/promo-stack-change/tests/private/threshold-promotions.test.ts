import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceCart,
  type AppliedPromotion,
  type BundlePromotion,
  type CartLine,
  type FixedPromotion,
  type PercentPromotion,
  type ThresholdPromotion,
} from "../../src/index.js";

interface Options {
  exclusive?: boolean;
  tag?: string;
}

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function base(id: string, priority: number, options: Options) {
  return {
    id,
    priority,
    exclusive: options.exclusive ?? false,
    ...(options.tag !== undefined ? { tag: options.tag } : {}),
  };
}

function percent(id: string, priority: number, value: number, options: Options = {}): PercentPromotion {
  return { ...base(id, priority, options), kind: "percent", percent: value };
}

function fixed(id: string, priority: number, amount: number, options: Options = {}): FixedPromotion {
  return { ...base(id, priority, options), kind: "fixed", amount };
}

function bundle(id: string, priority: number, buy: number, free: number, options: Options = {}): BundlePromotion {
  return { ...base(id, priority, options), kind: "bundle", buy, free };
}

function threshold(id: string, priority: number, minimum: number, amount: number): ThresholdPromotion {
  return { id, priority, exclusive: false, kind: "threshold", minimum, amount };
}

function applied(promotions: AppliedPromotion[]): [string, number][] {
  return promotions.map((p) => [p.promotionId, p.amount]);
}

// 6500 before line promotions; 2700 + 2500 = 5200 after.
function mixedLines(): CartLine[] {
  return [line("pct-line", 1000, 3, ["p"]), line("bundle-line", 500, 7, ["b"])];
}

function mixedPromotions(): (PercentPromotion | BundlePromotion)[] {
  return [percent("pct-10", 1, 10, { tag: "p" }), bundle("buy2get1", 1, 2, 1, { tag: "b" })];
}

// Extends "[happy-4] a threshold met by the subtotal after line promotions comes off the
// order": other values, more lines, and a bundle among the line promotions.
test("[happy-4] a threshold met exactly by a subtotal of several discounted lines comes off the order", () => {
  const cart = priceCart(mixedLines(), [...mixedPromotions(), threshold("spend-5200", 1, 5200, 700)]);
  assert.equal(cart.lines[0].total, 2700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-10", 300]]);
  assert.equal(cart.lines[1].total, 2500);
  assert.deepEqual(applied(cart.lines[1].promotions), [["buy2get1", 1000]]);
  assert.deepEqual(applied(cart.orderPromotions), [["spend-5200", 700]]);
  assert.equal(cart.total, 4500);
});

// Extends "[happy-4] a threshold one cent above the subtotal after line promotions is not
// applied": the subtotal is one cent short, though the cart before promotions is far above.
test("[happy-4] a threshold one cent above a subtotal of several discounted lines is not reported", () => {
  const cart = priceCart(mixedLines(), [...mixedPromotions(), threshold("spend-5201", 1, 5201, 700)]);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 5200);
});

test("[happy-4] the subtotal counts a line as the exclusive promotion left it", () => {
  const cart = priceCart(
    [line("vip", 1000, 5, ["vip"]), line("plain", 1000, 1)],
    [
      percent("vip-5", 1, 5, { tag: "vip" }),
      fixed("vip-excl", 2, 200, { exclusive: true, tag: "vip" }),
      threshold("spend-5000", 1, 5000, 500),
      threshold("spend-5001", 2, 5001, 500),
    ],
  );
  // vip: stack 250 vs exclusive 1000, so 4000; plain 1000; subtotal 5000.
  assert.equal(cart.lines[0].total, 4000);
  assert.deepEqual(applied(cart.lines[0].promotions), [["vip-excl", 1000]]);
  assert.equal(cart.lines[1].total, 1000);
  assert.deepEqual(applied(cart.orderPromotions), [["spend-5000", 500]]);
  assert.equal(cart.total, 4500);
});

test("[happy-4] a threshold is reported only on the order and leaves line totals as they are", () => {
  const cart = priceCart(
    [line("a", 1500, 2), line("b", 1000, 3, ["x"])],
    [threshold("spend-1000", 1, 1000, 250)],
  );
  assert.equal(cart.lines[0].total, 3000);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].total, 3000);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.deepEqual(applied(cart.orderPromotions), [["spend-1000", 250]]);
  assert.equal(cart.total, 5750);
});

test("[happy-4] of two thresholds only the one the subtotal reaches is reported", () => {
  const cart = priceCart(
    [line("a", 1200, 2), line("b", 300, 2)],
    [threshold("too-high", 1, 99999, 5000), threshold("reached", 2, 3000, 100)],
  );
  assert.deepEqual(applied(cart.orderPromotions), [["reached", 100]]);
  assert.equal(cart.total, 2900);
});

test("[happy-4] a line with quantity 0 adds nothing to the subtotal", () => {
  const cart = priceCart(
    [line("empty", 5000, 0), line("real", 2000, 2)],
    [threshold("spend-4001", 1, 4001, 500), threshold("spend-4000", 2, 4000, 300)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.orderPromotions), [["spend-4000", 300]]);
  assert.equal(cart.total, 3700);
});

// Extends "[boundary-10] every qualifying threshold applies, in priority order": equal
// priorities order by id, whatever the input order.
test("[boundary-10] thresholds at equal priority apply in id order", () => {
  const cart = priceCart(
    [line("big-pack", 10000, 1)],
    [threshold("beta", 1, 5000, 600), threshold("alpha", 1, 9000, 1000)],
  );
  assert.deepEqual(applied(cart.orderPromotions), [
    ["alpha", 1000],
    ["beta", 600],
  ]);
  assert.equal(cart.total, 8400);
});

test("[boundary-10] threshold priorities order numerically", () => {
  const cart = priceCart(
    [line("big-pack", 10000, 1)],
    [threshold("ten", 10, 5000, 600), threshold("nine", 9, 9000, 1000)],
  );
  assert.deepEqual(applied(cart.orderPromotions), [
    ["nine", 1000],
    ["ten", 600],
  ]);
  assert.equal(cart.total, 8400);
});

// Extends "[boundary-10] a later threshold is judged against the subtotal, not what earlier
// thresholds left": three qualifying, the last judged after two others would have taken
// 3000 off, and one that the subtotal does not reach.
test("[boundary-10] every threshold is judged against the same subtotal, however many come before it", () => {
  const cart = priceCart(
    [line("a", 4000, 2), line("b", 1000, 2)],
    [
      threshold("t3", 3, 9500, 500),
      threshold("t1", 1, 1000, 2000),
      threshold("t2", 2, 7000, 1000),
      threshold("t4", 4, 10001, 400),
    ],
  );
  assert.deepEqual(applied(cart.orderPromotions), [
    ["t1", 2000],
    ["t2", 1000],
    ["t3", 500],
  ]);
  assert.equal(cart.total, 6500);
});

test("[boundary-10] thresholds are judged against the subtotal after line promotions, then all apply", () => {
  const cart = priceCart(
    [line("sku-1", 2000, 6)],
    [percent("pct-25", 1, 25), threshold("t-9000", 2, 9000, 1000), threshold("t-8500", 1, 8500, 800)],
  );
  // 12000 -> 9000 after the percent.
  assert.equal(cart.lines[0].total, 9000);
  assert.deepEqual(applied(cart.orderPromotions), [
    ["t-8500", 800],
    ["t-9000", 1000],
  ]);
  assert.equal(cart.total, 7200);
});

// Extends "[boundary-10] the order total never goes below 0": a single threshold larger
// than the subtotal, and a subtotal already reduced by line promotions.
test("[boundary-10] a single threshold larger than the subtotal leaves an order total of 0", () => {
  const cart = priceCart([line("small", 300, 1)], [threshold("big-off", 1, 100, 1000)]);
  assert.deepEqual(
    cart.orderPromotions.map((p) => p.promotionId),
    ["big-off"],
  );
  assert.equal(cart.lines[0].total, 300);
  assert.equal(cart.total, 0);
});

test("[boundary-10] thresholds together larger than a discounted subtotal leave an order total of 0", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-50", 1, 50), threshold("t-b", 2, 400, 300), threshold("t-a", 2, 500, 300)],
  );
  assert.equal(cart.lines[0].total, 500);
  assert.deepEqual(
    cart.orderPromotions.map((p) => p.promotionId),
    ["t-a", "t-b"],
  );
  assert.equal(cart.total, 0);
});
