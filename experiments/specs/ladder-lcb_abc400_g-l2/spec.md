# Patisserie ABC 3

Takahashi, a patissier working at the ABC pastry shop, decided to sell assorted cakes to commemorate AtCoder Beginner Contest 400.
The shop sells N kinds of cakes: cake 1, cake 2, \ldots, cake N.
Each cake has three non-negative integer values: beauty, tastiness, and popularity. Specifically, cake i has beauty X_i, tastiness Y_i, and popularity Z_i.
He considers pairing up these cakes into K pairs without overlaps.
Formally, he will choose 2K distinct integers a_1,b_1,a_2,b_2,\ldots,a_K,b_K between 1 and N (inclusive), and pair cake a_i with cake b_i.
The price of a pair formed by cakes a_i and b_i is \max(X_{a_i} + X_{b_i},\, Y_{a_i} + Y_{b_i},\, Z_{a_i} + Z_{b_i}).
Here, \max(P,Q,R) denotes the greatest value among P,Q,R.
Find the maximum possible total price of the K pairs.
You are given T test cases; solve each of them.

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
