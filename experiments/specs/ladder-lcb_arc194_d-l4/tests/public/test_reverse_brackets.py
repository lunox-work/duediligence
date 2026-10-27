# spec.md carries only the title and the input format. The problem is
# AtCoder ARC194 D "Reverse Brackets": S is a valid parenthesis sequence of
# length N (N <= 5000); one operation picks a contiguous substring that is a
# valid parenthesis sequence, reverses it and swaps every '(' with ')'.
# The answer is the number of distinct strings reachable by any number of
# operations, modulo 998244353. Cases below rely on that definition.
import unittest

from sandbox.check import run_case


def _balanced(t):
    depth = 0
    for c in t:
        depth += 1 if c == "(" else -1
        if depth < 0:
            return False
    return depth == 0


def _flip(t):
    return "".join(")" if c == "(" else "(" for c in reversed(t))


def brute_force(s):
    """Count reachable strings by exhaustive search; only for tiny S."""
    seen = {s}
    stack = [s]
    while stack:
        u = stack.pop()
        for l in range(len(u)):
            for r in range(l + 2, len(u) + 1, 2):
                if _balanced(u[l:r]):
                    v = u[:l] + _flip(u[l:r]) + u[r:]
                    if v not in seen:
                        seen.add(v)
                        stack.append(v)
    return len(seen)


class TestReverseBrackets(unittest.TestCase):
    def test_sample_1(self):
        # Statement sample: (())() and ()(()) are the reachable strings.
        run_case(self, stdin="6\n(())()\n", expected="2")

    def test_sample_2(self):
        # Statement sample; also the smallest input (N = 2).
        run_case(self, stdin="2\n()\n", expected="1")

    def test_brute_force_swapped_blocks(self):
        # Expected from brute_force: ()(()) can become (())().
        s = "()(())"
        run_case(self, stdin=f"{len(s)}\n{s}\n", expected=str(brute_force(s)))

    def test_brute_force_nested_then_pair(self):
        # Expected from brute_force.
        s = "(()())()"
        run_case(self, stdin=f"{len(s)}\n{s}\n", expected=str(brute_force(s)))

    def test_brute_force_fully_nested_small(self):
        # Expected from brute_force: every operation leaves ((())) unchanged.
        s = "((()))"
        run_case(self, stdin=f"{len(s)}\n{s}\n", expected=str(brute_force(s)))

    def test_max_n_repeated_pairs(self):
        # N = 5000, S = "()" * 2500. Every valid substring is "()" repeated,
        # and reversing-and-swapping that gives the same string, so no
        # operation changes S: answer 1.
        s = "()" * 2500
        run_case(self, stdin=f"{len(s)}\n{s}\n", expected="1")

    def test_max_n_fully_nested(self):
        # N = 5000, S = "(" * 2500 + ")" * 2500. A valid substring must be
        # "(" * k + ")" * k, which maps to itself under the operation, so no
        # operation changes S: answer 1.
        s = "(" * 2500 + ")" * 2500
        run_case(self, stdin=f"{len(s)}\n{s}\n", expected="1")


if __name__ == "__main__":
    unittest.main()
