# spec.md gives no sample inputs and no numeric constraints, so every case
# here is a tiny balanced string (N <= 10) whose answer is either derived by
# hand or computed in the test by `brute` below: a breadth-first search over
# every string reachable by mirroring one balanced substring at a time. The
# counts are far below 998244353, so the modulo does not change them.
import unittest
from collections import deque

from sandbox.check import run_case


def is_balanced(t):
    depth = 0
    for c in t:
        depth += 1 if c == "(" else -1
        if depth < 0:
            return False
    return depth == 0


def mirror(t):
    return "".join(")" if c == "(" else "(" for c in reversed(t))


def brute(s):
    seen = {s}
    queue = deque([s])
    while queue:
        u = queue.popleft()
        for i in range(len(u)):
            for j in range(i + 2, len(u) + 1, 2):
                if is_balanced(u[i:j]):
                    v = u[:i] + mirror(u[i:j]) + u[j:]
                    if v not in seen:
                        seen.add(v)
                        queue.append(v)
    return len(seen)


def case(tc, s, expected=None):
    if expected is None:
        expected = brute(s)
    run_case(tc, stdin=f"{len(s)}\n{s}\n", expected=str(expected))


class TestReverseBrackets(unittest.TestCase):
    def test_smallest_single_pair(self):
        # By hand: the only balanced substring is "()", whose mirror is "()".
        case(self, "()", 1)

    def test_two_adjacent_pairs(self):
        # By hand: "()" and "()()" are their own mirrors; nothing new appears.
        case(self, "()()", 1)

    def test_nested_pair(self):
        # By hand: "()" and "(())" are their own mirrors; nothing new appears.
        case(self, "(())", 1)

    def test_nested_then_flat(self):
        # By hand: mirroring the whole string turns "(())()" into "()(())"
        # and back; brute force confirms 2.
        case(self, "(())()", 2)

    def test_flat_then_nested(self):
        # Brute force (expected 2: itself and "(())()").
        case(self, "()(())")

    def test_deep_nesting_length_six(self):
        # Brute force (expected 1: every balanced substring is symmetric).
        case(self, "((()))")

    def test_symmetric_inner_length_six(self):
        # Brute force (expected 1).
        case(self, "(()())")

    def test_symmetric_concatenation_length_eight(self):
        # Brute force (expected 1).
        case(self, "(())(())")

    def test_asymmetric_inside_outer_pair(self):
        # Brute force (expected 2).
        case(self, "(()(()))")

    def test_mixed_length_ten(self):
        # Brute force (expected 4).
        case(self, "((())())()")

    def test_deep_nesting_length_eight(self):
        # Brute force (expected 1).
        case(self, "(((())))")


if __name__ == "__main__":
    unittest.main()
