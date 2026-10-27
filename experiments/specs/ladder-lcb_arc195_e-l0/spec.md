# Random Tree Distance

There is an integer sequence A = (A_2,A_3,\ldots,A_N). Also, for an integer sequence P=(P_2, P_3, \ldots ,P_N) where 1 \leq P_i \leq i-1 for each i (2 \leq i \leq N), define the weighted tree T(P) with N vertices, rooted at vertex 1, as follows:

- A rooted tree where, for each i (2 \leq i \leq N), the parent of i is P_i, and the weight of the edge between i and P_i is A_i.

You are given Q queries. Process them in order. The i-th query is as follows:

- You are given integers u_i and v_i, each between 1 and N. For each of the possible (N-1)! sequences P, take the tree T(P) and consider the distance between vertices u_i and v_i in this tree. Output the sum, modulo 998244353, of these distances over all T(P). Here, the distance between two vertices u_i and v_i is the sum of the weights of the edges on the unique path (not visiting the same vertex more than once) that connects them.

Input

The input is given from Standard Input in the following format:
N Q
A_2 A_3 \ldots A_N
u_1 v_1
u_2 v_2
\vdots
u_Q v_Q

Output

Print Q lines. The i-th line should contain the answer to the i-th query.

Constraints


- 2 \leq N \leq 2 \times 10^5
- 1 \leq Q \leq 2 \times 10^5
- 1 \leq A_i \leq 10^9
- 1 \leq u_i < v_i \leq N
- All input values are integers.

Sample Input 1

3 2
1 1
1 2
1 3

Sample Output 1

2
3


- If P = (1,1), then in the tree T(P), the distance between vertices 1 and 2 is 1, and the distance between vertices 1 and 3 is 1.
- If P = (1,2), then in the tree T(P), the distance between vertices 1 and 2 is 1, and the distance between vertices 1 and 3 is 2.

Therefore, the total distance between vertices 1 and 2 over all T(P) is 2, and the total distance between vertices 1 and 3 over all T(P) is 3.

Sample Input 2

2 1
100
1 2

Sample Output 2

100

Sample Input 3

9 6
765689282 93267307 563699854 951829154 801512848 389123318 924504746 596035433
3 8
2 5
5 8
2 9
8 9
5 7

Sample Output 3

55973424
496202632
903509579
343265517
550981449
68482696

Remember to take the sum modulo 998244353.

## Format

Read the inputs from stdin solve the problem and write the answer to stdout (do not directly test on the sample inputs). Enclose your code within delimiters as follows. Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT.
