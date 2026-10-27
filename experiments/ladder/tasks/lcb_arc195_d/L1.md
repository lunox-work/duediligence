# Swap and Erase

There is a sequence A = (A_1,\ldots,A_N). You can perform the following two types of operations any number of times in any order:

- Let K be the length of A just before the operation. Choose an integer i such that 1 \leq i \leq K-1, and swap the i-th and (i+1)-th elements of A.
- Let K be the length of A just before the operation. Choose an integer i such that 1 \leq i \leq K and all the values from the 1-st through the i-th elements of A are equal, and delete all the elements from the 1-st through the i-th of A.

Find the minimum total number of operations required to make A an empty sequence.
You are given T test cases; solve each of them.

Input

The input is given from Standard Input in the following format:
T
\mathrm{case}_1
\mathrm{case}_2
\vdots
\mathrm{case}_T

Each case is given in the following format:
N
A_1 A_2 \ldots A_N

Output

Print the answer for each test case in order, separated by newlines.

Constraints


- 1\leq T\leq 10^5
- 2 \leq N \leq 2 \times 10^5
- 1 \leq A_i \leq N
- The sum of N over all test cases is at most 2\times 10^5.
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
