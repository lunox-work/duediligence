# Kestrel version ranges

Kestrel is a release tool with its own version and range syntax. It looks
like semantic versioning and is not: read every rule.
`satisfies(version, range)` says whether a kestrel version satisfies a
kestrel range, and throws an `Error` when either is not valid.

```gherkin
Feature: Kestrel version ranges

  Rule: R1. A version is MAJOR.MINOR, optionally .PATCH, optionally :tag
    MAJOR, MINOR and PATCH are decimal numbers without leading zeros (`0`
    itself is allowed). A missing PATCH is 0, so `2.4` and `2.4.0` are the
    same version. A tag follows a colon and is one or more lowercase
    letters and digits, with nothing else in it. Nothing else is a
    version: no prefix, no spaces, no fourth number, no other separator
    before a tag, no empty or uppercase tag.

    @happy
    Scenario: A missing patch is zero
      When I ask whether "2.4" satisfies "=2.4.0"
      Then the answer is true

    @unhappy
    Scenario Outline: Invalid versions
      When I ask whether "<version>" satisfies "*"
      Then it throws an error whose message contains "version"

      Examples:
        | version    |
        | 02.4       |
        | 2          |
        | 2.4.1.0    |
        | v2.4.1     |
        | 2.4.1-rc1  |
        | 2.4.1:RC1  |
        | 2.4.1:     |
        | 2.4.1:rc.1 |

  Rule: R2. Versions are ordered by numbers, then tags
    Versions compare by MAJOR, then MINOR, then PATCH, as numbers. With
    those equal, a version without a tag is greater than one with a tag.
    Two tags are split into runs of letters and runs of digits (`rc12b` is
    `rc`, `12`, `b`) and compared run by run from the left: two digit runs
    as numbers, two letter runs by character code, and a digit run is
    lower than a letter run. When one tag runs out first and every run so
    far is equal, the shorter tag is lower. Versions equal in all of this
    are the same version.

    @happy
    Scenario Outline: Ordering
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version     | range         | answer |
        | 1.10.0      | >1.9.0        | true   |
        | 2.0.0:rc    | <2.0.0:rc1    | true   |
        | 2.0.0:rc2   | <2.0.0:rc10   | true   |
        | 2.0.0:beta  | >2.0.0:alpha  | true   |
        | 2.0.0:10    | <2.0.0:a      | true   |
        | 2.0.0:rc    | >=2.0.0:rc    | true   |

  Rule: R3. A comparator compares with one version
    `=V` holds for V itself, `>V`, `>=V`, `<V` and `<=V` as their symbols
    say, by the order of rule R2. A version with no operator means `=V`.
    The operator is written directly before the version.

    @happy
    Scenario Outline: Comparators
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version | range   | answer |
        | 2.4.0   | 2.4     | true   |
        | 2.4.1   | >2.4    | true   |
        | 2.4.1   | <=2.4.0 | false  |
        | 3.0.0   | >=3.0   | true   |

  Rule: R4. A tilde range keeps the major and minor
    `~V` holds for versions at least V with the same MAJOR and MINOR as V.

    @happy
    Scenario Outline: Tilde
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version | range  | answer |
        | 1.4.7   | ~1.4.2 | true   |
        | 1.4.1   | ~1.4.2 | false  |
        | 1.5.0   | ~1.4.2 | false  |
        | 1.4.0   | ~1.4   | true   |

  Rule: R5. A caret range keeps the major, or the minor too when the major is 0
    `^V` holds for versions at least V with the same MAJOR as V. When V's
    MAJOR is 0, they must also have the same MINOR.

    @happy
    Scenario Outline: Caret
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version | range   | answer |
        | 1.9.0   | ^1.2.3  | true   |
        | 2.0.0   | ^1.2.3  | false  |
        | 0.2.9   | ^0.2.3  | true   |
        | 0.3.0   | ^0.2.3  | false  |

  Rule: R6. Wildcards
    `*` holds for every version. `M.x` holds for versions with MAJOR M,
    and `M.N.x` for versions with MAJOR M and MINOR N. `x` appears only as
    the last part of `M.x` or `M.N.x`. A wildcard takes no operator.
    Anything else that looks like a wildcard (`x`, `2.*`, `2.x.x`, `>2.x`,
    `~2.4.x`) is an invalid range.

    @happy
    Scenario Outline: Wildcards
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version | range | answer |
        | 7.1.3   | *     | true   |
        | 7.1.3   | 7.x   | true   |
        | 7.1.3   | 7.2.x | false  |

    @unhappy
    Scenario: An operator before a wildcard is invalid
      When I ask whether "7.1.3" satisfies ">7.x"
      Then it throws an error whose message contains "range"

  Rule: R7. Commas join with AND, bars with OR
    A range is one or more groups separated by `|`; it holds when any group
    holds. A group is one or more comparators separated by `,`; it holds
    when every comparator holds. Spaces are allowed around `,` and `|` and
    at the start and end of the range, and nowhere else. An empty
    comparator or group (as in `||`, a trailing `,`, or an empty range) is
    invalid, and so is a space inside a comparator.

    @happy
    Scenario Outline: Groups and comparators
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version | range                 | answer |
        | 1.5.0   | >=1.0 , <2.0          | true   |
        | 2.5.0   | >=1.0,<2.0            | false  |
        | 2.5.0   | >=1.0,<2.0 \| >=2.5    | true   |

    @unhappy
    Scenario Outline: Invalid ranges
      When I ask whether "1.5.0" satisfies "<range>"
      Then it throws an error whose message contains "range"

      Examples:
        | range          |
        | >=1.0 <2.0     |
        | =1.5 \|\| =2.0 |
        | >= 1.0         |
        | >=1.0,         |

  Rule: R8. A tagged version needs a tagged comparator of its own minor
    A version with a tag satisfies a group only when every comparator of
    the group holds and at least one comparator of that group names a
    version that has a tag and the same MAJOR and MINOR as the version
    being tested. Otherwise a tagged version satisfies no group, whatever
    the order says. A wildcard names no version.

    @happy
    Scenario Outline: Tagged versions
      When I ask whether "<version>" satisfies "<range>"
      Then the answer is <answer>

      Examples:
        | version    | range                     | answer |
        | 3.2.1:rc1  | >=3.2.0:a                 | true   |
        | 3.2.1:rc1  | >=3.2.0                   | false  |
        | 3.2.1:rc1  | >=3.1.0:a                 | false  |
        | 3.2.1:rc1  | *                         | false  |
        | 3.2.1:rc1  | >=3.2.0:a,<4.0.0          | true   |
        | 3.2.1:rc1  | >=3.2.0 \| >=3.2.0:a       | true   |

  Rule: R9. Errors name what is invalid
    An invalid version throws an `Error` whose message contains `version`.
    An invalid range throws an `Error` whose message contains `range`. The
    version is checked first, so when both are invalid the message
    contains `version`.

    @unhappy
    Scenario: Both invalid
      When I ask whether "1.2.3.4" satisfies "nonsense"
      Then it throws an error whose message contains "version"
```
