# Ignored paths

`isIgnored(gitignore, path)` says whether git ignores the file at `path`
under the rules of one `.gitignore` file at the root of a repository.
`gitignore` is the file's text, one pattern per line. `path` is relative
to the root and separated by `/`; its last component is a file and every
other component a directory.

- Blank lines and lines starting with `#` are comments.
- A pattern starting with `!` is negated: it re-includes a path that an
  earlier pattern excluded.
- A pattern ending with `/` matches only directories.
- A pattern with a `/` at the start or in the middle is relative to the
  root of the repository. Otherwise it matches a name at any level.
- Patterns use shell glob wildcards: `*`, `?` and `[...]`. `**` matches
  across directories.
- A pattern that matches a directory ignores everything inside it.
