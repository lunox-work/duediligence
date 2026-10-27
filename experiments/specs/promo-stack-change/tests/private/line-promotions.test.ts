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

// Extends "[happy-1] a percentage comes off the line total": other values, and the
// rounding is on the line total, so 15% of 9093 is 1363.95, which is 1364.
test("[happy-1] a percentage of another size comes off a multi-unit line total", () => {
  const cart = priceCart([line("sku-a", 1299, 7)], [percent("pct-15", 1, 15)]);
  assert.equal(cart.lines[0].productId, "sku-a");
  assert.equal(cart.lines[0].total, 7729);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-15", 1364]]);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 7729);
});

// Extends "[happy-1] a percentage comes off the line total": an untagged promotion
// matches every line, tagged or not, and the cart total sums the lines.
test("[happy-1] a percentage with no tag comes off every line of the cart", () => {
  const cart = priceCart(
    [line("first", 1000, 3, ["credits"]), line("second", 2000, 1), line("third", 400, 5, ["x", "y"])],
    [percent("pct-10", 1, 10)],
  );
  assert.equal(cart.lines.length, 3);
  assert.deepEqual(
    cart.lines.map((l) => l.productId),
    ["first", "second", "third"],
  );
  assert.equal(cart.lines[0].total, 2700);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-10", 300]]);
  assert.equal(cart.lines[1].total, 1800);
  assert.deepEqual(applied(cart.lines[1].promotions), [["pct-10", 200]]);
  assert.equal(cart.lines[2].total, 1800);
  assert.deepEqual(applied(cart.lines[2].promotions), [["pct-10", 200]]);
  assert.equal(cart.total, 6300);
});

// Extends "[happy-1] a percentage comes off the line total": a tagged percent leaves
// lines without its tag alone.
test("[happy-1] a tagged percentage comes off only the lines carrying the tag", () => {
  const cart = priceCart(
    [line("plain", 1000, 2), line("sale-item", 1000, 2, ["sale"])],
    [percent("sale-30", 1, 30, { tag: "sale" })],
  );
  assert.equal(cart.lines[0].total, 2000);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].total, 1400);
  assert.deepEqual(applied(cart.lines[1].promotions), [["sale-30", 600]]);
  assert.equal(cart.total, 3400);
});

test("[happy-1] a line no promotion matches keeps its full total", () => {
  const cart = priceCart([line("lonely", 1234, 3)], [percent("pct-10", 1, 10, { tag: "elsewhere" })]);
  assert.equal(cart.lines[0].total, 3702);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.total, 3702);
});

// Extends "[happy-2] a fixed amount comes off each unit of a tagged line": more units,
// more lines, and the amount is per unit, not per line.
test("[happy-2] a fixed amount comes off each of many units on every tagged line", () => {
  const cart = priceCart(
    [
      line("pack-a", 1500, 10, ["credits"]),
      line("pack-b", 900, 3, ["bulk", "credits"]),
      line("pack-c", 700, 4, ["bulk"]),
    ],
    [fixed("fixed-250", 1, 250, { tag: "credits" })],
  );
  assert.equal(cart.lines[0].total, 12500);
  assert.deepEqual(applied(cart.lines[0].promotions), [["fixed-250", 2500]]);
  assert.equal(cart.lines[1].total, 1950);
  assert.deepEqual(applied(cart.lines[1].promotions), [["fixed-250", 750]]);
  assert.equal(cart.lines[2].total, 2800);
  assert.deepEqual(cart.lines[2].promotions, []);
  assert.equal(cart.total, 17250);
});

// Extends "[happy-2] a tagged promotion matches a line that carries its tag among several":
// a tag that merely contains the promotion's tag, or a line with no tags, does not match.
test("[happy-2] a tagged fixed promotion does not match a line whose tags only resemble its tag", () => {
  const cart = priceCart(
    [
      line("near-miss", 1500, 2, ["credits-extra", "mycredits"]),
      line("no-tags", 1500, 2),
      line("exact", 1500, 2, ["credits"]),
    ],
    [fixed("fixed-200", 1, 200, { tag: "credits" })],
  );
  assert.equal(cart.lines[0].total, 3000);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].total, 3000);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.equal(cart.lines[2].total, 2600);
  assert.deepEqual(applied(cart.lines[2].promotions), [["fixed-200", 400]]);
  assert.equal(cart.total, 8600);
});

test("[happy-2] a fixed promotion with no tag comes off each unit of every line", () => {
  const cart = priceCart(
    [line("a", 500, 3, ["t"]), line("b", 800, 2)],
    [fixed("fixed-50", 1, 50)],
  );
  assert.equal(cart.lines[0].total, 1350);
  assert.deepEqual(applied(cart.lines[0].promotions), [["fixed-50", 150]]);
  assert.equal(cart.lines[1].total, 1500);
  assert.deepEqual(applied(cart.lines[1].promotions), [["fixed-50", 100]]);
  assert.equal(cart.total, 2850);
});

// Extends "[happy-3] a bundle gives one free unit per full group": a free count above 1
// and a buy count above 2.
test("[happy-3] a bundle with buy 3 and free 2 frees 2 units per full group of 5", () => {
  const cart = priceCart([line("sku-1", 400, 12)], [bundle("buy3get2", 1, 3, 2)]);
  // 2 full groups of 5, so 4 free units; the 2 left over pay in full.
  assert.equal(cart.lines[0].total, 3200);
  assert.deepEqual(applied(cart.lines[0].promotions), [["buy3get2", 1600]]);
  assert.equal(cart.total, 3200);
});

// Extends "[happy-3] leftover units short of a full group pay in full": a leftover
// longer than the free count but short of a group.
test("[happy-3] leftover units beyond the buy count but short of a full group pay in full", () => {
  const cart = priceCart([line("sku-1", 100, 14)], [bundle("buy4get1", 1, 4, 1)]);
  // 2 full groups of 5, 4 left over: 2 free units.
  assert.equal(cart.lines[0].total, 1200);
  assert.deepEqual(applied(cart.lines[0].promotions), [["buy4get1", 200]]);
});

test("[happy-3] a bundle over many units frees one unit per full group", () => {
  const cart = priceCart([line("sku-1", 250, 100)], [bundle("buy1get1", 1, 1, 1)]);
  assert.equal(cart.lines[0].total, 12500);
  assert.deepEqual(applied(cart.lines[0].promotions), [["buy1get1", 12500]]);
});

test("[happy-3] a quantity exactly a whole number of groups leaves no unit paying in full", () => {
  const cart = priceCart([line("sku-1", 300, 9)], [bundle("buy2get1", 1, 2, 1)]);
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(applied(cart.lines[0].promotions), [["buy2get1", 900]]);
});

test("[happy-3] a quantity short of one full group gets no unit free", () => {
  const cart = priceCart([line("sku-1", 500, 2)], [bundle("buy2get1", 1, 2, 1)]);
  assert.equal(cart.lines[0].total, 1000);
  assert.equal(cart.total, 1000);
});

// Extends "[boundary-1] line promotions apply in priority order": priorities compare as
// numbers (2 before 10), and the input order does not matter.
test("[boundary-1] priorities order numerically, not by input position or as text", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 2)],
    [percent("pct-25", 10, 25), fixed("fixed-100", 2, 100)],
  );
  // fixed first: 2000 - 200 = 1800; then 25% of 1800 = 450.
  assert.equal(cart.lines[0].total, 1350);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["fixed-100", 200],
    ["pct-25", 450],
  ]);
  assert.equal(cart.total, 1350);
});

// Extends "[boundary-1] line promotions apply in priority order": three promotions of
// three kinds, given in reverse order.
test("[boundary-1] three line promotions of different kinds apply in priority order, each on what the last left", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 6)],
    [bundle("bundle", 3, 2, 1), fixed("fixed", 2, 100), percent("pct", 1, 50)],
  );
  // pct: 6000 -> 3000 (500 per unit); fixed: 600 off -> 2400 (400 per unit);
  // bundle: 2 free units at 400 -> 800 off -> 1600.
  assert.equal(cart.lines[0].total, 1600);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct", 3000],
    ["fixed", 600],
    ["bundle", 800],
  ]);
});

// Extends "[boundary-1] with equal priorities the promotion whose id sorts first applies
// first": three at one priority, given out of id order, among another priority.
test("[boundary-1] equal priorities order by id among several promotions", () => {
  const cart = priceCart(
    [line("sku-1", 2000, 1)],
    [percent("charlie", 1, 50), fixed("alpha", 1, 100), percent("bravo", 1, 10), fixed("zulu", 0, 300)],
  );
  // zulu: 2000 -> 1700; alpha: -> 1600; bravo: 160 -> 1440; charlie: 720 -> 720.
  assert.equal(cart.lines[0].total, 720);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["zulu", 300],
    ["alpha", 100],
    ["bravo", 160],
    ["charlie", 720],
  ]);
});

test("[boundary-1] a percent after a fixed amount is computed on what the fixed left", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("a", 2, 50), fixed("b", 1, 100)],
  );
  assert.equal(cart.lines[0].total, 450);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["b", 100],
    ["a", 450],
  ]);
});

test("[boundary-1] the order of promotions on one line does not depend on other lines", () => {
  const cart = priceCart(
    [line("tagged", 1000, 1, ["t"]), line("plain", 1000, 1)],
    [percent("pct", 1, 50), fixed("fixed-t", 2, 100, { tag: "t" })],
  );
  assert.equal(cart.lines[0].total, 400);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct", 500],
    ["fixed-t", 100],
  ]);
  assert.equal(cart.lines[1].total, 500);
  assert.deepEqual(applied(cart.lines[1].promotions), [["pct", 500]]);
  assert.equal(cart.total, 900);
});

// Extends "[boundary-2] a bundle's free units are worth the unit price left by a percent":
// other values, more units, and a larger free count.
test("[boundary-2] a bundle after a percent frees units at the reduced unit price", () => {
  const cart = priceCart(
    [line("sku-1", 800, 10)],
    [percent("pct-25", 1, 25), bundle("buy3get2", 2, 3, 2)],
  );
  // 8000 -> 6000 (600 per unit); 2 groups of 5, 4 free units: 2400 off.
  assert.equal(cart.lines[0].total, 3600);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct-25", 2000],
    ["buy3get2", 2400],
  ]);
});

// Extends "[boundary-2] a bundle's free units are worth the unit price left by a percent":
// a promotion after the bundle sees the bundle's result.
test("[boundary-2] a promotion after a bundle is computed on what the bundle left", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 4)],
    [percent("pct-10", 3, 10), bundle("buy1get1", 1, 1, 1), fixed("fixed-50", 2, 50)],
  );
  // bundle at 1000 per unit: 2000 off -> 2000; fixed: 200 off -> 1800; pct: 180 -> 1620.
  assert.equal(cart.lines[0].total, 1620);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["buy1get1", 2000],
    ["fixed-50", 200],
    ["pct-10", 180],
  ]);
});

// Extends "[boundary-2] a bundle's free units are worth the unit price left by a fixed amount".
test("[boundary-2] a bundle after two reductions uses the unit price both left", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 6)],
    [fixed("fixed-200", 1, 200), percent("pct-50", 2, 50), bundle("buy2get1", 3, 2, 1)],
  );
  // 6000 -> 4800 -> 2400 (400 per unit); 2 free units: 800 off.
  assert.equal(cart.lines[0].total, 1600);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["fixed-200", 1200],
    ["pct-50", 2400],
    ["buy2get1", 800],
  ]);
});

test("[boundary-2] a second bundle uses the unit price the first bundle left", () => {
  const cart = priceCart(
    [line("sku-1", 900, 6)],
    [bundle("first", 1, 2, 1), bundle("second", 2, 1, 1)],
  );
  // first: 2 free at 900 -> 3600 (600 per unit); second: 3 free at 600 -> 1800.
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["first", 1800],
    ["second", 1800],
  ]);
});

// Extends "[boundary-3] an amount below the half cent is rounded down": the percentage
// is taken of the line total, not of each unit.
test("[boundary-3] the rounding is of the line's amount, not of each unit's", () => {
  const cart = priceCart([line("sku-1", 101, 3)], [percent("pct-33", 1, 33)]);
  // 33% of 303 is 99.99, which rounds to 100 (per unit it would be 3 x 33 = 99).
  assert.equal(cart.lines[0].total, 203);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-33", 100]]);
});

// Extends "[boundary-3] an amount of exactly half a cent is rounded up": halves round up
// even where the integer below is even.
test("[boundary-3] exact halves round up whether the cent below is even or odd", () => {
  const cart = priceCart(
    [line("even-below", 250, 1), line("odd-below", 50, 1), line("odd-below-2", 350, 1)],
    [percent("pct-1", 1, 1)],
  );
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-1", 3]]);
  assert.equal(cart.lines[0].total, 247);
  assert.deepEqual(applied(cart.lines[1].promotions), [["pct-1", 1]]);
  assert.equal(cart.lines[1].total, 49);
  assert.deepEqual(applied(cart.lines[2].promotions), [["pct-1", 4]]);
  assert.equal(cart.lines[2].total, 346);
  assert.equal(cart.total, 642);
});

// Extends "[boundary-3] an amount of exactly half a cent is rounded up": halves that a
// naive total * (percent / 100) computes as just below the half.
test("[boundary-3] exact halves round up where floating point would land just below them", () => {
  const a = priceCart([line("a", 25, 1)], [percent("pct-58", 1, 58)]);
  // 58% of 25 is 14.5.
  assert.deepEqual(applied(a.lines[0].promotions), [["pct-58", 15]]);
  assert.equal(a.lines[0].total, 10);
  const b = priceCart([line("b", 150, 1)], [percent("pct-57", 1, 57)]);
  // 57% of 150 is 85.5.
  assert.deepEqual(applied(b.lines[0].promotions), [["pct-57", 86]]);
  assert.equal(b.lines[0].total, 64);
  const c = priceCart([line("c", 90, 1)], [percent("pct-35", 1, 35)]);
  // 35% of 90 is 31.5.
  assert.deepEqual(applied(c.lines[0].promotions), [["pct-35", 32]]);
  assert.equal(c.lines[0].total, 58);
});

test("[boundary-3] each percent in a stack rounds on the total the one before it left", () => {
  const cart = priceCart(
    [line("sku-1", 155, 1)],
    [percent("pct-10", 1, 10), percent("pct-50", 2, 50)],
  );
  // 15.5 -> 16, leaving 139; 69.5 -> 70, leaving 69.
  assert.equal(cart.lines[0].total, 69);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct-10", 16],
    ["pct-50", 70],
  ]);
});

test("[boundary-3] an amount just above the half cent rounds up and just below rounds down", () => {
  const up = priceCart([line("sku-1", 1001, 1)], [percent("pct-5", 1, 5)]);
  // 50.05 -> 50.
  assert.deepEqual(applied(up.lines[0].promotions), [["pct-5", 50]]);
  assert.equal(up.lines[0].total, 951);
  const down = priceCart([line("sku-1", 1019, 1)], [percent("pct-5", 1, 5)]);
  // 50.95 -> 51.
  assert.deepEqual(applied(down.lines[0].promotions), [["pct-5", 51]]);
  assert.equal(down.lines[0].total, 968);
});

// Extends "[boundary-4] a fixed amount larger than the unit price takes off only the whole
// line": the cap is reached partway through a stack.
test("[boundary-4] a fixed amount larger than what earlier promotions left takes off only the rest", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 3)],
    [percent("pct-80", 1, 80), fixed("fixed-300", 2, 300)],
  );
  // 3000 -> 600; fixed would be 900 but only 600 is left.
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["pct-80", 2400],
    ["fixed-300", 600],
  ]);
  assert.equal(cart.total, 0);
});

// Extends "[boundary-4] a promotion matching a line already at 0 is reported with 0 taken
// off": several kinds after the line reaches 0, and other lines unaffected.
test("[boundary-4] every promotion matching a line already at 0 is reported with 0 taken off", () => {
  const zeroed = priceCart(
    [line("sku-1", 300, 4)],
    [fixed("f", 1, 500), bundle("b", 2, 1, 1), fixed("g", 3, 10), percent("p", 4, 10)],
  );
  assert.equal(zeroed.lines[0].total, 0);
  assert.deepEqual(applied(zeroed.lines[0].promotions), [
    ["f", 1200],
    ["b", 0],
    ["g", 0],
    ["p", 0],
  ]);
  assert.equal(zeroed.total, 0);
});

test("[boundary-4] a line priced at 0 reports a matching promotion with 0 taken off", () => {
  const cart = priceCart(
    [line("free-item", 0, 3), line("paid", 100, 1, ["paid"])],
    [percent("pct-10", 1, 10)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [["pct-10", 0]]);
  assert.equal(cart.lines[1].total, 90);
  assert.deepEqual(applied(cart.lines[1].promotions), [["pct-10", 10]]);
  assert.equal(cart.total, 90);
});

test("[boundary-4] two fixed amounts that together exceed the line stop at 0", () => {
  const cart = priceCart(
    [line("sku-1", 300, 2)],
    [fixed("f1", 1, 200), fixed("f2", 2, 200)],
  );
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(applied(cart.lines[0].promotions), [
    ["f1", 400],
    ["f2", 200],
  ]);
  assert.equal(cart.total, 0);
});
