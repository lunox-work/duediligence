import unittest

from sandbox.check import run_case


def _is_valid(t):
    depth = 0
    for c in t:
        depth += 1 if c == "(" else -1
        if depth < 0:
            return False
    return depth == 0


def _reverse(t, l, r):
    # The statement's operation on t[l..r]: S_i becomes the flip of S_{l+r-i}.
    flip = {"(": ")", ")": "("}
    middle = "".join(flip[t[l + r - i]] for i in range(l, r + 1))
    return t[:l] + middle + t[r + 1:]


def brute(s):
    """Breadth-first search over every string reachable by the operation:
    try every substring that is a valid parenthesis sequence, reverse it,
    and count the distinct strings seen (including S itself). Exhaustive,
    so obviously correct; only used on tiny inputs."""
    seen = {s}
    frontier = [s]
    while frontier:
        nxt = []
        for t in frontier:
            n = len(t)
            for l in range(n):
                for r in range(l + 1, n, 2):
                    if _is_valid(t[l:r + 1]):
                        u = _reverse(t, l, r)
                        if u not in seen:
                            seen.add(u)
                            nxt.append(u)
        frontier = nxt
    return len(seen) % 998244353


class TestReverseBrackets(unittest.TestCase):
    # Hand-derived: the only valid substring is "()" itself, which maps to "()".
    def test_smallest_single_pair(self):
        run_case(self, stdin="2\n()", expected="1")

    # Hand-derived: reversing "()()" or either "()" leaves the string unchanged.
    def test_two_pairs_side_by_side(self):
        run_case(self, stdin="4\n()()", expected="1")

    # Hand-derived: reversing "(())" or the inner "()" leaves it unchanged.
    def test_two_pairs_nested(self):
        run_case(self, stdin="4\n(())", expected="1")

    # Hand-derived: reversing the whole string turns "(())()" into "()(())",
    # and from either string no other string is reachable, so the answer is 2.
    def test_nested_then_pair(self):
        run_case(self, stdin="6\n(())()", expected="2")

    # Same set of reachable strings as above, starting from the other end.
    def test_pair_then_nested(self):
        run_case(self, stdin="6\n()(())", expected="2")

    # Every case below has its expected answer computed by brute() above.
    def test_brute_deep_nesting(self):
        s = "((((()))))"
        run_case(self, stdin=f"{len(s)}\n{s}", expected=str(brute(s)))

    def test_brute_all_flat(self):
        s = "()()()()()"
        run_case(self, stdin=f"{len(s)}\n{s}", expected=str(brute(s)))

    def test_brute_mixed_eight(self):
        s = "(()())()"
        run_case(self, stdin=f"{len(s)}\n{s}", expected=str(brute(s)))

    def test_brute_three_different_blocks(self):
        s = "()(())((()))"
        run_case(self, stdin=f"{len(s)}\n{s}", expected=str(brute(s)))

    def test_brute_nested_blocks_inside(self):
        s = "((())())(())"
        run_case(self, stdin=f"{len(s)}\n{s}", expected=str(brute(s)))

    def test_brute_wrapped_mixture(self):
        s = "(()(())(()))"
        run_case(self, stdin=f"{len(s)}\n{s}", expected=str(brute(s)))


if __name__ == "__main__":
    unittest.main()
