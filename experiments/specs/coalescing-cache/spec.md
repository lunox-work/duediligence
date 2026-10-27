# Share one load per key

Many requests ask the same question at the same moment, and the answer is
expensive. The cache in front of the loader must make one call for all of
them, keep the answer while it is fresh, serve it while it is stale and
refresh it once in the background, and drop it when it has expired. All
timing comes from a clock the caller supplies.

```gherkin
Feature: A cache that shares one in-flight load per key and serves stale values while refreshing

  Background:
    Given a cache created with a loader that takes a key and returns a promise of a value
    And a fresh-for duration and a stale-for duration in milliseconds, a maximum number of entries, a clock that returns the current time in milliseconds, and an optional error handler
    And "get(key)" returns a promise of the value for that key
    And an entry's age is the clock's time now minus the clock's time when its load settled
    And an entry is fresh while its age is less than fresh-for, stale while its age is less than fresh-for plus stale-for, and expired from then on

  Rule: One load at a time per key

    @happy
    Scenario: Concurrent gets share one load
      Given no entry for a key
      When "get" is called three times for that key before the loader's promise settles
      Then the loader is called once
      And all three resolve with the loaded value

    @boundary
    Scenario: Different keys load separately
      Given no entries
      When "get" is called for two different keys before either load settles
      Then the loader is called once for each key, and the second call is made before the first load settles

    @unhappy
    Scenario: A failed load is not stored
      Given a loader whose promise rejects for a key
      When "get" is called twice for that key before the load settles
      Then both reject with the loader's error
      And a later "get" for that key calls the loader again

  Rule: A value is fresh, then stale, then gone

    @happy
    Scenario: A fresh value is served without loading
      Given an entry loaded at the clock's time 1000 and fresh-for 5000
      When "get" is called at time 5999
      Then it resolves with the stored value and the loader is not called

    @boundary
    Scenario: A stale value is served and refreshed once
      Given an entry loaded at time 1000, fresh-for 5000 and stale-for 5000
      When "get" is called at time 6000
      Then it resolves with the stored value without waiting for the loader
      And the loader is called once in the background
      And a "get" at time 6500, while that refresh is unsettled, resolves with the stored value and does not call the loader again
      When the refresh settles at time 7000
      Then the entry holds the refreshed value and is fresh until time 12000

    @boundary
    Scenario: An expired value is loaded again
      Given an entry loaded at time 1000, fresh-for 5000 and stale-for 5000
      When "get" is called at time 11000
      Then it resolves only when a new load settles, with the new value
      And the old value is never returned from then on

    @unhappy
    Scenario: A failed refresh keeps the stale value
      Given a stale entry whose background refresh rejects
      When the refresh settles
      Then the "get" that started it has already resolved with the stale value
      And the error handler, when given, is called with the error and the key
      And a later "get" while the entry is still stale resolves with the stale value and starts another refresh

  Rule: The cache holds at most its maximum

    @boundary
    Scenario: The least recently used entry is dropped
      Given a maximum of 2 and entries for keys "a" and "b", "a" stored first
      When "get" reads "a" and then a load for key "c" settles
      Then "b" is gone and "a" and "c" remain
      And a later "get" for "b" calls the loader
      And a stale read counts as a use, and a load counts as a use of the key it loads

    @boundary
    Scenario: An entry counts from when its load settles
      Given a maximum of 1 and an entry for key "a"
      When a load for key "b" starts and has not settled
      Then "a" is still served fresh without loading
      And once the load for "b" settles, "a" is gone

  Rule: Entries can be dropped on request

    @happy
    Scenario: An invalidated entry loads again
      Given a fresh entry for a key
      When the key is invalidated and "get" is called
      Then the loader is called and the result is the new value

    @boundary
    Scenario: Invalidating during a load discards its result
      Given a load in flight for a key with two "get" calls waiting on it
      When the key is invalidated and then the load settles
      Then both waiting calls resolve with the loaded value
      And a "get" right after calls the loader again rather than serving that value
```
