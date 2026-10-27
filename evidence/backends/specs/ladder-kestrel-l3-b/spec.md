# Kestrel version ranges

Implement `satisfies(version, range)` for kestrel, a semver-like scheme:
versions like `2.4.1:rc1` (a colon before the tag), and ranges built from
comparators such as `>=`, `~` and `^`, joined by `,` for AND and `|` for
OR.
