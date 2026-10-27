# longest-common-prefix-of-k-strings-after-removal

Given a list of strings and a number k, the program considers each string in turn and imagines removing it from the list. For each removal, it must find the greatest length of a prefix that at least k of the remaining strings (taken from different positions) share. The output is one such length for every position in the list.

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def longestCommonPrefix(self, words: List[str], k: int) -> List[int]:
```
