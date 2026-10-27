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

// Extends public "[happy-1] a percentage comes off the line total": other values, more lines, lines with and without tags.
test("[happy-1] an untagged percentage comes off every line, tagged or not, each on its own total", () => {
  const cart = priceCart(
    [line("bulk", 2000, 5), line("tagged", 1200, 2, ["credits"]), line("single", 400, 1, ["misc", "other"])],
    [percent("quarter-off", 25)],
  );

  assert.equal(cart.lines.length, 3);
  assert.deepEqual(
    cart.lines.map((l) => l.productId),
    ["bulk", "tagged", "single"],
  );
  assert.equal(cart.lines[0].total, 7500);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "quarter-off", amount: 2500 }]);
  assert.equal(cart.lines[1].total, 1800);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "quarter-off", amount: 600 }]);
  assert.equal(cart.lines[2].total, 300);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "quarter-off", amount: 100 }]);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 9600);
});

// Extends public "[happy-1] a percentage comes off the line total": a tagged percentage only touches tagged lines.
test("[happy-1] a tagged percentage comes off only the lines carrying the tag", () => {
  const cart = priceCart(
    [line("plain", 1000, 4), line("sale-a", 800, 3, ["sale"]), line("sale-b", 250, 4, ["new", "sale"])],
    [percent("sale-20", 20, 1, "sale")],
  );

  assert.equal(cart.lines[0].total, 4000);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].total, 1920);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "sale-20", amount: 480 }]);
  assert.equal(cart.lines[2].total, 800);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "sale-20", amount: 200 }]);
  assert.equal(cart.total, 6720);
});

// Extends public "[happy-2] a fixed amount comes off each unit...": larger quantity, more lines.
test("[happy-2] a fixed amount comes off every unit of each tagged line, and untagged lines are untouched", () => {
  const cart = priceCart(
    [
      line("credits-10", 1500, 10, ["credits"]),
      line("seats", 900, 3, ["seats"]),
      line("credits-1", 700, 1, ["bulk", "credits"]),
      line("untagged", 500, 2),
    ],
    [fixed("credit-250", 250, 1, "credits")],
  );

  assert.equal(cart.lines[0].total, 12500);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "credit-250", amount: 2500 }]);
  assert.equal(cart.lines[1].total, 2700);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.equal(cart.lines[2].total, 450);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "credit-250", amount: 250 }]);
  assert.equal(cart.lines[3].total, 1000);
  assert.deepEqual(cart.lines[3].promotions, []);
  assert.equal(cart.total, 16650);
});

// Extends public "[happy-2] a tag matches a line carrying it...": a fixed promotion without a tag matches every line.
test("[happy-2] a fixed amount without a tag comes off each unit of every line", () => {
  const cart = priceCart(
    [line("no-tags", 1000, 3), line("with-tags", 600, 5, ["credits"])],
    [fixed("minus-100", 100)],
  );

  assert.equal(cart.lines[0].total, 2700);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "minus-100", amount: 300 }]);
  assert.equal(cart.lines[1].total, 2500);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "minus-100", amount: 500 }]);
  assert.equal(cart.total, 5200);
});

// Extends public "[happy-2] ...an untagged line is untouched": several tagged promotions, each only on its own tag.
test("[happy-2] promotions for different tags each touch only the lines carrying their tag", () => {
  const cart = priceCart(
    [line("a-only", 1000, 2, ["a"]), line("b-only", 1000, 2, ["b"]), line("neither", 1000, 2, ["c"])],
    [fixed("for-a", 100, 1, "a"), fixed("for-b", 300, 1, "b")],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "for-a", amount: 200 }]);
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "for-b", amount: 600 }]);
  assert.equal(cart.lines[1].total, 1400);
  assert.deepEqual(cart.lines[2].promotions, []);
  assert.equal(cart.lines[2].total, 2000);
  assert.equal(cart.total, 5200);
});

// Extends public "[happy-3] a bundle gives one free unit per full group...": more than one free unit per group.
test("[happy-3] a bundle with buy 3 and free 2 frees 2 units per full group of 5 and the leftover pays", () => {
  const cart = priceCart([line("sku-12", 250, 12)], [bundle("b3f2", 3, 2)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "b3f2", amount: 1000 }]);
  assert.equal(cart.lines[0].total, 2000);
  assert.equal(cart.total, 2000);
});

// Extends public "[happy-3] a bundle frees a unit for exactly one full group...": exact multiples and other group sizes.
test("[happy-3] a bundle frees units for every full group across lines of different sizes", () => {
  const cart = priceCart(
    [line("nine", 400, 9, ["x"]), line("five", 300, 5, ["y"]), line("ten", 100, 10, ["z"])],
    [bundle("b2f1", 2, 1, 1, "x"), bundle("b1f1", 1, 1, 1, "y"), bundle("b4f1", 4, 1, 1, "z")],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "b2f1", amount: 1200 }]);
  assert.equal(cart.lines[0].total, 2400);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "b1f1", amount: 600 }]);
  assert.equal(cart.lines[1].total, 900);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "b4f1", amount: 200 }]);
  assert.equal(cart.lines[2].total, 800);
  assert.equal(cart.total, 4100);
});

// Extends public "[boundary-1] line promotions apply by ascending priority...": priorities compared as numbers, not text.
test("[boundary-1] priorities 2, 9 and 10 apply in numeric order", () => {
  const cart = priceCart(
    [line("sku-1", 2000, 1)],
    [fixed("p10", 100, 10), percent("p9", 50, 9), percent("p2", 10, 2)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "p2", amount: 200 },
    { promotionId: "p9", amount: 900 },
    { promotionId: "p10", amount: 100 },
  ]);
  assert.equal(cart.lines[0].total, 800);
  assert.equal(cart.total, 800);
});

// Extends public "[boundary-1] with equal priorities the promotion whose id sorts first applies first": more promotions, mixed ties.
test("[boundary-1] four promotions order by priority, ties broken by id, whatever the input order", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("beta", 10, 1), fixed("alphabet", 50, 1), percent("alpha", 50, 1), fixed("zed", 10, 0)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "zed", amount: 10 },
    { promotionId: "alpha", amount: 495 },
    { promotionId: "alphabet", amount: 50 },
    { promotionId: "beta", amount: 45 },
  ]);
  assert.equal(cart.lines[0].total, 400);
  assert.equal(cart.total, 400);
});

// Extends public "[boundary-1] line promotions apply by ascending priority...": the order holds on each line separately.
test("[boundary-1] each line applies the promotions matching it in priority order on its own total", () => {
  const cart = priceCart(
    [line("x-line", 1000, 2, ["x"]), line("y-line", 1000, 2, ["y"])],
    [percent("all-half", 50, 2), fixed("x-200", 200, 1, "x"), fixed("y-200", 200, 3, "y")],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "x-200", amount: 400 },
    { promotionId: "all-half", amount: 800 },
  ]);
  assert.equal(cart.lines[0].total, 800);
  assert.deepEqual(cart.lines[1].promotions, [
    { promotionId: "all-half", amount: 1000 },
    { promotionId: "y-200", amount: 400 },
  ]);
  assert.equal(cart.lines[1].total, 600);
  assert.equal(cart.total, 1400);
});

// Extends public "[boundary-2] a bundle's free units are worth the unit price left by an earlier percent": other sizes.
test("[boundary-2] a bundle after a 25 percent promotion frees units at three quarters of the price", () => {
  const cart = priceCart([line("sku-6", 1000, 6)], [bundle("b2f1", 2, 1, 2), percent("quarter", 25, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "quarter", amount: 1500 },
    { promotionId: "b2f1", amount: 1500 },
  ]);
  assert.equal(cart.lines[0].total, 3000);
  assert.equal(cart.total, 3000);
});

// Extends public "[boundary-2] ...left by an earlier fixed amount": a fixed and a percent both before the bundle.
test("[boundary-2] a bundle after a fixed and a percent frees units at the price both left", () => {
  const cart = priceCart(
    [line("sku-3", 1200, 3)],
    [bundle("b2f1", 2, 1, 3), percent("ten", 10, 2), fixed("minus-200", 200, 1)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "minus-200", amount: 600 },
    { promotionId: "ten", amount: 300 },
    { promotionId: "b2f1", amount: 900 },
  ]);
  assert.equal(cart.lines[0].total, 1800);
  assert.equal(cart.total, 1800);
});

// Extends public "[boundary-2] ...left by an earlier percent": the bundle first, then the percent on what it left.
test("[boundary-2] a bundle before a percent frees units at the full price, and the percent takes from the rest", () => {
  const cart = priceCart([line("sku-4", 1000, 4)], [percent("half", 50, 2), bundle("bogo", 1, 1, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "bogo", amount: 2000 },
    { promotionId: "half", amount: 1000 },
  ]);
  assert.equal(cart.lines[0].total, 1000);
  assert.equal(cart.total, 1000);
});

// Extends public "[boundary-2] ...left by an earlier percent": a second bundle frees units at the price the first left.
test("[boundary-2] a second bundle frees units at the unit price the first bundle left", () => {
  const cart = priceCart([line("sku-4", 1000, 4)], [bundle("bogo-2", 1, 1, 2), bundle("bogo-1", 1, 1, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "bogo-1", amount: 2000 },
    { promotionId: "bogo-2", amount: 1000 },
  ]);
  assert.equal(cart.lines[0].total, 1000);
  assert.equal(cart.total, 1000);
});

// Extends public "[boundary-3] a percentage amount of exactly half a cent rounds up": values where floating point drifts below the half.
test("[boundary-3] 29 percent of 50 cents is 14.5 and rounds up to 15", () => {
  const cart = priceCart([line("sku-50", 50, 1)], [percent("p29", 29)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p29", amount: 15 }]);
  assert.equal(cart.lines[0].total, 35);
  assert.equal(cart.total, 35);
});

// Extends public "[boundary-3] a percentage amount of exactly half a cent rounds up": more values that sit exactly on the half.
test("[boundary-3] half-cent percentage amounts round up on several lines", () => {
  const cart = priceCart(
    [line("a", 150, 1, ["p41"]), line("b", 5, 1, ["p10"]), line("c", 25, 1, ["p58"]), line("d", 45, 1, ["p70"])],
    [percent("p41", 41, 1, "p41"), percent("p10", 10, 1, "p10"), percent("p58", 58, 1, "p58"), percent("p70", 70, 1, "p70")],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p41", amount: 62 }]);
  assert.equal(cart.lines[0].total, 88);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "p10", amount: 1 }]);
  assert.equal(cart.lines[1].total, 4);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "p58", amount: 15 }]);
  assert.equal(cart.lines[2].total, 10);
  assert.deepEqual(cart.lines[3].promotions, [{ promotionId: "p70", amount: 32 }]);
  assert.equal(cart.lines[3].total, 13);
  assert.equal(cart.total, 115);
});

// Extends public "[boundary-3] a percentage amount below the half cent rounds down": the percent is of the line total, rounded once.
test("[boundary-3] a percentage is rounded on the line total, not per unit", () => {
  const cart = priceCart([line("sku-101", 101, 3)], [percent("p33", 33)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p33", amount: 100 }]);
  assert.equal(cart.lines[0].total, 203);
  assert.equal(cart.total, 203);
});

// Extends public "[boundary-3] a percentage amount of exactly half a cent rounds up": each stacked promotion is rounded in turn.
test("[boundary-3] stacked percentages are each rounded half up on what the previous left", () => {
  const cart = priceCart([line("sku-3", 3, 1)], [percent("second", 50, 2), percent("first", 50, 1)]);

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "first", amount: 2 },
    { promotionId: "second", amount: 1 },
  ]);
  assert.equal(cart.lines[0].total, 0);
  assert.equal(cart.total, 0);
});

// Extends public "[boundary-4] a fixed amount larger than the unit price takes off only the whole line": clamped to the current total.
test("[boundary-4] a fixed amount after a percent takes off only what the percent left", () => {
  const cart = priceCart(
    [line("sku-3", 1000, 3)],
    [percent("after", 10, 3), fixed("big", 600, 2), percent("half", 50, 1)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "half", amount: 1500 },
    { promotionId: "big", amount: 1500 },
    { promotionId: "after", amount: 0 },
  ]);
  assert.equal(cart.lines[0].total, 0);
  assert.equal(cart.total, 0);
});

// Extends public "[boundary-4] a promotion matching a line already at 0 is reported with 0 taken off": every kind after 0.
test("[boundary-4] fixed, bundle and percent promotions on a line already at 0 are each reported with 0", () => {
  const cart = priceCart(
    [line("sku-300", 300, 2), line("other", 1000, 1)],
    [percent("p", 10, 4), bundle("b", 1, 1, 3), fixed("f", 50, 2), fixed("zero-it", 1000, 1)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "zero-it", amount: 600 },
    { promotionId: "f", amount: 0 },
    { promotionId: "b", amount: 0 },
    { promotionId: "p", amount: 0 },
  ]);
  assert.equal(cart.lines[0].total, 0);
  assert.equal(cart.lines[1].total, 0);
  assert.equal(cart.total, 0);
});

// Extends public "[boundary-4] a fixed amount larger than the unit price takes off only the whole line": a percentage above 100.
test("[boundary-4] a percentage above 100 takes off only the whole line", () => {
  const cart = priceCart([line("sku-1", 1000, 2), line("tagged", 500, 1, ["t"])], [percent("p150", 150)]);

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p150", amount: 2000 }]);
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "p150", amount: 500 }]);
  assert.equal(cart.lines[1].total, 0);
  assert.equal(cart.total, 0);
});

// Extends public "[boundary-4] a promotion matching a line already at 0...": a line priced at 0 is at 0 from the start.
test("[boundary-4] a line with unit price 0 reports matching promotions with 0 taken off", () => {
  const cart = priceCart([line("free-sku", 0, 3), line("paid", 1000, 1)], [percent("ten", 10), fixed("minus-50", 50, 2)]);

  assert.equal(cart.lines[0].productId, "free-sku");
  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "ten", amount: 0 },
    { promotionId: "minus-50", amount: 0 },
  ]);
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[1].promotions, [
    { promotionId: "ten", amount: 100 },
    { promotionId: "minus-50", amount: 50 },
  ]);
  assert.equal(cart.lines[1].total, 850);
  assert.equal(cart.total, 850);
});

// Extends public "[boundary-4] a fixed amount larger than the unit price...": only the line that overflows is clamped.
test("[boundary-4] a fixed amount clamps each line to 0 separately and leaves the others their remainder", () => {
  const cart = priceCart(
    [line("cheap", 300, 4), line("dear", 2000, 3), line("exact", 500, 2)],
    [fixed("minus-500", 500)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "minus-500", amount: 1200 }]);
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "minus-500", amount: 1500 }]);
  assert.equal(cart.lines[1].total, 4500);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "minus-500", amount: 1000 }]);
  assert.equal(cart.lines[2].total, 0);
  assert.equal(cart.total, 4500);
});
