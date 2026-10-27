# longest-common-prefix-of-k-strings-after-removal

You are given an array of strings words and an integer k.
For each index i in the range [0, words.length - 1], find the length of the longest common prefix among any k strings (selected at distinct indices) from the remaining array after removing the i^th element.
Return an array answer, where answer[i] is the answer for i^th element. If removing the i^th element leaves the array with fewer than k strings, answer[i] is 0.

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def longestCommonPrefix(self, words: List[str], k: int) -> List[int]:
```
