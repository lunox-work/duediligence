# Patisserie ABC 3

There are several cakes, each with three non-negative integer scores: beauty, tastiness, and popularity. You must form a given number of disjoint pairs of cakes, where a pair's price is the largest of its summed beauty, summed tastiness, and summed popularity. Compute the maximum possible total price of the pairs, independently for each of several test cases.

Input

The input is given from Standard Input in the following format:
T
\mathrm{case}_1
\mathrm{case}_2
\vdots
\mathrm{case}_T

\mathrm{case}_i represents the i-th test case. Each test case is given in the following format:
N K
X_1 Y_1 Z_1
X_2 Y_2 Z_2
\vdots
X_N Y_N Z_N

Output

Print T lines. The i-th line (1\leq i\leq T) should contain the answer to the i-th test case.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
