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

const EX = { exclusive: true };

// Extends "[boundary-5] the stack applies when it takes off more than the exclusive
// promotion": the exclusive comes first in order, and still the whole stack takes part.
test("[boundary-5] an exclusive first in order loses to the whole stack that follows it", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [fixed("excl-fixed", 1, 200, EX), percent("pct-10", 2, 10), percent("pct-20", 3, 20)],
  );
  assert.equal(cart.lines[0].total, 720);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct-10", 100],
    ["pct-20", 180],
  ]);
  assert.equal(cart.total, 720);
});

// Extends "[boundary-5] an exclusive promotion taking off more than the stack applies alone":
// the exclusive comes first in order.
test("[boundary-5] an exclusive first in order beats a smaller stack and applies alone", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-20", 3, 20), percent("pct-10", 2, 10), fixed("excl-fixed", 1, 300, EX)],
  );
  assert.equal(cart.lines[0].total, 700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 300]]);
  assert.equal(cart.total, 700);
});

// Extends "[boundary-5] an exclusive promotion taking off more than the stack applies alone
// on the full line total": an exclusive percent last in order, which would lose if
// computed on what the stack left (30% of 720 is 216).
test("[boundary-5] an exclusive percent last in order is computed on the line's full total", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-10", 1, 10), percent("pct-20", 2, 20), percent("excl-pct", 9, 30, EX)],
  );
  assert.equal(cart.lines[0].total, 700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-pct", 300]]);
  assert.equal(cart.total, 700);
});

test("[boundary-5] an exclusive beats a stack by its amount on the full total, not on what the stack left", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-50", 1, 50), percent("excl-pct-60", 2, 60, EX)],
  );
  assert.equal(cart.lines[0].total, 400);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-pct-60", 600]]);
  assert.equal(cart.total, 400);
});

test("[boundary-5] the same promotions can go to the stack on one line and to the exclusive on another", () => {
  const cart = priceCart(
    [line("big", 1000, 1), line("small", 100, 4)],
    [percent("pct-20", 1, 20), fixed("excl-fixed", 2, 150, EX)],
  );
  // big: stack 200 vs exclusive 150. small: stack 80 vs exclusive 400 (held to the line).
  assert.equal(cart.lines[0].total, 800);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-20", 200]]);
  assert.equal(cart.lines[1].total, 0);
  assert.deepEqual(applied(cart.lines[1].promotions), [["excl-fixed", 400]]);
  assert.equal(cart.total, 800);
});

test("[boundary-5] a stack with a bundle is compared with the exclusive as a whole", () => {
  const cart = priceCart(
    [line("sku-1", 500, 6)],
    [bundle("buy2get1", 1, 2, 1), percent("pct-10", 2, 10), percent("excl-pct-35", 3, 35, EX)],
  );
  // stack: 1000 then 200, 1200 in all; exclusive 35% of 3000 is 1050.
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["buy2get1", 1000],
    ["pct-10", 200],
  ]);
});

// Extends "[boundary-6] of two exclusive promotions, the one taking off more applies alone":
// the scenario's tie, where both take 200 off and the earlier in order applies.
test("[boundary-6] two exclusives that take off the same amount: the earlier in order applies alone", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 2)],
    [fixed("excl-fixed", 2, 100, EX), percent("excl-pct", 1, 10, EX)],
  );
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-pct", 200]]);
  assert.equal(cart.total, 1800);
});

test("[boundary-6] two exclusives tying on amount and priority: the id that sorts first applies", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 2)],
    [fixed("beta", 1, 100, EX), percent("alpha", 1, 10, EX)],
  );
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(applied(cart.lines[0].promotions), [["alpha", 200]]);
});

// Extends "[boundary-6] of two exclusive promotions, the one taking off more applies alone":
// the order the exclusives come in does not decide, the amount does.
test("[boundary-6] of three exclusives, the largest applies alone wherever it comes in order", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("excl-a", 1, 10, EX), percent("excl-b", 2, 20, EX), fixed("excl-c", 3, 250, EX), percent("pct-5", 4, 5)],
  );
  assert.equal(cart.lines[0].total, 750);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-c", 250]]);
});

test("[boundary-6] exclusives are not summed: two exclusives that each take off less than the stack lose", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 2)],
    [percent("excl-pct", 1, 10, EX), fixed("excl-fixed", 2, 100, EX), percent("pct-15", 3, 15)],
  );
  // stack 300; each exclusive 200 (400 together, but they never combine).
  assert.equal(cart.lines[0].total, 1700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-15", 300]]);
});

test("[boundary-6] a winning exclusive is not added to the stack", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("pct-10", 1, 10), fixed("excl-fixed", 2, 150, EX)],
  );
  assert.equal(cart.lines[0].total, 850);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-fixed", 150]]);
});

// Extends "[boundary-6] an exclusive promotion that loses on one line still applies to a
// line only it matches": here it loses to a stack, not to another exclusive.
test("[boundary-6] an exclusive that loses to a stack on one line applies on a line only it matches", () => {
  const cart = priceCart(
    [line("tagged", 1000, 1, ["a"]), line("untagged", 1000, 1)],
    [percent("pct-50", 1, 50, { tag: "a" }), fixed("excl-fixed", 2, 100, EX)],
  );
  assert.equal(cart.lines[0].total, 500);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-50", 500]]);
  assert.equal(cart.lines[1].total, 900);
  assert.deepEqual(applied(cart.lines[1].promotions), [["excl-fixed", 100]]);
  assert.equal(cart.total, 1400);
});

// Extends "[boundary-7] on a tie the stack wins when its first promotion comes before the
// exclusive": equal priorities, so the id decides.
test("[boundary-7] on a tie at equal priority the exclusive wins when its id sorts first", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("m-pct", 1, 10), fixed("a-excl", 1, 100, EX)],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["a-excl", 100]]);
});

test("[boundary-7] on a tie at equal priority the stack wins when its first promotion's id sorts first", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [fixed("z-excl", 1, 100, EX), percent("m-pct", 1, 10)],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["m-pct", 100]]);
});

// Extends "[boundary-7] on a tie the stack wins when its first promotion comes before the
// exclusive": a stack of two whose second promotion comes after the exclusive.
test("[boundary-7] the stack's place on a tie is that of its first promotion, not its last", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [fixed("s2", 5, 50), fixed("excl", 3, 100, EX), fixed("s1", 1, 50)],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["s1", 50],
    ["s2", 50],
  ]);
});

// Extends "[boundary-7] on a tie the exclusive wins when it comes before the stack".
test("[boundary-7] on a tie an exclusive before every stack promotion wins", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [fixed("s1", 4, 50), fixed("s2", 6, 50), fixed("excl", 3, 100, EX)],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl", 100]]);
});

test("[boundary-7] the stack's first promotion is found by priority then id", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [fixed("d", 7, 50), fixed("c", 2, 100, EX), fixed("b", 2, 50)],
  );
  // the stack's first promotion is "b" at priority 2, which sorts before "c".
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["b", 50],
    ["d", 50],
  ]);
});

test("[boundary-7] a three-way tie goes to whichever of the stack and the exclusives comes first", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("stack-pct", 3, 10), fixed("excl-late", 4, 100, EX), fixed("excl-early", 2, 100, EX)],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-early", 100]]);
});

// Extends "[boundary-8] promotions held to the line total tie": two exclusives held to the
// line, where the larger nominal amount comes later in order.
test("[boundary-8] two exclusives held to the line total tie, and the earlier in order applies", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("excl-big", 2, 1000, EX), fixed("excl-small", 1, 500, EX)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-small", 600]]);
});

// Extends "[boundary-8] promotions held to the line total tie, and the tie goes to an
// exclusive that comes first": the stack is held to the line as a whole, so 400 + 400
// counts as 600, not 800.
test("[boundary-8] a stack held to the line total ties with an exclusive that comes first", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("f1", 1, 200), fixed("f2", 2, 200), fixed("excl-350", 0, 350, EX)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-350", 600]]);
  assert.equal(cart.total, 0);
});

test("[boundary-8] a stack held to the line total ties with a later exclusive and applies", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("f1", 1, 200), fixed("f2", 2, 200), fixed("excl-350", 3, 350, EX)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["f1", 400],
    ["f2", 200],
  ]);
});

test("[boundary-8] an exclusive held to the line total loses to a stack taking off the whole line first in order", () => {
  const cart = priceCart(
    [line("sku-1", 250, 4)],
    [percent("pct-100", 1, 100), fixed("excl-fixed", 2, 5000, EX)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-100", 1000]]);
});

// Extends "[boundary-9] with no stack, the exclusive promotion taking off the most applies
// alone": three kinds, the largest a bundle that comes neither first nor last.
test("[boundary-9] with no stack, the largest of three exclusives of different kinds applies", () => {
  const cart = priceCart(
    [line("sku-1", 500, 4)],
    [percent("excl-pct", 3, 30, EX), fixed("excl-fixed", 1, 100, EX), bundle("excl-bundle", 2, 1, 1, EX)],
  );
  // percent 600, fixed 400, bundle 1000.
  assert.equal(cart.lines[0].total, 1000);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-bundle", 1000]]);
  assert.equal(cart.total, 1000);
});

test("[boundary-9] with no stack, a tie between exclusives goes to the lower priority number", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("a-pct", 2, 10, EX), fixed("z-fixed", 1, 100, EX)],
  );
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(applied(cart.lines[0].promotions), [["z-fixed", 100]]);
});

// Extends "[boundary-9] with no stack, an exclusive promotion is reported even when it takes
// off 0": two exclusives both taking 0, so the earlier in order is reported.
test("[boundary-9] on a zero-priced line, the earliest of several exclusives is reported with 0", () => {
  const cart = priceCart(
    [line("free-item", 0, 5)],
    [fixed("excl-a", 2, 100, EX), percent("excl-b", 1, 50, EX)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["excl-b", 0]]);
  assert.equal(cart.total, 0);
});

// Extends "[boundary-9] a line with quantity 0 reports no exclusive promotion": with
// non-exclusive and exclusive promotions together, and other lines priced as usual.
test("[boundary-9] a line with quantity 0 reports no promotion of any kind while other lines do", () => {
  const cart = priceCart(
    [line("empty-line", 1000, 0), line("full-line", 1000, 1, ["vip"])],
    [percent("pct-10", 1, 10), fixed("excl-fixed", 2, 300, EX), bundle("bundle", 3, 1, 1)],
  );
  assert.equal(cart.lines[0].productId, "empty-line");
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].total, 700);
  assert.deepEqual(applied(cart.lines[1].promotions), [["excl-fixed", 300]]);
  assert.equal(cart.total, 700);
});

test("[boundary-9] an exclusive applies on a line no non-exclusive promotion matches, while the stack applies elsewhere", () => {
  const cart = priceCart(
    [line("stacked", 2000, 1, ["sale"]), line("exclusive-only", 2000, 1, ["vip"])],
    [percent("sale-50", 1, 50, { tag: "sale" }), percent("vip-5", 2, 5, { exclusive: true, tag: "vip" })],
  );
  assert.equal(cart.lines[0].total, 1000);
  assert.deepEqual(applied(cart.lines[0].promotions), [["sale-50", 1000]]);
  assert.equal(cart.lines[1].total, 1900);
  assert.deepEqual(applied(cart.lines[1].promotions), [["vip-5", 100]]);
  assert.equal(cart.total, 2900);
});
