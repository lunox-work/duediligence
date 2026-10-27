import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceCart,
  type BundlePromotion,
  type CartLine,
  type FixedPromotion,
  type PercentPromotion,
  type Promotion,
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

function unknownKind(id: string, kind: unknown, options: Options = {}): Promotion {
  return { ...base(id, 1, options), kind, amount: 100 } as unknown as Promotion;
}

function naming(name: string) {
  return (err: unknown) => {
    if (!(err instanceof Error)) {
      assert.fail(`expected an Error, got ${String(err)}`);
      return false;
    }
    assert.ok(err.message.includes(name), `expected "${err.message}" to name "${name}"`);
    return true;
  };
}

// Extends "[unhappy-1] a promotion of an unknown kind is refused even when it matches no
// line": here the cart has no lines at all.
test("[unhappy-1] a promotion of an unknown kind is refused for an empty cart", () => {
  assert.throws(() => priceCart([], [unknownKind("ghost-kind", "voucher")]), naming("ghost-kind"));
});

test("[unhappy-1] a promotion of an unknown kind is refused when the only line has quantity 0", () => {
  assert.throws(
    () => priceCart([line("empty-line", 1000, 0)], [unknownKind("ghost-kind", "voucher")]),
    naming("ghost-kind"),
  );
});

// Extends "[unhappy-1] a promotion of an unknown kind is refused, naming its id": among
// valid promotions of every kind, after them in the list.
test("[unhappy-1] an unknown kind among valid promotions of all four kinds is refused, naming it", () => {
  assert.throws(
    () =>
      priceCart(
        [line("sku-a", 1000, 3, ["t"]), line("sku-b", 500, 2)],
        [
          percent("p-ok", 1, 10),
          fixed("f-ok", 2, 50),
          bundle("b-ok", 3, 2, 1),
          threshold("t-ok", 4, 100, 50),
          unknownKind("odd-kind-promo", "cashback"),
        ],
      ),
    naming("odd-kind-promo"),
  );
});

test("[unhappy-1] an exclusive promotion of an unknown kind is refused, naming it", () => {
  assert.throws(
    () => priceCart([line("sku-a", 1000, 1)], [unknownKind("excl-unknown", "voucher", { exclusive: true })]),
    naming("excl-unknown"),
  );
});

test("[unhappy-1] a kind differing from a known one only in case is refused", () => {
  assert.throws(
    () => priceCart([line("sku-a", 1000, 1)], [{ ...percent("shouty-kind", 1, 10), kind: "PERCENT" } as unknown as Promotion]),
    naming("shouty-kind"),
  );
});

test("[unhappy-1] a promotion with no kind is refused, naming its id", () => {
  assert.throws(
    () => priceCart([line("sku-a", 1000, 1)], [unknownKind("kindless-promo", undefined)]),
    naming("kindless-promo"),
  );
});

// Extends "[unhappy-2] two promotions with the same id are refused": the duplicates are
// apart in a longer list.
test("[unhappy-2] duplicate ids far apart in a longer list are refused, naming the id", () => {
  assert.throws(
    () =>
      priceCart(
        [line("sku-a", 1000, 1)],
        [
          percent("twin-id", 1, 10),
          fixed("other-1", 2, 50),
          bundle("other-2", 3, 1, 1),
          threshold("other-3", 4, 100, 10),
          fixed("twin-id", 5, 20),
        ],
      ),
    naming("twin-id"),
  );
});

test("[unhappy-2] duplicate ids are refused for an empty cart", () => {
  assert.throws(() => priceCart([], [threshold("twin-id", 1, 0, 10), threshold("twin-id", 2, 0, 20)]), naming("twin-id"));
});

test("[unhappy-2] duplicate ids are refused when neither promotion matches any line", () => {
  assert.throws(
    () =>
      priceCart(
        [line("sku-a", 1000, 1)],
        [percent("twin-id", 1, 10, { tag: "nowhere" }), percent("twin-id", 2, 10, { tag: "nowhere" })],
      ),
    naming("twin-id"),
  );
});

test("[unhappy-2] duplicate ids where one is exclusive are refused, naming the id", () => {
  assert.throws(
    () => priceCart([line("sku-a", 1000, 1)], [fixed("twin-id", 1, 100, { exclusive: true }), percent("twin-id", 1, 10)]),
    naming("twin-id"),
  );
});

// Extends "[unhappy-3] a line with a negative unit price is refused": the bad line is the
// last of several, with promotions present.
test("[unhappy-3] a negative unit price on the last of several lines is refused, naming it", () => {
  assert.throws(
    () =>
      priceCart(
        [line("fine-one", 1000, 1), line("fine-two", 500, 3), line("below-zero-price", -250, 2)],
        [percent("pct-10", 1, 10), threshold("t", 2, 100, 10)],
      ),
    naming("below-zero-price"),
  );
});

test("[unhappy-3] a negative unit price is refused even with quantity 0", () => {
  assert.throws(() => priceCart([line("neg-price-zero-qty", -100, 0)], []), naming("neg-price-zero-qty"));
});

// Extends "[unhappy-3] a line with a negative quantity is refused": a larger negative,
// a zero price, and the bad line not first.
test("[unhappy-3] a negative quantity on a zero-priced line after a good line is refused, naming it", () => {
  assert.throws(
    () => priceCart([line("fine-one", 1000, 1), line("minus-three-qty", 0, -3)], [fixed("f", 1, 10)]),
    naming("minus-three-qty"),
  );
});

// Extends "[unhappy-3] a line with a non-whole quantity is refused": a fraction below 1
// and one that is not a half.
test("[unhappy-3] a quantity below 1 that is not whole is refused, naming the product", () => {
  assert.throws(() => priceCart([line("half-unit", 1000, 0.5)], []), naming("half-unit"));
});

test("[unhappy-3] a quantity of 2.25 is refused, naming the product", () => {
  assert.throws(
    () => priceCart([line("fine-one", 100, 2), line("quarter-extra", 1000, 2.25)], [percent("p", 1, 10)]),
    naming("quarter-extra"),
  );
});

// Extends "[unhappy-3] a line with quantity 0 is allowed": among other lines, with
// promotions of every kind, including a threshold.
test("[unhappy-3] a line with quantity 0 among others totals 0, reports nothing, and the rest is priced", () => {
  const cart = priceCart(
    [line("before", 1000, 2), line("zero-qty", 700, 0, ["t"]), line("after", 500, 3, ["t"])],
    [
      percent("pct-10", 1, 10),
      fixed("fixed-t", 2, 50, { tag: "t" }),
      bundle("bundle-t", 3, 2, 1, { tag: "t" }),
      threshold("spend-3000", 4, 3000, 100),
    ],
  );
  assert.equal(cart.lines.length, 3);
  assert.equal(cart.lines[0].productId, "before");
  assert.equal(cart.lines[0].total, 1800);
  assert.deepEqual(
    cart.lines[0].promotions.map((p) => [p.promotionId, p.amount]),
    [["pct-10", 200]],
  );
  assert.equal(cart.lines[1].productId, "zero-qty");
  assert.equal(cart.lines[1].total, 0);
  assert.deepEqual(cart.lines[1].promotions, []);
  // after: 1500 -> 1350 -> 1200 (400 per unit) -> one free unit: 800.
  assert.equal(cart.lines[2].productId, "after");
  assert.equal(cart.lines[2].total, 800);
  assert.deepEqual(
    cart.lines[2].promotions.map((p) => [p.promotionId, p.amount]),
    [
      ["pct-10", 150],
      ["fixed-t", 150],
      ["bundle-t", 400],
    ],
  );
  assert.deepEqual(
    cart.orderPromotions.map((p) => [p.promotionId, p.amount]),
    [],
  );
  assert.equal(cart.total, 2600);
});
