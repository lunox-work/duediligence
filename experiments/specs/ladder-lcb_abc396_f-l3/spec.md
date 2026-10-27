# Rotated Inversions

Given a sequence of non-negative integers and a modulus M, for every shift k from 0 to M-1 form a new sequence by adding k to each element and taking the result modulo M. For each shift, report the inversion number of the resulting sequence, meaning the number of index pairs where an earlier element is strictly greater than a later one.

Input

The input is given from Standard Input in the following format:
N M
A_1 A_2 \ldots A_N

Output

Print M lines.
The i-th line (1 \le i \le M) should contain the answer for the case k = i-1.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
