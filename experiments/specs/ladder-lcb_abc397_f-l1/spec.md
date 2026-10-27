# Variety Split Hard

This problem is a harder version of Problem C. Here, the sequence is split into three subarrays.

You are given an integer sequence of length N: A = (A_1, A_2, \ldots, A_N).
When splitting A at two positions into three non-empty (contiguous) subarrays, find the maximum possible sum of the counts of distinct integers in those subarrays.
More formally, find the maximum sum of the following three values for a pair of integers (i,j) such that 1 \leq i < j \leq N-1: the count of distinct integers in (A_1, A_2, \ldots, A_i), the count of distinct integers in (A_{i+1},A_{i+2},\ldots,A_j), and the count of distinct integers in (A_{j+1},A_{j+2},\ldots,A_{N}).

Input

The input is given from Standard Input in the following format:
N
A_1 A_2 \ldots A_N

Output

Print the answer.

Constraints


- 3 \leq N \leq 3 \times 10^5
- 1 \leq A_i \leq N (1 \leq i \leq N)
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
