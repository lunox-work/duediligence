# Complement Interval Graph

Input

The input is given from Standard Input in the following format:
N
W_1 W_2 \cdots W_N
L_1 R_1
L_2 R_2
\vdots
L_N R_N
Q
s_1 t_1
s_2 t_2
\vdots
s_Q t_Q

Output

Print Q lines.
For each i = 1, 2, \ldots, Q, on the i-th line, if there exists a path from vertex s_i to vertex t_i, print the minimum possible weight of such a path, and print -1 otherwise.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
