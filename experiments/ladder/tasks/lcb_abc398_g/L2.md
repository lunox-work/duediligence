# Not Only Tree Game

You are given a simple undirected graph with N vertices and M edges, with vertices labeled 1 to N and edges labeled 1 to M. The i-th edge connects vertices U_i and V_i. Initially, G does not contain an odd cycle.
Takahashi and Aoki will play a game using this graph G. With Aoki going first, they take turns performing the following operation:

- Choose a pair of integers (i,j) with 1 \leq i < j \leq N that satisfies both of the following conditions, then add an edge connecting vertices i and j to G.
- G does not already have an edge connecting vertices i and j.
- Adding an edge connecting vertices i and j does not create an odd cycle.



A player who cannot perform this operation loses, and the other player wins.
Determine who wins when both players play optimally.

What is an odd cycle?
A sequence of vertices (v_0,v_1,\ldots,v_k) of G is called an odd cycle if and only if all of the following conditions are satisfied:

- k is odd.
- v_0=v_k.
- For every 1\leq i \leq k, there is an edge connecting v_{i-1} and v_{i}.

Input

The input is given from Standard Input in the following format:
N M
U_1 V_1
U_2 V_2
\vdots
U_M V_M

Output

If Aoki (the first player) wins, print Aoki; otherwise, if Takahashi (the second player) wins, print Takahashi.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
