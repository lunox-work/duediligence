/** A line of the cart: a product id, a unit price in cents, a quantity, and a set of tags. */
export interface CartLine {
  productId: string;
  unitPrice: number;
  quantity: number;
  tags: string[];
}

/** What every promotion has: an id, a priority, whether it is exclusive, and an optional tag; without a tag it matches every line. */
export interface PromotionBase {
  id: string;
  priority: number;
  exclusive: boolean;
  tag?: string;
}

/** A "percent" promotion: a percentage off the line total. */
export interface PercentPromotion extends PromotionBase {
  kind: "percent";
  percent: number;
}

/** A "fixed" promotion: an amount in cents off each unit. */
export interface FixedPromotion extends PromotionBase {
  kind: "fixed";
  amount: number;
}

/** A "bundle" promotion: a buy count and a free count; every full group of buy + free units has free units free. */
export interface BundlePromotion extends PromotionBase {
  kind: "bundle";
  buy: number;
  free: number;
}

/** A "threshold" promotion: an amount in cents off the order when the subtotal reaches the minimum. */
export interface ThresholdPromotion extends PromotionBase {
  kind: "threshold";
  minimum: number;
  amount: number;
}

/** A promotion of one of the four kinds. */
export type Promotion =
  | PercentPromotion
  | FixedPromotion
  | BundlePromotion
  | ThresholdPromotion;

/** A promotion that was applied, with the amount in cents it took off. */
export interface AppliedPromotion {
  promotionId: string;
  amount: number;
}

/** A priced line: its final total in cents and the promotions applied to it in order. */
export interface PricedLine {
  productId: string;
  total: number;
  promotions: AppliedPromotion[];
}

/** The priced cart: each line, the order promotions applied with their amounts, and the order total in cents. */
export interface PricedCart {
  lines: PricedLine[];
  orderPromotions: AppliedPromotion[];
  total: number;
}

/**
 * Prices a cart with stacked promotions. Returns one priced line per cart line, in cart order.
 * Throws an error naming the promotion's id if a promotion's kind is not one of the four,
 * an error naming the id if two promotions share an id, and an error naming the product id
 * if a line has a negative unit price or a negative or non-whole quantity.
 */
export function priceCart(lines: CartLine[], promotions: Promotion[]): PricedCart {
  validate(lines, promotions);

  const ordered = [...promotions].sort(compareOrder);
  const linePromotions = ordered.filter((p) => p.kind !== "threshold") as LinePromotion[];
  const thresholds = ordered.filter((p): p is ThresholdPromotion => p.kind === "threshold");

  const pricedLines = lines.map((line) => priceLine(line, linePromotions));
  const subtotal = pricedLines.reduce((sum, l) => sum + l.total, 0);

  const orderPromotions: AppliedPromotion[] = [];
  let total = subtotal;
  for (const t of thresholds) {
    if (subtotal < t.minimum) continue;
    const amount = Math.min(t.amount, total);
    total -= amount;
    orderPromotions.push({ promotionId: t.id, amount });
  }

  return { lines: pricedLines, orderPromotions, total };
}

type LinePromotion = PercentPromotion | FixedPromotion | BundlePromotion;

const KINDS = new Set(["percent", "fixed", "bundle", "threshold"]);

function validate(lines: CartLine[], promotions: Promotion[]): void {
  const seen = new Set<string>();
  for (const p of promotions) {
    if (!KINDS.has(p.kind)) {
      throw new Error(`promotion ${p.id} has unknown kind ${String(p.kind)}`);
    }
    if (seen.has(p.id)) {
      throw new Error(`duplicate promotion id ${p.id}`);
    }
    seen.add(p.id);
  }
  for (const l of lines) {
    if (!(l.unitPrice >= 0)) {
      throw new Error(`line ${l.productId} has a negative unit price`);
    }
    if (!(l.quantity >= 0) || !Number.isInteger(l.quantity)) {
      throw new Error(`line ${l.productId} has a negative or non-whole quantity`);
    }
  }
}

/** Priority, then id. */
function compareOrder(a: PromotionBase, b: PromotionBase): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function matches(p: PromotionBase, line: CartLine): boolean {
  return p.tag === undefined || line.tags.includes(p.tag);
}

/** Rounds numerator / denominator to the nearest whole number, halves up, for non-negative integers. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** The amount a promotion takes off a line whose current total is `current`, held to that total. */
function amountOff(p: LinePromotion, line: CartLine, current: number): number {
  let amount: number;
  switch (p.kind) {
    case "percent":
      amount = roundHalfUp(current * p.percent, 100);
      break;
    case "fixed":
      amount = p.amount * line.quantity;
      break;
    case "bundle": {
      const group = p.buy + p.free;
      const freeUnits = group > 0 ? Math.floor(line.quantity / group) * p.free : 0;
      amount = roundHalfUp(freeUnits * current, line.quantity);
      break;
    }
  }
  return Math.max(0, Math.min(amount, current));
}

interface Candidate {
  first: PromotionBase;
  amount: number;
  applied: AppliedPromotion[];
}

function priceLine(line: CartLine, promotions: LinePromotion[]): PricedLine {
  const full = line.unitPrice * line.quantity;
  if (line.quantity === 0) {
    return { productId: line.productId, total: 0, promotions: [] };
  }

  const matching = promotions.filter((p) => matches(p, line));
  const candidates: Candidate[] = [];

  const stack = matching.filter((p) => !p.exclusive);
  if (stack.length > 0) {
    let current = full;
    const applied: AppliedPromotion[] = [];
    for (const p of stack) {
      const amount = amountOff(p, line, current);
      current -= amount;
      applied.push({ promotionId: p.id, amount });
    }
    candidates.push({ first: stack[0], amount: full - current, applied });
  }

  for (const p of matching.filter((p) => p.exclusive)) {
    const amount = amountOff(p, line, full);
    candidates.push({ first: p, amount, applied: [{ promotionId: p.id, amount }] });
  }

  if (candidates.length === 0) {
    return { productId: line.productId, total: full, promotions: [] };
  }

  candidates.sort((a, b) => b.amount - a.amount || compareOrder(a.first, b.first));
  const best = candidates[0];
  return { productId: line.productId, total: full - best.amount, promotions: best.applied };
}
