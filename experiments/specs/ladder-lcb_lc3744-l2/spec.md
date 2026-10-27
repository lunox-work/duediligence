# minimum-operations-to-make-array-elements-zero

You are given a 2D array queries, where queries[i] is of the form [l, r]. Each queries[i] defines an array of integers nums consisting of elements ranging from l to r, both inclusive.
In one operation, you can:

Select two integers a and b from the array.
Replace them with floor(a / 4) and floor(b / 4).

Your task is to determine the minimum number of operations required to reduce all elements of the array to zero for each query. Return the sum of the results for all queries.

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def minOperations(self, queries: List[List[int]]) -> int:
```
