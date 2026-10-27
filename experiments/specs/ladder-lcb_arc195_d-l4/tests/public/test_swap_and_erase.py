# Public tests for "Swap and Erase" (AtCoder ARC195 D).
#
# spec.md gives only the input/output format. The problem it names: given
# A, repeatedly either swap two adjacent elements, or delete a prefix
# A_1..A_i whose values are all equal; print the minimum number of
# operations that empties A. Constraints: 2 <= N <= 2*10^5,
# 1 <= A_i <= N, sum of N <= 2*10^5.
#
# Expected values come from the reasoning stated per test or from
# `brute`, a breadth-first search over every reachable sequence using
# exactly those two operations (only feasible for tiny N).
import itertools
import unittest
from collections import deque

from sandbox.check import run_case


def brute(a):
    """Fewest operations to empty `a`, by BFS over all reachable sequences."""
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
            nexts.append(s[i + 1:])
            i += 1
        for t in nexts:
            if t not in dist:
                dist[t] = d + 1
                queue.append(t)


def stdin_for(arrays):
    lines = [str(len(arrays))]
    for a in arrays:
        lines.append(str(len(a)))
        lines.append(" ".join(map(str, a)))
    return "\n".join(lines) + "\n"


def expected_for(arrays):
    return "\n".join(str(brute(a)) for a in arrays)


class TestSwapAndErase(unittest.TestCase):
    def test_sample_cases(self):
        # First two cases of the statement's sample; both also confirmed
        # by `brute`. 1 1 2 1 2: swap to 1 1 1 2 2, delete twice -> 3.
        # 4 2 1 3: four distinct values need four deletions -> 4.
        run_case(self, stdin="2\n5\n1 1 2 1 2\n4\n4 2 1 3\n", expected="3\n4")

    def test_smallest_equal_pair(self):
        # One deletion removes both equal elements.
        run_case(self, stdin="1\n2\n1 1\n", expected="1")

    def test_smallest_distinct_pair(self):
        # A deletion removes one value only, so two distinct values need
        # two deletions, which suffice.
        run_case(self, stdin="1\n2\n2 1\n", expected="2")

    def test_max_value_equals_n(self):
        # A_i may be as large as N.
        run_case(self, stdin="1\n2\n2 2\n", expected="1")

    def test_exhaustive_n_up_to_4(self):
        # Every array with 2 <= N <= 4 and 1 <= A_i <= N, as one input;
        # expected answers by `brute`.
        arrays = [list(a) for n in range(2, 5)
                  for a in itertools.product(range(1, n + 1), repeat=n)]
        run_case(self, stdin=stdin_for(arrays), expected=expected_for(arrays))

    def test_exhaustive_n_5(self):
        # Every array with N = 5 and 1 <= A_i <= 5; expected by `brute`.
        arrays = [list(a) for a in itertools.product(range(1, 6), repeat=5)]
        run_case(self, stdin=stdin_for(arrays), expected=expected_for(arrays))

    def test_alternating_small(self):
        # Alternating two values, N = 6..8; expected by `brute`.
        arrays = [[1 + i % 2 for i in range(n)] for n in range(6, 9)]
        run_case(self, stdin=stdin_for(arrays), expected=expected_for(arrays))

    def test_largest_all_equal(self):
        # N at its maximum, every element the maximum value N: the whole
        # array is one equal prefix, deleted in one operation.
        n = 200000
        run_case(self, stdin=f"1\n{n}\n" + " ".join([str(n)] * n) + "\n",
                 expected="1")

    def test_largest_all_distinct(self):
        # N distinct values: each deletion removes a single value, so at
        # least N operations; deleting front to back uses exactly N.
        n = 200000
        run_case(self, stdin=f"1\n{n}\n" + " ".join(map(str, range(n, 0, -1))) + "\n",
                 expected=str(n))

    def test_many_small_cases(self):
        # 50000 cases of N = 2 (sum of N = 10^5), alternating "1 1" -> 1
        # and "1 2" -> 2, as in the pair tests above.
        t = 50000
        parts = [str(t)]
        answers = []
        for k in range(t):
            parts.append("2")
            if k % 2 == 0:
                parts.append("1 1")
                answers.append("1")
            else:
                parts.append("1 2")
                answers.append("2")
        run_case(self, stdin="\n".join(parts) + "\n", expected="\n".join(answers))


if __name__ == "__main__":
    unittest.main()
