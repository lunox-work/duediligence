# Exclusive promotions should give the customer the better deal, not cut the stack short

**Context:** Today an exclusive promotion applies wherever it falls in priority order: the promotions before it still stack with it and the ones after it are dropped. Whether an exclusive deal helps a customer therefore depends on priority numbers marketing never meant to mean that, and support keeps seeing invoices where an "exclusive" offer left the employer paying more than the regular promotions alone would have.

**Change:** An exclusive promotion should never combine with anything on a line. For each line the employer gets whichever is worth more: the regular (non-exclusive) promotions stacked the way they are today, or a single exclusive promotion on its own.

**Acceptance criteria:**
- A line where the regular promotions together save more gets them, and no exclusive promotion is reported on it; a line where an exclusive promotion saves more gets only that one, worked out on the full line price.
- When several exclusive promotions match a line, the one worth most is the one compared; the others are not reported.
- A promotion that loses out on one line still applies on other lines.

**Scope:** Line promotions only. Order (threshold) promotions, rounding, the zero floor and input validation stay as they are.
