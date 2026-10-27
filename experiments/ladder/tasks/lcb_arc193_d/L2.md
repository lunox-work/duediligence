# Magnets

You are given two length-N strings A = A_1A_2 \ldots A_N and B = B_1B_2 \ldots B_N, each consisting of 0 and 1.
There are N squares aligned in a row from left to right. For i = 1, 2, \ldots, N, the i-th square from the left is called square i. Initially, square i contains a piece if A_i =  1, and no piece if A_i =  0.
You may repeat the following operation any number of times (possibly zero):

- Choose an integer i between 1 and N, inclusive.
- Move all pieces simultaneously one square closer to square i. That is, for each piece, let square j be its current position and square j' be its new position, and the following holds:
- if i < j, then j' = j-1;
- if i > j, then j' = j+1;
- if i = j, then j' = j.



Determine whether it is possible to reach a configuration satisfying the following condition, and if it is possible, find the minimum number of operations needed to do so:

For every i = 1, 2, \ldots, N, there is at least one piece in square i if and only if B_i =  1.

You are given T independent test cases. Print the answer for each of them.

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
