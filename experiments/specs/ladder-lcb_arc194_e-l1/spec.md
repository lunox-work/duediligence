# Swap 0^X and 1^Y

You are given two strings S and T, each of length N and consisting of 0 and 1, as well as two positive integers X and Y. For i = 1, 2, \ldots, N, let S_i denote the i-th character of S.
Determine whether it is possible to make S identical to T by repeatedly performing Operations A and B below any number of times (possibly zero) in any order:

- 
(Operation A) Choose an integer i satisfying 1 \leq i \leq N-(X+Y)+1, S_{i} = S_{i+1} = \cdots = S_{i+X-1} = 0, and S_{i+X} = S_{i+X+1} = \cdots = S_{i+X+Y-1} = 1, then change each of S_{i}, S_{i+1}, \ldots, S_{i+Y-1} to 1 and each of S_{i+Y}, S_{i+Y+1}, \ldots, S_{i+Y+X-1} to 0.

- 
(Operation B) Choose an integer i satisfying 1 \leq i \leq N-(X+Y)+1, S_{i} = S_{i+1} = \cdots = S_{i+Y-1} = 1, and S_{i+Y} = S_{i+Y+1} = \cdots = S_{i+Y+X-1} = 0, then change each of S_{i}, S_{i+1}, \ldots, S_{i+X-1} to 0 and each of S_{i+X}, S_{i+X+1}, \ldots, S_{i+X+Y-1} to 1.

Input

The input is given from Standard Input in the following format:
N X Y
S
T

Output

If it is possible to make S identical to T, print Yes; otherwise, print No.

Constraints


- 1 \leq N \leq 5 \times 10^5
- 1 \leq X, Y \leq N
- S and T are strings of length N consisting of 0 and 1.
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
