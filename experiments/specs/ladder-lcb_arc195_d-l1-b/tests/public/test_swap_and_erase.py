import itertools
import unittest
from collections import deque

from sandbox.check import run_case


def brute_force(a):
    """Minimum operations by breadth-first search over every reachable
    sequence: each state's neighbours are every adjacent swap and every
    deletion of an all-equal prefix, exactly the two operations of the
    statement. Only usable for tiny N."""
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
    raise AssertionError("empty sequence unreachable")


def exhaustive_case(n):
    """Every sequence of length n with values in 1..n, as one input, with
    answers from brute_force."""
    seqs = list(itertools.product(range(1, n + 1), repeat=n))
    lines = [str(len(seqs))]
    answers = []
    for seq in seqs:
        lines.append(str(n))
        lines.append(" ".join(map(str, seq)))
        answers.append(str(brute_force(seq)))
    return "\n".join(lines) + "\n", "\n".join(answers) + "\n"


class TestSwapAndErase(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="3\n5\n1 1 2 1 2\n4\n4 2 1 3\n11\n1 2 1 2 1 2 1 2 1 2 1\n",
            expected="3\n4\n8\n",
        )

    # N = 2 by hand: equal values go in one deletion; distinct values need
    # two deletions (each deletion removes elements of a single value).
    def test_smallest_equal(self):
        run_case(self, stdin="1\n2\n1 1\n", expected="1\n")

    def test_smallest_distinct(self):
        run_case(self, stdin="1\n2\n1 2\n", expected="2\n")

    def test_smallest_max_value(self):
        # A_i = N = 2 is the largest allowed value.
        run_case(self, stdin="1\n2\n2 2\n", expected="1\n")

    def test_smallest_distinct_reversed(self):
        run_case(self, stdin="1\n2\n2 1\n", expected="2\n")

    # Exhaustive over all sequences of length 2..5 with values 1..N,
    # expected answers computed by brute_force above.
    def test_exhaustive_n2(self):
        stdin, expected = exhaustive_case(2)
        run_case(self, stdin=stdin, expected=expected)

    def test_exhaustive_n3(self):
        stdin, expected = exhaustive_case(3)
        run_case(self, stdin=stdin, expected=expected)

    def test_exhaustive_n4(self):
        stdin, expected = exhaustive_case(4)
        run_case(self, stdin=stdin, expected=expected)

    def test_exhaustive_n5(self):
        stdin, expected = exhaustive_case(5)
        run_case(self, stdin=stdin, expected=expected)

    # Large cases at sum N = 2 * 10^5.
    def test_max_all_equal(self):
        # One deletion removes everything; at least one operation is needed.
        n = 200000
        run_case(self, stdin=f"1\n{n}\n" + " ".join([str(n)] * n) + "\n",
                 expected="1\n")

    def test_max_all_distinct(self):
        # Every deletion removes a run of one value, so with N distinct
        # values at least N deletions are needed; deleting the first
        # element N times achieves it.
        n = 200000
        run_case(self, stdin=f"1\n{n}\n" + " ".join(map(str, range(1, n + 1))) + "\n",
                 expected=f"{n}\n")

    def test_max_two_blocks(self):
        # Two values need at least two deletions; each block is a prefix
        # in turn, so two suffice.
        n = 200000
        a = ["1"] * (n // 2) + ["2"] * (n // 2)
        run_case(self, stdin=f"1\n{n}\n" + " ".join(a) + "\n", expected="2\n")

    def test_max_t(self):
        # T = 10^5 cases of N = 2, alternating (1 1) -> 1 and (1 2) -> 2
        # as derived for the N = 2 cases above.
        t = 100000
        cases = []
        answers = []
        for k in range(t):
            if k % 2 == 0:
                cases.append("2\n1 1")
                answers.append("1")
            else:
                cases.append("2\n1 2")
                answers.append("2")
        run_case(self, stdin=f"{t}\n" + "\n".join(cases) + "\n",
                 expected="\n".join(answers) + "\n")


if __name__ == "__main__":
    unittest.main()
