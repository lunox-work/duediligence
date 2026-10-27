# Smooth Occlusion

Takahashi has 2N teeth: N upper teeth and N lower teeth.
The length of the i-th upper tooth from the left (1 \leq i \leq N) is U _ i, and the length of the i-th lower tooth from the left (1 \leq i \leq N) is D _ i.
His teeth are said to “fit together well” if both of the following conditions are satisfied:

- There exists an integer H such that U _ i + D _ i = H for every integer i with 1 \leq i \leq N.
- \lvert U _ i - U _ {i+1} \rvert \leq X for every integer i with 1 \leq i < N.

He can perform the following operation any number of times:

- Pay 1 yen to use a tooth-grinding machine, choose exactly one tooth whose length is positive, and reduce its length by 1.

No other method may be used to change the lengths of the teeth.
Find the minimum total amount of money he needs to pay to make his teeth fit together well.

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
