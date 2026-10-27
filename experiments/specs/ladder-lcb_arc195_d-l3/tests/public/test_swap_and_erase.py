import unittest
from collections import deque

from sandbox.check import run_case

# spec.md gives no samples and no constraints, so every case keeps N >= 2
# and 1 <= A_i <= N, and stays tiny.


def brute_force(a):
    """Minimum number of operations to empty `a`, by breadth-first search
    over every reachable sequence. An operation is swapping two adjacent
    elements, or deleting a nonempty prefix whose elements all share one
    value; each costs 1."""
    start = tuple(a)
    dist = {start: 0}
    queue = deque([start])
    while queue:
        s = queue.popleft()
        if not s:
            return dist[s]
        moves = []
        for i in range(len(s) - 1):
            t = list(s)
            t[i], t[i + 1] = t[i + 1], t[i]
            moves.append(tuple(t))
        k = 1
        while k <= len(s) and s[k - 1] == s[0]:
            moves.append(s[k:])
            k += 1
        for t in moves:
            if t not in dist:
                dist[t] = dist[s] + 1
                queue.append(t)
    raise AssertionError("empty sequence unreachable")


def make_input(cases):
    lines = [str(len(cases))]
    for a in cases:
        lines.append(str(len(a)))
        lines.append(" ".join(map(str, a)))
    return "\n".join(lines) + "\n"


def check(tc, cases):
    # Expected answers come from brute_force above.
    expected = "\n".join(str(brute_force(a)) for a in cases)
    run_case(tc, stdin=make_input(cases), expected=expected)


class TestSwapAndErase(unittest.TestCase):
    def test_two_equal(self):
        # One deletion removes the whole sequence; at least one is needed.
        run_case(self, stdin="1\n2\n1 1\n", expected="1")

    def test_two_distinct_ascending(self):
        # Two values, each needs its own deletion; two deletions suffice.
        run_case(self, stdin="1\n2\n1 2\n", expected="2")

    def test_two_distinct_descending(self):
        # Same reasoning as above.
        run_case(self, stdin="1\n2\n2 1\n", expected="2")

    def test_all_equal(self):
        # One deletion of the whole sequence.
        run_case(self, stdin="1\n10\n7 7 7 7 7 7 7 7 7 7\n", expected="1")

    def test_all_distinct_largest_value(self):
        # Every deletion removes one value only, so N distinct values need
        # N deletions, and N deletions in order suffice. A_i reaches N.
        run_case(self, stdin="1\n8\n8 3 5 1 7 2 6 4\n", expected="8")

    def test_one_swap_saves_a_deletion(self):
        check(self, [[1, 1, 2, 1, 2]])

    def test_permutation_of_four(self):
        check(self, [[4, 2, 1, 3]])

    def test_long_alternating(self):
        check(self, [[1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]])

    def test_short_alternating(self):
        check(self, [[1, 2, 1]])

    def test_alternating_even(self):
        check(self, [[1, 2, 1, 2]])

    def test_blocks(self):
        check(self, [[1, 2, 2, 1, 1, 2]])

    def test_alternating_three_and_one(self):
        check(self, [[3, 1, 3, 1, 3, 1]])

    def test_multiple_cases(self):
        check(self, [[1, 1], [2, 1], [1, 2, 1], [2, 1, 1, 2], [3, 3, 1, 2, 3]])


if __name__ == "__main__":
    unittest.main()
