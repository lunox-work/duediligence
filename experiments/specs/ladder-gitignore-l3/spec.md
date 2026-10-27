# Ignored paths

Implement `isIgnored(gitignore, path)`, which says whether git ignores a
file under the rules of a `.gitignore` file at the root of the repository.
The rules are gitignore's usual ones: glob patterns, `#` comments, `!` to
re-include, a trailing `/` for directories and a leading `/` to anchor a
pattern to the root.
