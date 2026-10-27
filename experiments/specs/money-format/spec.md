# Shared money formatter

Amounts are stored as integer minor units with an ISO 4217 currency code.
Three screens format them three ways, which is why the same amount reads
differently from one screen to the next. One formatter replaces all three.

```gherkin
Feature: Format a money amount for display

  Display text is the currency code, one space, then the amount. The amount
  groups whole units in threes with "," and uses "." before any fraction.
  Supported currencies and their minor-unit digits:

    | currency | minor digits |
    | USD      | 2            |
    | EUR      | 2            |
    | IDR      | 0            |

  @happy
  Scenario: A whole amount renders without decimals
    Given an amount of 125000 minor units in USD
    When it is formatted
    Then the text is "USD 1,250"

  @happy
  Scenario: A fractional amount renders with two decimals
    Given an amount of 125050 minor units in USD
    When it is formatted
    Then the text is "USD 1,250.50"

  @happy
  Scenario: Less than one whole unit keeps its leading zero
    Given an amount of 99 minor units in EUR
    When it is formatted
    Then the text is "EUR 0.99"

  @happy
  Scenario: A currency with no minor digits never shows decimals
    Given an amount of 1500000 minor units in IDR
    When it is formatted
    Then the text is "IDR 1,500,000"

  @boundary
  Scenario: Zero is a whole amount
    Given an amount of 0 minor units in USD
    When it is formatted
    Then the text is "USD 0"

  @boundary
  Scenario: A negative amount carries a leading minus sign
    Given an amount of -1250 minor units in USD
    When it is formatted
    Then the text is "-USD 12.50"

  @boundary
  Scenario: The largest safe amount formats exactly
    Given an amount of 9007199254740991 minor units in USD
    When it is formatted
    Then the text is "USD 90,071,992,547,409.91"

  @unhappy
  Scenario: An unsupported currency is refused
    Given an amount of 100 minor units in GBP
    When it is formatted
    Then it fails with an error whose message names "GBP"

  @unhappy
  Scenario: An amount that is not a whole number of minor units is refused
    Given an amount of 12.5 minor units in USD
    When it is formatted
    Then it fails with an error saying the amount must be an integer
```
