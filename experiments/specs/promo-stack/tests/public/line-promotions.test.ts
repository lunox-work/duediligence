import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, value: number, priority = 1, tag?: string): Promotion {
  return { id, priority, exclusive: false, kind: "percent", percent: value, ...(tag === undefined ? {} : { tag }) };
}

function fixed(id: string, amount: number, priority = 1, tag?: string): Promotion {
  return { id, priority, exclusive: false, kind: "fixed", amount, ...(tag === undefined ? {} : { tag }) };
}

function bundle(id: string, buy: number, free: number, priority = 1, tag?: string): Promotion {
  return { id, priority, exclusive: false, kind: "bundle", buy, free, ...(tag === undefined ? {} : { tag }) };
}

test("[happy-1] a percentage comes off the line total", () => {
  const cart = priceCart([line("sku-1", 1000, 3)], [percent("ten-off", 10)]);

  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].productId, "sku-1");
  assert.equal(cart.lines[0].total, 2700);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "ten-off", amount: 300 }]);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 2700);
});

test("[happy-1] a 100 percent promotion takes off the whole line", () => {
  const cart = priceCart([line("sku-1", 1000, 3)], [percent("all-off", 100)]);

  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "all-off", amount: 3000 }]);
  assert.equal(cart.total, 0);
});

test("[happy-2] a fixed amount comes off each unit of a tagged line, and an untagged line is untouched", () => {
  const cart = priceCart(
    [line("credits-pack", 1500, 2, ["credits"]), line("other", 800, 1)],
    [fixed("credit-200", 200, 1, "credits")],
  );

  assert.equal(cart.lines.length, 2);
  assert.equal(cart.lines[0].productId, "credits-pack");
  assert.equal(cart.lines[0].total, 2600);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "credit-200", amount: 400 }]);
  assert.equal(cart.lines[1].productId, "other");
  assert.equal(cart.lines[1].total, 800);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.equal(cart.total, 3400);
});

test("[happy-2] a tag matches a line carrying it among other tags, and not a line with a different tag", () => {
  const cart = priceCart(
    [line("multi", 1500, 2, ["sale", "credits", "bulk"]), line("near-miss", 1500, 2, ["credit"])],
    [fixed("credit-200", 200, 1, "credits")],
  );

  assert.equal(cart.lines[0].total, 2600);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "credit-200", amount: 400 }]);
  assert.equal(cart.lines[1].total, 3000);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.equal(cart.total, 5600);
});

test("[happy-3] a bundle gives one free unit per full group, and the leftover unit pays in full", () => {
  const cart = priceCart([line("sku-7", 500, 7)], [bundle("b2f1", 2, 1)]);

  assert.equal(cart.lines[0].total, 2500);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "b2f1", amount: 1000 }]);
  assert.equal(cart.total, 2500);
});

test("[happy-3] a bundle frees a unit for exactly one full group, and nothing for an incomplete group", () => {
  const cart = priceCart([line("sku-3", 500, 3, ["a"]), line("sku-2", 500, 2, ["b"])], [bundle("b2f1", 2, 1)]);

  assert.equal(cart.lines[0].total, 1000);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "b2f1", amount: 500 }]);
  assert.equal(cart.lines[1].total, 1000);
  assert.equal(cart.total, 2000);
});

test("[boundary-1] line promotions apply by ascending priority, each on what the previous left", () => {
  const cart = priceCart([line("sku-1", 1000, 1)], [fixed("b", 100, 2), percent("a", 50, 1)]);

  assert.equal(cart.lines[0].total, 400);
  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "a", amount: 500 },
    { promotionId: "b", amount: 100 },
  ]);
  assert.equal(cart.total, 400);
});

test("[boundary-1] with equal priorities the promotion whose id sorts first applies first", () => {
  const cart = priceCart([line("sku-1", 1000, 1)], [percent("b", 50, 1), fixed("a", 100, 1)]);

  assert.equal(cart.lines[0].total, 450);
  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "a", amount: 100 },
    { promotionId: "b", amount: 450 },
  ]);
  assert.equal(cart.total, 450);
});

test("[boundary-2] a bundle's free units are worth the unit price left by an earlier percent", () => {
  const cart = priceCart([line("sku-4", 1000, 4)], [bundle("bogo", 1, 1, 2), percent("half", 50, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "half", amount: 2000 },
    { promotionId: "bogo", amount: 1000 },
  ]);
  assert.equal(cart.lines[0].total, 1000);
  assert.equal(cart.total, 1000);
});

test("[boundary-2] a bundle's free units are worth the unit price left by an earlier fixed amount", () => {
  const cart = priceCart([line("sku-4", 1000, 4)], [bundle("bogo", 1, 1, 2), fixed("minus-200", 200, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "minus-200", amount: 800 },
    { promotionId: "bogo", amount: 1600 },
  ]);
  assert.equal(cart.lines[0].total, 1600);
  assert.equal(cart.total, 1600);
});

test("[boundary-3] a percentage amount below the half cent rounds down", () => {
  const cart = priceCart([line("sku-101", 101, 1)], [percent("p33", 33)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p33", amount: 33 }]);
  assert.equal(cart.lines[0].total, 68);
  assert.equal(cart.total, 68);
});

test("[boundary-3] a percentage amount of exactly half a cent rounds up", () => {
  const cart = priceCart([line("sku-150", 150, 1)], [percent("p15", 15)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p15", amount: 23 }]);
  assert.equal(cart.lines[0].total, 127);
  assert.equal(cart.total, 127);
});

test("[boundary-4] a fixed amount larger than the unit price takes off only the whole line", () => {
  const cart = priceCart([line("sku-300", 300, 2)], [fixed("big", 500)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "big", amount: 600 }]);
  assert.equal(cart.lines[0].total, 0);
  assert.equal(cart.total, 0);
});

test("[boundary-4] a promotion matching a line already at 0 is reported with 0 taken off", () => {
  const cart = priceCart([line("sku-300", 300, 2)], [percent("after", 10, 2), fixed("big", 500, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "big", amount: 600 },
    { promotionId: "after", amount: 0 },
  ]);
  assert.equal(cart.lines[0].total, 0);
  assert.equal(cart.total, 0);
});
