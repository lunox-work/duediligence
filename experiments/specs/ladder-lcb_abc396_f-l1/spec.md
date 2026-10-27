# Rotated Inversions

You are given integers N, M and a length-N sequence of non-negative integers A = (A_1, A_2, \ldots, A_N).
For k = 0, 1, \ldots, M-1, solve the following problem:

Define an integer sequence B = (B_1, B_2, \ldots, B_N) so that B_i is the remainder of A_i + k when divided by M. Find the inversion number in B.


What is the inversion number?
The inversion number of a sequence (A_1, A_2, \dots, A_N) is the number of integer pairs (i, j) satisfying 1 \le i < j \le N and A_i > A_j.

Input

The input is given from Standard Input in the following format:
N M
A_1 A_2 \ldots A_N

Output

Print M lines.
The i-th line (1 \le i \le M) should contain the answer for the case k = i-1.

Constraints


- 1 \le N,M \le 2\times 10^5
- 0 \le A_i < M
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
