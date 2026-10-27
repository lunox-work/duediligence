# Broken Wheel

A graph has N vertices arranged in a cycle plus one extra center vertex, and a given binary string decides which cycle vertices are also joined to the center. Every edge is given a direction, and each orientation produces a sequence of in-degrees, one per vertex. Count how many distinct in-degree sequences can arise over all orientations, modulo 998244353.

Input

The input is given from Standard Input in the following format:
N
s_0s_1\ldots s_{N-1}

Output

Print the answer.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
