# Path Decomposition of a Tree

Given a tree whose number of vertices is N times K, decide whether its vertices can be split into N disjoint groups of K vertices each. Each group must form a simple path in the tree, meaning its vertices can be ordered so that each consecutive pair is joined by a tree edge.

Input

The input is given from Standard Input in the following format:
N K
u_1 v_1
u_2 v_2
\vdots
u_{NK-1} v_{NK-1}

Output

If it is possible to decompose the tree into N paths each of length K, print Yes. Otherwise, print No.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
