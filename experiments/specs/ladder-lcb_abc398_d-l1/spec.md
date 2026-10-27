# Bonfire

There is an infinitely large two-dimensional grid, with a campfire at coordinate (0,0).
At time t=0, smoke exists only at cell (0,0).
You are given a length-N string S consisting of N, W, S, E. At times t=1,2,\dots,N, the following happen in order:

- Wind blows, and all the smoke present at that time moves as follows:
- If the t-th character of S is N, smoke in cell (r,c) moves to cell (r-1,c).
- If it is W, smoke in cell (r,c) moves to cell (r,c-1).
- If it is S, smoke in cell (r,c) moves to cell (r+1,c).
- If it is E, smoke in cell (r,c) moves to cell (r,c+1).


- If there is no smoke in cell (0,0), new smoke is generated at cell (0,0).

Takahashi is standing at cell (R,C).
For each integer 1 \le t \le N, determine if smoke exists at cell (R,C) at time t+0.5, and print the response according to the required format.

Input

The input is given from Standard Input in the following format:
N R C
S

Output

Print an N-character string consisting of 0 and 1.
The t-th character (1 \le t \le N) should be:

- 1 if smoke exists at cell (R,C) at time t+0.5, and
- 0 otherwise.

Constraints


- N is an integer between 1 and 200000, inclusive.
- S is a length N string consisting of N, W, S, E.
- R and C are integers between -N and N, inclusive.
- (R,C) \neq (0,0)

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
