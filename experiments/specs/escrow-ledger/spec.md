# Escrow ledger

A task's reward is held in escrow and paid out as its review gates pass.
Every movement of money is an entry in an append-only ledger, and every
balance is derived from the entries. Retries from the payment worker must
never move money twice.

```gherkin
Feature: Hold, release and refund a task's reward

  Background:
    Given a ledger is created for one task with a currency and a fee rate
    And the currency is three uppercase letters, and the fee rate is a whole number of basis points from 0 to 10000
    And every amount is a whole number of minor units, at least 1 and at most Number.MAX_SAFE_INTEGER
    And every rejected call throws a LedgerError whose code says why: "invalid_ledger", "invalid_amount", "insufficient_funds", "closed" or "key_conflict"
    And a rejected call changes nothing

  Rule: Funding, releasing and refunding move money between balances

    @happy
    Scenario: Funding adds to the held balance
      Given a ledger in "USD" with a fee rate of 1000 basis points
      When 50000 is funded
      Then 50000 is held

    @happy
    Scenario: A release pays the contributor the amount less the platform fee
      Given a ledger in "USD" with a fee rate of 1000 basis points and 50000 funded
      When 20000 is released to contributor "c1"
      Then 30000 is held
      And contributor "c1" has been paid 18000
      And the platform has taken 2000 in fees
      And 20000 has been released in total

    @boundary
    Scenario: The fee is rounded half to even, exactly, at any size
      Given a ledger with a fee rate of 250 basis points
      Then the fee on a release of 100 is 2, because 2.5 rounds to the even 2
      And the fee on a release of 300 is 8, because 7.5 rounds to the even 8
      And the fee on a release of 9007199254740991 at 9999 basis points is exact, with no floating-point error

    @happy
    Scenario: A refund returns money to the funder
      Given a ledger with 50000 funded
      When 10000 is refunded
      Then 40000 is held
      And 10000 has been refunded in total

    @unhappy
    Scenario: Nothing leaves the ledger that it does not hold
      Given a ledger with 50000 funded
      When 50001 is released or refunded
      Then it fails with code "insufficient_funds"

    @unhappy
    Scenario: Amounts must be valid
      When an amount of 0, a negative amount or a fractional amount is funded, released or refunded
      Then it fails with code "invalid_amount"

    @unhappy
    Scenario: A ledger must be valid
      When a ledger is created with currency "usd" or "US" or with a fee rate of 10001 or 2.5
      Then it fails with code "invalid_ledger"

  Rule: The status follows the entries, and a ledger that pays out everything closes

    @happy
    Scenario: The status moves through open, funded, partially released and closed
      Given a new ledger
      Then its status is "open"
      When money is funded, its status is "funded"
      When some of it is released, its status is "partially released"
      And it stays "partially released" while anything is held, through later funding and refunds
      And a refund before any release leaves it "funded"

    @boundary
    Scenario: A release or refund that empties the ledger closes it
      Given a ledger with 50000 funded
      When 50000 is released, or refunded, in any number of entries
      Then the ledger is "closed" as soon as nothing is held
      And any later fund, release or refund fails with code "closed"

  Rule: Every entry call carries an idempotency key, so a retry never moves money twice

    @concurrency
    Scenario: Repeating a call with the same key returns the original entry
      Given a ledger where 20000 was released to "c1" with key "k1"
      When the same release is made again with key "k1"
      Then it returns the original entry
      And no balance changes and no entry is added

    @unhappy
    Scenario: Reusing a key for a different call is refused
      Given a ledger where 20000 was released to "c1" with key "k1"
      When a call with key "k1" differs in kind, amount or contributor
      Then it fails with code "key_conflict"

    @recovery
    Scenario: A rejected call does not use up its key
      Given a call with key "k2" was rejected
      When a valid call is made with key "k2"
      Then it succeeds

    @boundary
    Scenario: A retry after the ledger closed still returns the original entry
      Given a ledger that was closed by a release with key "k3"
      When that release is repeated with key "k3"
      Then it returns the original entry instead of failing with "closed"

  Rule: The entries are the record

    @happy
    Scenario: Entries are listed in order with sequence numbers
      Given a ledger with several entries
      When its entries are listed
      Then each entry has its kind, amount, key, sequence number starting at 1, and for a release its contributor, fee and net amount
      And the total funded always equals held plus released plus refunded
```
