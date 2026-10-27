# Smooth Occlusion

There are two rows of N teeth, upper and lower, each tooth with a length, and the only allowed change is shortening any single tooth by 1 at a cost of 1. The goal is to reach a state where every upper-lower pair in the same position has the same total length, and adjacent upper teeth differ in length by at most a given value X. Compute the minimum total cost to reach such a state.

Input

The input is given from Standard Input in the following format:
N X
U _ 1 D _ 1
U _ 2 D _ 2
\vdots
U _ N D _ N

Output

Print the answer.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
