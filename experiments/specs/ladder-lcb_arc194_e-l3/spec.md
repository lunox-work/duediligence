# Swap 0^X and 1^Y

Given two binary strings S and T of equal length and two positive integers X and Y, decide whether S can be transformed into T. The only allowed moves swap a block of exactly X consecutive 0s with an adjacent block of exactly Y consecutive 1s: a run of X zeros immediately followed by Y ones may become Y ones followed by X zeros, and the reverse. These moves may be applied any number of times in any order, and the program must answer whether T is reachable.

Input

The input is given from Standard Input in the following format:
N X Y
S
T

Output

If it is possible to make S identical to T, print Yes; otherwise, print No.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
