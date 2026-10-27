# Ignored paths

`isIgnored(gitignore, path)` says whether git ignores the file at `path`
under the rules of one `.gitignore` file at the root of a repository.
`gitignore` is the file's text, lines separated by `\n`. `path` is relative
to the root and separated by `/`; its last component is a file and every
other component a directory. Matching is case-sensitive.

1. **Blank lines and comments match nothing.** A blank line matches
   nothing. A line whose first character is `#` is a comment and matches
   nothing. A pattern that starts with a literal `#` is written `\#`. Only
   a `#` in the first column starts a comment: a line that starts with a
   space and then `#` is a pattern whose name starts with that space. A
   line of spaces only is blank (rule 2).
2. **Trailing spaces are dropped unless escaped.** Spaces at the end of a
   line are removed before it is read as a pattern. A space preceded by a
   backslash is kept, as a literal space, along with any spaces before it.
   Spaces elsewhere in a line are part of the pattern.
3. **A leading `!` negates a pattern.** When a negated pattern is the one
   that decides a path (rule 9), the path is not ignored. A pattern that
   starts with a literal `!` is written `\!`. A negated pattern that
   nothing earlier excluded changes nothing.
4. **A file in an excluded directory cannot be re-included.** A file is
   ignored when any of its parent directories is ignored, and no pattern
   can change that, not even a negated one naming the file. Directories
   are decided from the root down, each by the same rules as a path
   (rules 5 to 10) with the directory as the path: a directory inside an
   ignored directory is ignored. Only when no parent directory is ignored
   do the patterns decide the file itself.
5. **A trailing slash matches directories only.** A pattern that ends with
   `/` matches only directories. The slash is removed before rules 6 to 8
   are applied. Otherwise a pattern matches files and directories alike.
6. **A slash at the start or in the middle anchors a pattern.** After a
   trailing slash is removed, a pattern that still contains a `/` is
   matched against the whole path from the root, with a leading `/`
   dropped first. A pattern without a `/` is matched against the last
   component of the path, so it matches at any depth.
7. **Wildcards never cross a slash.** `*` matches any run of characters,
   empty included, except `/`. `?` matches exactly one character except
   `/`. `[...]` matches one character from the set, where `a-z` is a
   range, and `[!...]` or `[^...]` one character not in it; it never
   matches `/`. A `[` with no closing `]` is a literal `[`. A backslash
   makes the next character literal. Every other character matches
   itself.
8. **Two asterisks span directories only between slashes.** `**/` at the
   start of a pattern matches in every directory, the root included.
   `/**` at the end matches everything inside. `/**/` in the middle
   matches zero or more directories. Any other run of two or more
   asterisks is a single `*`, and a pattern of only `**` matches every
   path.
9. **The last matching pattern decides.** Patterns are read top to bottom,
   and the last one that matches the path decides it: ignored, or not
   ignored when that pattern is negated. A path no pattern matches is not
   ignored.
10. **A pattern that matches a directory ignores its contents.**
    Directories are matched by the same patterns as files, so a pattern
    without a slash that matches a directory's name, at any depth, makes
    that directory ignored and with it everything inside (rule 4).
