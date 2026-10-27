import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, value: number, priority = 1, exclusive = false, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "percent", percent: value, ...(tag === undefined ? {} : { tag }) };
}

function fixed(id: string, amount: number, priority = 1, exclusive = false, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "fixed", amount, ...(tag === undefined ? {} : { tag }) };
}

function bundle(id: string, buy: number, free: number, priority = 1): Promotion {
  return { id, priority, exclusive: false, kind: "bundle", buy, free };
}

function threshold(id: string, minimum: number, amount: number, priority = 1): Promotion {
  return { id, priority, exclusive: false, kind: "threshold", minimum, amount };
}

function names(text: string): (err: unknown) => boolean {
  return (err: unknown) => err instanceof Error && err.message.includes(text);
}

// Extends public "[unhappy-1] a promotion of unknown kind is refused even when its tag matches no line": an empty cart.
test("[unhappy-1] a promotion of unknown kind is refused for an empty cart", () => {
  const unknown = { id: "kind-q7", priority: 1, exclusive: false, kind: "voucher", amount: 100 } as unknown as Promotion;

  assert.throws(() => priceCart([], [unknown]), names("kind-q7"));
});

// Extends public "[unhappy-1] a promotion of unknown kind is refused with an error naming its id": after an exclusive promotion that would block it.
test("[unhappy-1] a promotion of unknown kind is refused even when an exclusive promotion comes before it", () => {
  const unknown = { id: "blocked-k9", priority: 5, exclusive: false, kind: "Fixed", amount: 100 } as unknown as Promotion;

  assert.throws(
    () => priceCart([line("sku-1", 1000, 1)], [fixed("excl", 100, 1, true), unknown, percent("plain", 10, 9)]),
    names("blocked-k9"),
  );
});

// Extends public "[unhappy-1] a promotion of unknown kind is refused...": lines of quantity 0 only.
test("[unhappy-1] a promotion of unknown kind is refused when every line has quantity 0", () => {
  const unknown = { id: "zero-k3", priority: 1, exclusive: false, kind: "percentage", percent: 10 } as unknown as Promotion;

  assert.throws(() => priceCart([line("sku-1", 1000, 0), line("sku-2", 500, 0)], [unknown]), names("zero-k3"));
});

// Extends public "[unhappy-1] a promotion of unknown kind is refused...": without a kind, among valid promotions of all four kinds.
test("[unhappy-1] a promotion without a kind is refused among promotions of the four kinds", () => {
  const unknown = { id: "kindless-m2", priority: 3, exclusive: false, amount: 100 } as unknown as Promotion;

  assert.throws(
    () =>
      priceCart(
        [line("sku-1", 1000, 4)],
        [percent("ok-p", 10, 1), fixed("ok-f", 10, 2), unknown, bundle("ok-b", 1, 1, 4), threshold("ok-t", 100, 10, 5)],
      ),
    names("kindless-m2"),
  );
});

// Extends public "[unhappy-1] a promotion of unknown kind is refused...": an unknown kind on the order side.
test("[unhappy-1] a promotion of unknown kind with a threshold's fields is refused", () => {
  const unknown = { id: "order-k5", priority: 1, exclusive: false, kind: "thresholds", minimum: 0, amount: 100 } as unknown as Promotion;

  assert.throws(() => priceCart([line("sku-1", 1000, 1)], [threshold("ok-t", 100, 10), unknown]), names("order-k5"));
});

// Extends public "[unhappy-2] two promotions with the same id are refused with an error naming the id": an empty cart.
test("[unhappy-2] two promotions with the same id are refused for an empty cart", () => {
  assert.throws(() => priceCart([], [fixed("dup-e4", 100), percent("dup-e4", 10)]), names("dup-e4"));
});

// Extends public "[unhappy-2] a shared id is refused across different kinds, apart in the list...": both thresholds, far apart.
test("[unhappy-2] two thresholds with the same id far apart in the list are refused", () => {
  const promotions: Promotion[] = [
    threshold("dup-t8", 100, 10, 1),
    percent("p-1", 10, 2),
    fixed("f-1", 10, 3),
    bundle("b-1", 2, 1, 4),
    percent("p-2", 5, 5),
    threshold("dup-t8", 999999, 10, 6),
  ];

  assert.throws(() => priceCart([line("sku-1", 1000, 3)], promotions), names("dup-t8"));
});

// Extends public "[unhappy-2] two promotions with the same id are refused...": the second copy would be skipped after an exclusive promotion.
test("[unhappy-2] a shared id is refused even when one copy would be skipped after an exclusive promotion", () => {
  assert.throws(
    () => priceCart([line("sku-1", 1000, 1)], [fixed("dup-x2", 100, 1, true), fixed("dup-x2", 50, 2, true)]),
    names("dup-x2"),
  );
});

// Extends public "[unhappy-2] two promotions with the same id are refused...": same id with different priorities and tags, not adjacent once sorted.
test("[unhappy-2] a shared id is refused when other promotions sort between its copies", () => {
  assert.throws(
    () =>
      priceCart(
        [line("sku-1", 1000, 1, ["t"])],
        [percent("zz-dup", 10, 9, false, "t"), fixed("mid-1", 10, 5), fixed("mid-2", 10, 6), fixed("zz-dup", 10, 1, false, "u")],
      ),
    names("zz-dup"),
  );
});

// Extends public "[unhappy-3] a line with a negative unit price is refused...": other values, first line, no promotions matching.
test("[unhappy-3] a negative unit price on the first line is refused naming its product id", () => {
  assert.throws(
    () => priceCart([line("neg-first-a1", -1000, 2), line("good", 100, 1)], [fixed("other", 10, 1, false, "nothing")]),
    names("neg-first-a1"),
  );
});

// Extends public "[unhappy-3] a line with a negative unit price is refused...": on a line of quantity 0.
test("[unhappy-3] a negative unit price is refused even on a line of quantity 0", () => {
  assert.throws(() => priceCart([line("neg-zero-b2", -5, 0)], []), names("neg-zero-b2"));
});

// Extends public "[unhappy-3] a line with a negative quantity is refused...": a larger negative quantity, later in a longer cart.
test("[unhappy-3] a negative quantity deep in the cart is refused naming its product id", () => {
  assert.throws(
    () =>
      priceCart(
        [line("g-1", 100, 1), line("g-2", 200, 2), line("g-3", 300, 3), line("neg-qty-c3", 400, -3), line("g-5", 500, 5)],
        [percent("ten", 10)],
      ),
    names("neg-qty-c3"),
  );
});

// Extends public "[unhappy-3] a line with a non-whole quantity is refused...": other fractions, including a negative one.
test("[unhappy-3] quantities 2.25, 0.5 and -0.5 are refused naming the product id", () => {
  assert.throws(() => priceCart([line("frac-d1", 1000, 2.25)], []), names("frac-d1"));
  assert.throws(() => priceCart([line("good", 1000, 1), line("frac-d2", 1000, 0.5)], []), names("frac-d2"));
  assert.throws(() => priceCart([line("frac-d3", 1000, -0.5)], [percent("ten", 10)]), names("frac-d3"));
});

// Extends public "[unhappy-3] a line with quantity 0 is allowed, totals 0 and reports no promotion": every kind, exclusive, and a threshold.
test("[unhappy-3] a line with quantity 0 reports none of several matching promotions and adds nothing to the subtotal", () => {
  const cart = priceCart(
    [line("zero-sku", 99999, 0, ["t"]), line("one-sku", 1000, 2, ["t"])],
    [
      percent("ten-off", 10, 1),
      fixed("minus-50", 50, 2, false, "t"),
      bundle("bogo", 1, 1, 3),
      fixed("excl", 10, 4, true),
      threshold("spend-1000", 1000, 100, 1),
      threshold("spend-2000", 2000, 1000, 2),
    ],
  );

  assert.equal(cart.lines.length, 2);
  assert.equal(cart.lines[0].productId, "zero-sku");
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].productId, "one-sku");
  assert.deepEqual(cart.lines[1].promotions, [
    { promotionId: "ten-off", amount: 200 },
    { promotionId: "minus-50", amount: 100 },
    { promotionId: "bogo", amount: 850 },
    { promotionId: "excl", amount: 20 },
  ]);
  assert.equal(cart.lines[1].total, 830);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 830);
});
