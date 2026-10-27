# Price a cart with stacked promotions

Employers buy task credits in carts, and marketing runs several promotions
at once. Which ones apply, in what order, and how they combine decides the
invoice, so the rules have to come out the same for every cart.

```gherkin
Feature: Apply promotions to a cart

  Background:
    Given a cart of lines, each with a product id, a unit price in cents, a quantity, and a set of tags
    And a list of promotions, each with an id, a priority, a kind, whether it is exclusive, and an optional tag
    And a promotion with a tag matches the lines that carry that tag; one without a tag matches every line
    And the kinds are "percent" with a percentage, "fixed" with an amount in cents off each unit, "bundle" with a buy count and a free count, and "threshold" with a minimum subtotal and an amount in cents off the order
    And pricing returns each line's final total in cents, the promotions applied to each line in order with the amount each took off, the order promotions applied with their amounts, and the order total

  Rule: Line promotions apply one after another

    @happy
    Scenario: A percentage comes off the line total
      Given a line of 3 units at 1000 cents and a "percent" promotion of 10 with no tag
      When the cart is priced
      Then the line's total is 2700 and the promotion is reported on the line with 300 taken off

    @happy
    Scenario: A fixed amount comes off each unit
      Given a line of 2 units at 1500 cents tagged "credits" and a "fixed" promotion of 200 for tag "credits"
      When the cart is priced
      Then the line's total is 2600 and the promotion is reported with 400 taken off
      And a line without the tag is untouched and reports no promotion

    @happy
    Scenario: A bundle gives free units
      Given a line of 7 units at 500 cents and a "bundle" promotion with buy 2 and free 1
      When the cart is priced
      Then every full group of 3 units has 1 unit free: 2 groups, so 1000 off and a total of 2500
      And the unit left over pays in full

    @boundary
    Scenario: Line promotions apply by priority, then by id
      Given a line of 1 unit at 1000 cents, a "fixed" promotion of 100 with priority 2 and id "b", and a "percent" promotion of 50 with priority 1 and id "a"
      When the cart is priced
      Then the percent applies first, leaving 500, then the fixed, leaving 400
      And with equal priorities the promotion whose id sorts first applies first
      And each promotion is computed on the line's total as the ones before it left it

    @boundary
    Scenario: A bundle's free units are worth the line's current unit price
      Given a line of 4 units at 1000 cents, a "percent" promotion of 50 with priority 1, and a "bundle" promotion with buy 1 and free 1 with priority 2
      When the cart is priced
      Then the percent leaves 2000, so each unit is worth 500, and the bundle takes 2 free units off: 1000
      And the line's total is 1000

    @boundary
    Scenario: Amounts are rounded to the cent, half up
      Given a line of 1 unit at 101 cents and a "percent" promotion of 33
      When the cart is priced
      Then 33.33 is rounded to 33 off, leaving 68
      And for 1 unit at 150 cents with a "percent" promotion of 15, 22.5 is rounded to 23 off, leaving 127

    @boundary
    Scenario: A line never goes below zero
      Given a line of 2 units at 300 cents and a "fixed" promotion of 500
      When the cart is priced
      Then the promotion takes off 600, the whole line, and the total is 0
      And a promotion that matches a line whose total is already 0 is reported on it with 0 taken off

  Rule: An exclusive promotion applies alone, when it is the better deal

    @boundary
    Scenario: The stack applies when it takes off more than the exclusive promotion
      Given a line of 1 unit at 1000 cents and three matching promotions in priority order: "percent" 10, then an exclusive "fixed" 100, then "percent" 20
      When the cart is priced
      Then the two percents stack as usual, taking 100 and then 180 off, 280 in all, against 100 for the exclusive fixed
      And the line's total is 720, with both percents reported and the exclusive fixed not reported
      And with an exclusive "fixed" of 300 instead, it takes off more than 280, so it alone applies, computed on the line's full total, and the line's total is 700
      And an exclusive promotion's place in the order does not limit which promotions take part: the comparison is between amounts

    @boundary
    Scenario: Exclusive promotions never combine
      Given a line of 2 units at 1000 cents and two exclusive promotions that both match it: "percent" 10 with priority 1 and "fixed" 150 with priority 2
      When the cart is priced
      Then each is computed alone on the line's full total: the percent takes 200 off and the fixed 300
      And the fixed applies alone, the line's total is 1700, and the percent is not reported on the line
      And with a "fixed" of 100 instead, both take 200 off and the one earlier in order, the percent, applies
      And an exclusive promotion is never added to the stack of non-exclusive promotions, only compared with it as a whole
      And an exclusive promotion that loses on one line still applies to another line that only it matches

    @boundary
    Scenario: A tie goes to whichever comes first in order
      Given a line of 1 unit at 1000 cents, a "percent" promotion of 10 with priority 1, and an exclusive "fixed" promotion of 100 with priority 2
      When the cart is priced
      Then both take 100 off, and the stack's place in the order is that of its first promotion, so the percent applies and the exclusive fixed is not reported
      And with the priorities swapped, the exclusive fixed applies alone
      And otherwise, whenever amounts are equal, priority then id decides, as it does for the order promotions apply in

    @boundary
    Scenario: Promotions are compared by what they can actually take off
      Given a line of 2 units at 300 cents, a "fixed" promotion of 400 with priority 1, and an exclusive "fixed" promotion of 500 with priority 2
      When the cart is priced
      Then each is held to the line's total of 600, so both take 600 off and the tie goes to the stack
      And the line's total is 0, with the non-exclusive fixed reported with 600 taken off and the exclusive not reported

    @boundary
    Scenario: With no stack, the best exclusive promotion applies
      Given a line that only exclusive promotions match
      When the cart is priced
      Then there is no stack to compare with, and the exclusive promotion that takes off the most applies alone
      And it applies and is reported even when it takes off 0, as on a line whose unit price is 0
      And a line with quantity 0 still reports no promotion

  Rule: Threshold promotions apply to the order

    @happy
    Scenario: A threshold is met by the subtotal after line promotions
      Given lines whose totals after line promotions sum to 5000 and a "threshold" promotion with minimum 5000 and 500 off
      When the cart is priced
      Then the order total is 4500 and the promotion is reported on the order with 500 taken off
      And a threshold whose minimum is 5001 is not applied and not reported

    @boundary
    Scenario: Every qualifying threshold applies against the same subtotal
      Given a subtotal of 10000 after line promotions and two "threshold" promotions, minimum 5000 with 600 off and minimum 9000 with 1000 off
      When the cart is priced
      Then both apply, in priority then id order, and the order total is 8400
      And the second is judged against 10000, not against 9400
      And the order total never goes below 0

  Rule: Bad input is refused

    @unhappy
    Scenario: An unknown kind is refused
      Given a promotion whose kind is not one of the four
      When the cart is priced
      Then it fails with an error naming the promotion's id

    @unhappy
    Scenario: Duplicate promotion ids are refused
      Given two promotions with the same id
      When the cart is priced
      Then it fails with an error naming the id

    @unhappy
    Scenario: A negative price or quantity is refused
      Given a line with a negative unit price, or a negative or non-whole quantity
      When the cart is priced
      Then it fails with an error naming the product id
      And a line with quantity 0 is allowed: its total is 0 and no promotion is reported on it
```
