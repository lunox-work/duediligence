# Random Tree Distance

Vertices 1 through N form a rooted tree in which each vertex i other than the root picks its parent from among vertices 1 to i−1, and the edge from i to its parent has a fixed weight A_i. Every possible choice of parents gives one tree. For each query pair of vertices (u, v), find the distance between u and v in each such tree (the sum of edge weights on the path between them), add these distances up over all the trees, and report the total modulo 998244353.

Input

The input is given from Standard Input in the following format:
N Q
A_2 A_3 \ldots A_N
u_1 v_1
u_2 v_2
\vdots
u_Q v_Q

Output

Print Q lines. The i-th line should contain the answer to the i-th query.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
