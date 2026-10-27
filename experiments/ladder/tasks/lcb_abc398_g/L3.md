# Not Only Tree Game

We start with an undirected graph that has no odd-length cycle, and two players, Aoki first and then Takahashi, take turns adding a new edge between two vertices that aren't already joined. An edge can only be added if the graph still has no odd cycle afterward. The player who can't make a move loses, and the program must decide which player wins if both play optimally.

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
