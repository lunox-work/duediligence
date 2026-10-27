import unittest
from collections import deque

from sandbox.check import run_case


def brute(a):
    """Exact minimum by breadth-first search over every reachable sequence,
    applying both operations exactly as the statement defines them. Only
    used on tiny inputs."""
    start = tuple(a)
    dist = {start: 0}
    queue = deque([start])
    while queue:
        s = queue.popleft()
        d = dist[s]
        if not s:
            return d
        nexts = []
        for i in range(len(s) - 1):
            t = list(s)
            t[i], t[i + 1] = t[i + 1], t[i]
            nexts.append(tuple(t))
        i = 0
        while i < len(s) and s[i] == s[0]:
            i += 1
            nexts.append(s[i:])
        for t in nexts:
            if t not in dist:
                dist[t] = d + 1
                queue.append(t)


def make_input(cases):
    lines = [str(len(cases))]
    for a in cases:
        lines.append(str(len(a)))
        lines.append(" ".join(map(str, a)))
    return "\n".join(lines) + "\n"


def brute_case(tc, cases):
    run_case(tc, stdin=make_input(cases),
             expected="\n".join(str(brute(a)) for a in cases) + "\n")


class TestSwapAndErase(unittest.TestCase):
    # The statement gives no samples; expected values below come from the
    # brute force above or from the reasoning written next to the case.

    def test_mixed_small_cases_brute_force(self):
        # Expected by BFS: 3, 4, 8.
        brute_case(self, [[1, 1, 2, 1, 2], [4, 2, 1, 3],
                          [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]])

    def test_smallest_n_equal(self):
        # One deletion of the whole sequence suffices; at least one is needed.
        run_case(self, stdin="1\n2\n1 1\n", expected="1\n")

    def test_smallest_n_distinct(self):
        # Each deletion removes only equal values, so two distinct values
        # need at least two deletions; deleting front then back gives 2.
        run_case(self, stdin="1\n2\n1 2\n", expected="2\n")

    def test_smallest_n_max_value(self):
        # A_i = N = 2 is the largest value allowed; all equal, so 1.
        run_case(self, stdin="1\n2\n2 2\n", expected="1\n")

    def test_smallest_n_descending(self):
        # Same argument as 1 2: two distinct values, answer 2.
        run_case(self, stdin="1\n2\n2 1\n", expected="2\n")

    def test_alternating_three(self):
        # Expected by BFS: 3.
        brute_case(self, [[1, 2, 1]])

    def test_alternating_four(self):
        # Expected by BFS: 3 (one swap merges two runs).
        brute_case(self, [[2, 1, 2, 1]])

    def test_all_size_three_and_four_sequences(self):
        # Every sequence with N = 3 and N = 4 and 1 <= A_i <= N, as one
        # multi-case input; expected by BFS.
        from itertools import product
        cases = [list(p) for n in (3, 4)
                 for p in product(range(1, n + 1), repeat=n)]
        brute_case(self, cases)

    def test_max_n_all_equal(self):
        # N = 2*10^5, all elements equal: one deletion removes everything.
        n = 200000
        run_case(self, stdin="1\n%d\n%s\n" % (n, " ".join(["1"] * n)),
                 expected="1\n")

    def test_max_n_all_max_value(self):
        # Every element equals N, the largest allowed value: answer 1.
        n = 200000
        run_case(self, stdin="1\n%d\n%s\n" % (n, " ".join([str(n)] * n)),
                 expected="1\n")

    def test_max_n_permutation(self):
        # N distinct values: each deletion removes one value only, so at
        # least N operations; deleting the first element N times gives N.
        n = 200000
        a = " ".join(str(n - i) for i in range(n))
        run_case(self, stdin="1\n%d\n%s\n" % (n, a), expected="%d\n" % n)

    def test_max_t(self):
        # T = 10^5 cases of N = 2 (sum of N = 2*10^5), alternating 1 1 and
        # 1 2; answers 1 and 2 by the N = 2 reasoning above.
        t = 100000
        parts = [str(t)]
        out = []
        for k in range(t):
            if k % 2 == 0:
                parts.append("2\n1 1")
                out.append("1")
            else:
                parts.append("2\n1 2")
                out.append("2")
        run_case(self, stdin="\n".join(parts) + "\n",
                 expected="\n".join(out) + "\n")


if __name__ == "__main__":
    unittest.main()
