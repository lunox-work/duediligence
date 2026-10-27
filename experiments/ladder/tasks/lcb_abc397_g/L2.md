# Maximize Distance

You are given a directed graph with N vertices and M edges. The vertices are numbered 1,2,\dots,N. Edge j (j=1,2,\dots,M) goes from vertex u_j to vertex v_j. It is guaranteed that vertex N is reachable from vertex 1.
Initially, all edges have weight 0. We choose exactly K out of the M edges and change their weights to 1. Find the maximum possible value of the shortest distance from vertex 1 to vertex N in the resulting graph.

Input

The input is given from Standard Input in the following format:
N M K
u_1 v_1
u_2 v_2
\vdots
u_M v_M

Output

Print the answer.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
