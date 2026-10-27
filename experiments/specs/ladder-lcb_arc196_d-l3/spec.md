# Roadway

Towns are arranged in a line with a road between each adjacent pair, and each road can be assigned an integer weight that is added to a traveler's stamina whenever they cross it. Each of several people walks directly from their start town to their destination town beginning with stamina 0, and requires their stamina to be exactly 0 on arrival and strictly positive at every town strictly between. For each query giving a contiguous range of people, determine whether some assignment of road weights satisfies the requirements of every person in that range simultaneously.

Input

The input is given from Standard Input in the following format:
N M Q
S_1 T_1
S_2 T_2
\vdots
S_M T_M
L_1 R_1
L_2 R_2
\vdots
L_Q R_Q

Output

Print Q lines.
The k-th line should contain Yes if there is a way to set the strengths of the roads so that the requirements of all people L_k, L_k + 1, \ldots, R_k are satisfied, and No otherwise.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
