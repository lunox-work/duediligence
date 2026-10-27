# Bonfire

On an infinite grid, a campfire at the origin has smoke on it at the start, and a string of compass directions describes the wind at each successive time step. At each step, all existing smoke shifts one cell in that step's direction, and then new smoke appears at the origin if none is there. For every time step, the program must decide whether a given fixed cell contains smoke right after that step.

Input

The input is given from Standard Input in the following format:
N R C
S

Output

Print an N-character string consisting of 0 and 1.
The t-th character (1 \le t \le N) should be:

- 1 if smoke exists at cell (R,C) at time t+0.5, and
- 0 otherwise.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
