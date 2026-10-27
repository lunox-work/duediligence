# Flip Edge

You are given a directed graph with N vertices and M edges.
The i-th edge (1 \leq i \leq M) is a directed edge from vertex u _ i to vertex v _ i.
Initially, you are at vertex 1. You want to repeat the following operations until you reach vertex N:

- Perform one of the two operations below:
- Move along a directed edge from your current vertex. This incurs a cost of 1. More precisely, if you are at vertex v, choose a vertex u such that there is a directed edge from v to u, and move to vertex u.
- Reverse the direction of all edges. This incurs a cost of X. More precisely, if and only if there was a directed edge from v to u immediately before this operation, there is a directed edge from u to v immediately after this operation.



It is guaranteed that, for the given graph, you can reach vertex N from vertex 1 by repeating these operations.
Find the minimum total cost required to reach vertex N.

Input

The input is given from Standard Input in the following format:
N M X
u _ 1 v _ 1
u _ 2 v _ 2
\vdots
u _ M v _ M

Output

Print the minimum total cost required to reach vertex N.

Constraints


- 2 \leq N \leq 2 \times 10^5
- 1 \leq M \leq 2 \times 10^5
- 1 \leq X \leq 10^9
- 1 \leq u _ i \leq N \ (1 \leq i \leq M)
- 1 \leq v _ i \leq N \ (1 \leq i \leq M)
- For the given graph, it is guaranteed that you can reach vertex N from vertex 1 by the operations described.
- All input values are integers.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
