# maximum-product-of-subsequences-with-an-alternating-sum-equal-to-k

You are given an integer array nums and two integers, k and limit. Your task is to find a non-empty subsequence of nums that:

Has an alternating sum equal to k.
Maximizes the product of all its numbers without the product exceeding limit.

Return the product of the numbers in such a subsequence. If no subsequence satisfies the requirements, return -1.
The alternating sum of a 0-indexed array is defined as the sum of the elements at even indices minus the sum of the elements at odd indices.

Constraints:

1 <= nums.length <= 150
0 <= nums[i] <= 12
-10^5 <= k <= 10^5
1 <= limit <= 5000

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def maxProduct(self, nums: List[int], k: int, limit: int) -> int:
```
