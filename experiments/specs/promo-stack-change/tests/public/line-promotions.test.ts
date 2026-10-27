import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceCart,
  type AppliedPromotion,
  type BundlePromotion,
  type CartLine,
  type FixedPromotion,
  type PercentPromotion,
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

function applied(promotions: AppliedPromotion[]): [string, number][] {
  return promotions.map((p) => [p.promotionId, p.amount]);
}

test("[happy-1] a percentage comes off the line total", () => {
  const cart = priceCart([line("sku-1", 1000, 3)], [percent("pct-10", 1, 10)]);
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].productId, "sku-1");
  assert.equal(cart.lines[0].total, 2700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-10", 300]]);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 2700);
});

test("[happy-1] a percentage of 100 takes off the whole line total", () => {
  const cart = priceCart([line("sku-1", 1000, 3)], [percent("pct-100", 1, 100)]);
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-100", 3000]]);
  assert.equal(cart.total, 0);
});

test("[happy-2] a fixed amount comes off each unit of a tagged line, and an untagged line is untouched", () => {
  const cart = priceCart(
    [line("credits-pack", 1500, 2, ["credits"]), line("other-item", 800, 1, ["other"])],
    [fixed("fixed-200", 1, 200, { tag: "credits" })],
  );
  assert.equal(cart.lines.length, 2);
  assert.equal(cart.lines[0].productId, "credits-pack");
  assert.equal(cart.lines[0].total, 2600);
  assert.deepEqual(applied(cart.lines[0].promotions), [["fixed-200", 400]]);
  assert.equal(cart.lines[1].productId, "other-item");
  assert.equal(cart.lines[1].total, 800);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.equal(cart.total, 3400);
});

test("[happy-2] a tagged promotion matches a line that carries its tag among several", () => {
  const cart = priceCart(
    [line("credits-pack", 1500, 2, ["sale", "credits", "bulk"])],
    [fixed("fixed-200", 1, 200, { tag: "credits" })],
  );
  assert.equal(cart.lines[0].total, 2600);
  assert.deepEqual(applied(cart.lines[0].promotions), [["fixed-200", 400]]);
});

test("[happy-3] a bundle gives one free unit per full group, and the leftover unit pays in full", () => {
  const cart = priceCart([line("sku-1", 500, 7)], [bundle("buy2get1", 1, 2, 1)]);
  assert.equal(cart.lines[0].total, 2500);
  assert.deepEqual(applied(cart.lines[0].promotions), [["buy2get1", 1000]]);
  assert.equal(cart.total, 2500);
});

test("[happy-3] leftover units short of a full group pay in full", () => {
  const cart = priceCart([line("sku-1", 500, 8)], [bundle("buy2get1", 1, 2, 1)]);
  assert.equal(cart.lines[0].total, 3000);
  assert.deepEqual(applied(cart.lines[0].promotions), [["buy2get1", 1000]]);
});

test("[boundary-1] line promotions apply in priority order, each on what the previous left", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [fixed("b", 2, 100), percent("a", 1, 50)],
  );
  assert.equal(cart.lines[0].total, 400);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["a", 500],
    ["b", 100],
  ]);
  assert.equal(cart.total, 400);
});

test("[boundary-1] with equal priorities the promotion whose id sorts first applies first", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("b", 1, 50), fixed("a", 1, 100)],
  );
  assert.equal(cart.lines[0].total, 450);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["a", 100],
    ["b", 450],
  ]);
});

test("[boundary-2] a bundle's free units are worth the unit price left by a percent", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 4)],
    [bundle("bundle", 2, 1, 1), percent("half", 1, 50)],
  );
  assert.equal(cart.lines[0].total, 1000);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["half", 2000],
    ["bundle", 1000],
  ]);
});

test("[boundary-2] a bundle's free units are worth the unit price left by a fixed amount", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 3)],
    [fixed("fixed-400", 1, 400), bundle("buy2get1", 2, 2, 1)],
  );
  assert.equal(cart.lines[0].total, 1200);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["fixed-400", 1200],
    ["buy2get1", 600],
  ]);
});

test("[boundary-3] an amount below the half cent is rounded down", () => {
  const cart = priceCart([line("sku-1", 101, 1)], [percent("pct-33", 1, 33)]);
  assert.equal(cart.lines[0].total, 68);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-33", 33]]);
});

test("[boundary-3] an amount of exactly half a cent is rounded up", () => {
  const cart = priceCart([line("sku-1", 150, 1)], [percent("pct-15", 1, 15)]);
  assert.equal(cart.lines[0].total, 127);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-15", 23]]);
});

test("[boundary-4] a fixed amount larger than the unit price takes off only the whole line", () => {
  const cart = priceCart([line("sku-1", 300, 2)], [fixed("fixed-500", 1, 500)]);
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["fixed-500", 600]]);
  assert.equal(cart.total, 0);
});

test("[boundary-4] a promotion matching a line already at 0 is reported with 0 taken off", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("f", 1, 500), percent("p", 2, 10)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["f", 600],
    ["p", 0],
  ]);
  assert.equal(cart.total, 0);
});
