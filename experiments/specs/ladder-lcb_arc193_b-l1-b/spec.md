# Broken Wheel

You are given a positive integer N and a length-N string s_0s_1\ldots s_{N-1} consisting only of 0 and 1.
Consider a simple undirected graph G with (N+1) vertices numbered 0, 1, 2, \ldots, N, and the following edges:

- For each i = 0, 1, \ldots, N-1, there is an undirected edge between vertices i and (i+1)\bmod N.
- For each i = 0, 1, \ldots, N-1, there is an undirected edge between vertices i and N if and only if s_i =  1.
- There are no other edges.

Furthermore, create a directed graph G' by assigning a direction to each edge of G. That is, for each undirected edge \lbrace u, v \rbrace in G, replace it with either a directed edge (u, v) from u to v or a directed edge (v, u) from v to u.
For each i = 0, 1, \ldots, N, let d_i be the in-degree of vertex i in G'. Print the number, modulo 998244353, of distinct sequences (d_0, d_1, \ldots, d_N) that can be obtained.

Input

The input is given from Standard Input in the following format:
N
s_0s_1\ldots s_{N-1}

Output

Print the answer.

Constraints


- 3 \leq N \leq 10^6
- N is an integer.
- Each s_i is 0 or 1.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
