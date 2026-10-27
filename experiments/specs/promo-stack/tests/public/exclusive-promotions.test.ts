import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, value: number, priority: number, exclusive: boolean, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "percent", percent: value, ...(tag === undefined ? {} : { tag }) };
}

function fixed(id: string, amount: number, priority: number, exclusive: boolean, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "fixed", amount, ...(tag === undefined ? {} : { tag }) };
}

test("[boundary-5] an exclusive promotion blocks the promotions after it but not those before", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("third", 20, 3, false), fixed("second", 100, 2, true), percent("first", 10, 1, false)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "first", amount: 100 },
    { promotionId: "second", amount: 100 },
  ]);
  assert.equal(cart.lines[0].total, 800);
  assert.equal(cart.total, 800);
});

test("[boundary-5] when the exclusive promotion comes first in order, only it applies", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("third", 20, 3, false), percent("second", 10, 2, false), fixed("first", 100, 1, true)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "first", amount: 100 }]);
  assert.equal(cart.lines[0].total, 900);
  assert.equal(cart.total, 900);
});

test("[boundary-6] of two exclusive promotions matching a line, only the earlier one applies", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("later", 10, 2, true), fixed("earlier", 100, 1, true)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "earlier", amount: 100 }]);
  assert.equal(cart.lines[0].total, 900);
  assert.equal(cart.total, 900);
});

test("[boundary-6] a skipped exclusive promotion still applies to another line that only it matches", () => {
  const cart = priceCart(
    [line("both", 1000, 1, ["x", "y"]), line("only-y", 1000, 1, ["y"])],
    [
      fixed("excl-y", 50, 3, true, "y"),
      fixed("excl-x", 100, 2, true, "x"),
      percent("plain-x", 10, 1, false, "x"),
    ],
  );

  assert.equal(cart.lines[0].productId, "both");
  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "plain-x", amount: 100 },
    { promotionId: "excl-x", amount: 100 },
  ]);
  assert.equal(cart.lines[0].total, 800);
  assert.equal(cart.lines[1].productId, "only-y");
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "excl-y", amount: 50 }]);
  assert.equal(cart.lines[1].total, 950);
  assert.equal(cart.total, 1750);
});
