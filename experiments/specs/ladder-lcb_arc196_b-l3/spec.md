# Torus Loop

Each cell of a grid that wraps around like a torus holds a tile that can be rotated: one kind carries a segment joining the midpoints of two adjacent edges, and the other carries a segment joining the midpoints of two opposite edges. Placements are told apart only by the pattern of segments they produce. Count, modulo 998244353, the placements in which every edge shared by two neighboring cells, including edges that wrap around, is touched by a segment from both sides or from neither, so that no segment has a dead end.

Input

The input is given from Standard Input in the following format:
T
case_1
case_2
\vdots
case_T

Each case is given in the following format:
H W
S_0
S_1
\vdots
S_{H-1}

Output

For each test case, print the number, modulo 998244353, of placements that satisfies the condition, in separate lines.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
