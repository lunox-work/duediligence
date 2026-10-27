# Kestrel version ranges

Kestrel is a release tool with its own version and range syntax.
`satisfies(version, range)` says whether a kestrel version satisfies a
kestrel range.

- Versions look like `2.4.1`, with an optional tag after a colon:
  `2.4.1:rc1`. A tagged version comes before the release without the tag.
- A range is made of comparators: `=`, `>`, `>=`, `<` and `<=` before a
  version, and a bare version means `=`.
- `~V` means at least V within the same major and minor. `^V` means at
  least V within the same major.
- Wildcards: `*`, `2.x` and `2.4.x`.
- Comparators joined by `,` must all hold. Groups separated by `|` are
  alternatives.
- A tagged version only matches a range that mentions a tag.
- Invalid input throws an `Error`.
