# maximize-subarrays-after-removing-one-conflicting-pair

Consider the array of integers 1 through n in order, along with a list of conflicting pairs of values. After removing exactly one pair from the list, count the non-empty contiguous subarrays that do not contain both values of any remaining pair. Return the largest such count you can get by choosing which pair to remove.

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def maxSubarrays(self, n: int, conflictingPairs: List[List[int]]) -> int:
```
