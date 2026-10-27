import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceCart,
  type AppliedPromotion,
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

function applied(promotions: AppliedPromotion[]): [string, number][] {
  return promotions.map((p) => [p.promotionId, p.amount]);
}

test("[boundary-5] the stack applies when it takes off more than the exclusive promotion", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [
      percent("pct-10", 1, 10),
      fixed("excl-fixed", 2, 100, { exclusive: true }),
      percent("pct-20", 3, 20),
    ],
  );
  assert.equal(cart.lines[0].total, 720);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct-10", 100],
    ["pct-20", 180],
  ]);
  assert.equal(cart.total, 720);
});

test("[boundary-5] an exclusive promotion taking off more than the stack applies alone on the full line total", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [
      percent("pct-10", 1, 10),
      fixed("excl-fixed", 2, 300, { exclusive: true }),
      percent("pct-20", 3, 20),
    ],
  );
  assert.equal(cart.lines[0].total, 700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 300]]);
  assert.equal(cart.total, 700);
});

test("[boundary-6] of two exclusive promotions, the one taking off more applies alone", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 2)],
    [
      percent("excl-pct", 1, 10, { exclusive: true }),
      fixed("excl-fixed", 2, 150, { exclusive: true }),
    ],
  );
  assert.equal(cart.lines[0].total, 1700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 300]]);
  assert.equal(cart.total, 1700);
});

test("[boundary-6] an exclusive promotion that loses on one line still applies to a line only it matches", () => {
  const cart = priceCart(
    [line("tagged", 1000, 2, ["a"]), line("untagged", 1000, 1)],
    [
      percent("excl-pct", 1, 10, { exclusive: true }),
      fixed("excl-fixed", 2, 150, { exclusive: true, tag: "a" }),
    ],
  );
  assert.equal(cart.lines[0].productId, "tagged");
  assert.equal(cart.lines[0].total, 1700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 300]]);
  assert.equal(cart.lines[1].productId, "untagged");
  assert.equal(cart.lines[1].total, 900);
  assert.deepEqual(applied(cart.lines[1].promotions), [["excl-pct", 100]]);
  assert.equal(cart.total, 2600);
});

test("[boundary-7] on a tie the stack wins when its first promotion comes before the exclusive", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-10", 1, 10), fixed("excl-fixed", 2, 100, { exclusive: true })],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-10", 100]]);
  assert.equal(cart.total, 900);
});

test("[boundary-7] on a tie the exclusive wins when it comes before the stack", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-10", 2, 10), fixed("excl-fixed", 1, 100, { exclusive: true })],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 100]]);
  assert.equal(cart.total, 900);
});

test("[boundary-8] promotions held to the line total tie, and the tie goes to the stack", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("fixed-400", 1, 400), fixed("excl-fixed-500", 2, 500, { exclusive: true })],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["fixed-400", 600]]);
  assert.equal(cart.total, 0);
});

test("[boundary-8] promotions held to the line total tie, and the tie goes to an exclusive that comes first", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("fixed-400", 2, 400), fixed("excl-fixed-500", 1, 500, { exclusive: true })],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed-500", 600]]);
  assert.equal(cart.total, 0);
});

test("[boundary-9] with no stack, the exclusive promotion taking off the most applies alone", () => {
  const cart = priceCart(
    [line("vip-pack", 1000, 1, ["vip"])],
    [
      percent("excl-pct", 1, 10, { exclusive: true, tag: "vip" }),
      fixed("excl-fixed", 2, 250, { exclusive: true, tag: "vip" }),
      percent("other-pct", 1, 50, { tag: "other" }),
    ],
  );
  assert.equal(cart.lines[0].total, 750);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 250]]);
  assert.equal(cart.total, 750);
});

test("[boundary-9] with no stack, an exclusive promotion is reported even when it takes off 0", () => {
  const cart = priceCart(
    [line("free-item", 0, 2)],
    [percent("excl-pct", 1, 10, { exclusive: true })],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-pct", 0]]);
  assert.equal(cart.total, 0);
});

test("[boundary-9] a line with quantity 0 reports no exclusive promotion", () => {
  const cart = priceCart(
    [line("empty-line", 1000, 0)],
    [percent("excl-pct", 1, 10, { exclusive: true })],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.total, 0);
});
