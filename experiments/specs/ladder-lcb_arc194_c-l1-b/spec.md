# Cost to Flip

You are given two integer sequences of length N, A = (A_1, A_2, \ldots, A_N) and B = (B_1, B_2, \ldots, B_N), each consisting of 0 and 1.
You can perform the following operation on A any number of times (possibly zero):

- First, choose an integer i satisfying 1 \leq i \leq N, and flip the value of A_i (if the original value is 0, change it to 1; if it is 1, change it to 0).
- Then, pay \sum_{k=1}^N A_k C_k yen as the cost of this operation.

Note that the cost calculation in step 2 uses the A after the change in step 1.
Print the minimum total cost required to make A identical to B.

Input

The input is given from Standard Input in the following format:
N
A_1 A_2 \ldots A_N
B_1 B_2 \ldots B_N
C_1 C_2 \ldots C_N

Output

Print the answer.

Constraints


- 1 \leq N \leq 2 \times 10^5
- A_i, B_i \in {0, 1}
- 1 \leq C_i \leq 10^6
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
