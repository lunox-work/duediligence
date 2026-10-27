# Flip Row or Col

There is a H \times W grid, and each cell contains 0 or 1. The cell at the i-th row from the top and the j-th column from the left contains an integer A_{i,j}.
You can perform the following two operations any number of times in any order:

- Operation X: Choose an integer x (1 \leq x \leq H). For every integer 1 \leq y \leq W, replace A_{x,y} with 1 - A_{x,y}.
- Operation Y: Choose an integer y (1 \leq y \leq W). For every integer 1 \leq x \leq H, replace A_{x,y} with 1 - A_{x,y}.

Find the minimum possible value of \displaystyle \sum_{x=1}^H\sum_{y=1}^W A_{x,y} after the process.

Input

The input is given from Standard Input in the following format:
H W
A_{1,1}A_{1,2}\ldots A_{1,W}
A_{2,1}A_{2,2}\ldots A_{2,W}
\vdots
A_{H,1}A_{H,2}\ldots A_{H,W}

Output

Print the answer.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
