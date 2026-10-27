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
  throw new Error("not implemented");
}
