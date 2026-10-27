# Complement Interval Graph

For integers l, r, let [l, r] denote the set of all integers from l through r. That is, [l, r] = \lbrace l, l+1, l+2, \ldots, r-1, r\rbrace.
You are given N pairs of integers (L_1, R_1), (L_2, R_2), \ldots, (L_N, R_N).
Based on these pairs, consider an undirected graph G defined as follows:

- It has N vertices numbered 1, 2, \ldots, N.
- For all i, j \in [1, N], there is an undirected edge between vertices i and j if and only if the intersection of [L_i, R_i] and [L_j, R_j] is empty.

In addition, for each i = 1, 2, \ldots, N, define the weight of vertex i to be W_i.
You are given Q queries about G. Process these queries in the order they are given.
For each i = 1, 2, \ldots, Q, the i-th query is the following:

You are given integers s_i and t_i (both between 1 and N, inclusive) such that s_i \neq t_i. Determine whether there exists a path from vertex s_i to vertex t_i in G. If it exists, print the minimum possible weight of such a path.

Here, the weight of a path from vertex s to vertex t is defined as the sum of the weights of the vertices on that path (including both endpoints s and t).

Input

The input is given from Standard Input in the following format:
N
W_1 W_2 \cdots W_N
L_1 R_1
L_2 R_2
\vdots
L_N R_N
Q
s_1 t_1
s_2 t_2
\vdots
s_Q t_Q

Output

Print Q lines.
For each i = 1, 2, \ldots, Q, on the i-th line, if there exists a path from vertex s_i to vertex t_i, print the minimum possible weight of such a path, and print -1 otherwise.

Constraints


- 2 \leq N \leq 2 \times 10^5
- 1 \leq Q \leq 2 \times 10^5
- 1 \leq W_i \leq 10^9
- 1 \leq L_i \leq R_i \leq 2N
- 1 \leq s_i, t_i \leq N
- s_i \neq t_i
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
