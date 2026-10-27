# minimum-cost-to-divide-array-into-subarrays

Given two equal-length integer arrays, nums and cost, and an integer k, split the arrays into consecutive contiguous subarrays at the same positions. The i-th subarray (counting from 1), ending at index r, costs (the sum of nums from the start of the array through r, plus k times i) multiplied by the sum of cost over that subarray's own elements. Find the smallest possible total cost over all such splits.

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def minimumCost(self, nums: List[int], cost: List[int], k: int) -> int:
```
