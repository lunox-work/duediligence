# Strongly Connected

Vertices 1 through 2N lie on a directed path with an edge from each vertex to the next, and each vertex is colored white or black, with N of each color. Every vertex is matched into pairs of one white and one black vertex, and each pair adds a directed edge from its white vertex to its black vertex. Count the number of such pairings for which the resulting directed graph is strongly connected.

Input

The input is given from Standard Input in the following format:
N
S

Output

Print the number, modulo 998244353, of ways to partition the vertices into N pairs so that the final graph is strongly connected.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
