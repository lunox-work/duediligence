# Magnets

Pieces sit on some squares of a row, and in one operation you pick a square and every piece moves one step toward it, so pieces can merge as they move. Given the starting set of occupied squares and a target set of occupied squares, decide whether the target can be reached. If it can, find the minimum number of operations needed.

Input

The input is given from Standard Input in the following format:
T
\mathrm{case}_1
\mathrm{case}_2
\vdots
\mathrm{case}_T

Here, \mathrm{case}_i (i=1,2,\ldots,T) denotes the i-th test case.
Each test case is given in the following format:
N
A
B

Output

Print T lines.
For each i = 1, 2, \ldots, T, on the i-th line, print -1 if it is impossible to reach a configuration satisfying the condition for the i-th test case. Otherwise, print the minimum number of operations needed.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
