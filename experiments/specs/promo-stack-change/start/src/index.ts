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
  validatePromotions(promotions);
  validateLines(lines);

  const ordered = [...promotions].sort(byPriorityThenId);
  const linePromotions = ordered.filter((p) => p.kind !== "threshold");
  const thresholds = ordered.filter((p): p is ThresholdPromotion => p.kind === "threshold");

  const pricedLines = lines.map((line) => priceLine(line, linePromotions));
  const subtotal = pricedLines.reduce((sum, line) => sum + line.total, 0);

  const orderPromotions: AppliedPromotion[] = [];
  let total = subtotal;
  for (const promotion of thresholds) {
    if (subtotal < promotion.minimum) continue;
    const amount = Math.min(promotion.amount, total);
    orderPromotions.push({ promotionId: promotion.id, amount });
    total -= amount;
  }

  return { lines: pricedLines, orderPromotions, total };
}

const KINDS: ReadonlySet<string> = new Set(["percent", "fixed", "bundle", "threshold"]);

function validatePromotions(promotions: Promotion[]): void {
  const seen = new Set<string>();
  for (const promotion of promotions) {
    if (!KINDS.has((promotion as { kind?: unknown }).kind as string)) {
      throw new Error(`Promotion "${promotion.id}" has an unknown kind`);
    }
    if (seen.has(promotion.id)) {
      throw new Error(`Duplicate promotion id "${promotion.id}"`);
    }
    seen.add(promotion.id);
  }
}

function validateLines(lines: CartLine[]): void {
  for (const line of lines) {
    if (line.unitPrice < 0) {
      throw new Error(`Line "${line.productId}" has a negative unit price`);
    }
    if (line.quantity < 0 || !Number.isInteger(line.quantity)) {
      throw new Error(`Line "${line.productId}" has a quantity that is negative or not whole`);
    }
  }
}

function byPriorityThenId(a: Promotion, b: Promotion): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function matches(promotion: Promotion, line: CartLine): boolean {
  return promotion.tag === undefined || line.tags.includes(promotion.tag);
}

function priceLine(line: CartLine, promotions: Promotion[]): PricedLine {
  const priced: PricedLine = { productId: line.productId, total: 0, promotions: [] };
  if (line.quantity === 0) return priced;

  let total = line.unitPrice * line.quantity;
  for (const promotion of promotions) {
    if (!matches(promotion, line)) continue;
    const amount = Math.min(discount(promotion, line.quantity, total), total);
    priced.promotions.push({ promotionId: promotion.id, amount });
    total -= amount;
    if (promotion.exclusive) break;
  }
  priced.total = total;
  return priced;
}

/** The amount a line promotion takes off a line of `quantity` units whose current total is `total`, before clamping. */
function discount(promotion: Promotion, quantity: number, total: number): number {
  switch (promotion.kind) {
    case "percent":
      return roundHalfUp(total * promotion.percent, 100);
    case "fixed":
      return promotion.amount * quantity;
    case "bundle": {
      const groupSize = promotion.buy + promotion.free;
      if (groupSize <= 0) return 0;
      const freeUnits = Math.floor(quantity / groupSize) * promotion.free;
      return roundHalfUp(freeUnits * total, quantity);
    }
    default:
      return 0;
  }
}

/** Rounds numerator / denominator to the nearest whole number, halves up. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
