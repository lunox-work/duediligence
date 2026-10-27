# Range Power Sum

You are given positive integers N, K, and an integer sequence of length N: A = (A_1, A_2, \dots, A_N).
Find \displaystyle \sum_{1\leq l\leq r\leq N} \Bigg(\sum_{l\leq i\leq r} A_i\Bigg)^K, modulo 998244353.

Input

The input is given from Standard Input in the following format:
N K
A_1 A_2 \dots A_N

Output

Print the answer.

Constraints


- 1\leq N \leq 2\times 10^5
- 1\leq K \leq 10
- 0 \leq A_i < 998244353
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
