# Ringo's Favorite Numbers 3

A positive integer N is a 400 number if and only if it satisfies both of the following two conditions:

- N has exactly 2 distinct prime factors.
- For each prime factor p of N, p divides N an even number of times. More formally, the maximum non-negative integer k such that p^k divides N is even.

Process Q queries. Each query gives you an integer A, so find the largest 400 number not exceeding A. Under the constraints of this problem, a 400 number not exceeding A always exists.

Input

The input is given from Standard Input in the following format:
Q
\text{query}_1
\text{query}_2
\vdots
\text{query}_Q

Here, \text{query}_i is the i-th query, given in the following format:
A

Output

Print Q lines. The i-th line should contain the answer to the i-th query.

Constraints


- 1 \leq Q \leq 2 \times 10^5
- For each query, 36 \leq A \leq 10^{12}.
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
