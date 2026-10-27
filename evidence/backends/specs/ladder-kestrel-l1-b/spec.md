# Kestrel version ranges

Kestrel is a release tool with its own version and range syntax. It looks
like semantic versioning and is not: read every rule.
`satisfies(version, range)` says whether a kestrel version satisfies a
kestrel range, and throws an `Error` when either is not valid.

1. **A version is MAJOR.MINOR, optionally .PATCH, optionally :tag.**
   MAJOR, MINOR and PATCH are decimal numbers without leading zeros (`0`
   itself is allowed). A missing PATCH is 0, so `2.4` and `2.4.0` are the
   same version. A tag follows a colon and is one or more lowercase
   letters and digits, with nothing else in it. Nothing else is a version:
   no prefix, no spaces, no fourth number, no other separator before a
   tag, no empty or uppercase tag.
2. **Versions are ordered by numbers, then tags.** Versions compare by
   MAJOR, then MINOR, then PATCH, as numbers. With those equal, a version
   without a tag is greater than one with a tag. Two tags are split into
   runs of letters and runs of digits and compared run by run from the
   left: two digit runs as numbers, two letter runs by character code,
   and a digit run is lower than a letter run. When one tag runs out first
   and every run so far is equal, the shorter tag is lower. Versions equal
   in all of this are the same version.
3. **A comparator compares with one version.** `=V` holds for V itself,
   `>V`, `>=V`, `<V` and `<=V` as their symbols say, by the order of rule
   2. A version with no operator means `=V`. The operator is written
   directly before the version.
4. **A tilde range keeps the major and minor.** `~V` holds for versions at
   least V with the same MAJOR and MINOR as V.
5. **A caret range keeps the major, or the minor too when the major is
   0.** `^V` holds for versions at least V with the same MAJOR as V. When
   V's MAJOR is 0, they must also have the same MINOR.
6. **Wildcards.** `*` holds for every version. `M.x` holds for versions
   with MAJOR M, and `M.N.x` for versions with MAJOR M and MINOR N. `x`
   appears only as the last part of `M.x` or `M.N.x`. A wildcard takes no
   operator. Anything else that looks like a wildcard is an invalid range.
7. **Commas join with AND, bars with OR.** A range is one or more groups
   separated by `|`; it holds when any group holds. A group is one or more
   comparators separated by `,`; it holds when every comparator holds.
   Spaces are allowed around `,` and `|` and at the start and end of the
   range, and nowhere else. An empty comparator or group (as in `||`, a
   trailing `,`, or an empty range) is invalid, and so is a space inside a
   comparator.
8. **A tagged version needs a tagged comparator of its own minor.** A
   version with a tag satisfies a group only when every comparator of the
   group holds and at least one comparator of that group names a version
   that has a tag and the same MAJOR and MINOR as the version being
   tested. Otherwise a tagged version satisfies no group, whatever the
   order says. A wildcard names no version.
9. **Errors name what is invalid.** An invalid version throws an `Error`
   whose message contains `version`. An invalid range throws an `Error`
   whose message contains `range`. The version is checked first, so when
   both are invalid the message contains `version`.
