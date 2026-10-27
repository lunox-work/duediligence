import math
import unittest

from sandbox.check import run_case

MOD = 998244353


def case(s):
    return f"{len(s)}\n{s}\n"


class TestReverseBrackets(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="6\n(())()\n", expected="2")

    def test_sample_2(self):
        run_case(self, stdin="2\n()\n", expected="1")

    # Small cases. Each expected value was obtained by a breadth-first
    # search over every string reachable by the operation (trying every
    # valid substring at every step) until no new string appeared.

    def test_two_identical_pairs(self):
        # ()() -> reversing either the whole string or one () changes nothing.
        run_case(self, stdin=case("()()"), expected="1")

    def test_single_nest(self):
        # (()) -> every valid substring reverses to itself.
        run_case(self, stdin=case("(())"), expected="1")

    def test_symmetric_inner(self):
        # (()()) -> exhaustive search finds only the string itself.
        run_case(self, stdin=case("(()())"), expected="1")

    def test_two_distinct_blocks(self):
        # ((()))() and ()((())) -> exhaustive search: 2.
        run_case(self, stdin=case("((()))()"), expected="2")

    def test_three_blocks_two_kinds(self):
        # The three orderings of (()), (), () -> exhaustive search: 3.
        run_case(self, stdin=case("(())()()"), expected="3")

    def test_three_blocks_middle(self):
        # Same blocks as above, different start -> exhaustive search: 3.
        run_case(self, stdin=case("()(())()"), expected="3")

    def test_three_distinct_blocks(self):
        # Orderings of (()), ((())), () -> exhaustive search: 6.
        run_case(self, stdin=case("(())((()))()"), expected="6")

    def test_reorder_inside_wrapper(self):
        # ((())()) and (()(())) -> exhaustive search: 2.
        run_case(self, stdin=case("((())())"), expected="2")

    def test_two_copies_of_reorderable_block(self):
        # Two copies of ((())()), each in 2 forms -> exhaustive search: 4.
        run_case(self, stdin=case("((())())((())())"), expected="4")

    def test_nested_reordering(self):
        # Exhaustive search: 4.
        run_case(self, stdin=case("(((())())(()))"), expected="4")

    # Largest inputs (N = 5000 or close to it). The expected values come
    # from counting orderings of the top-level blocks. Each block here
    # has only one form of its own, and the exhaustive search above confirms
    # the count of orderings on every valid string with N <= 14.

    def test_max_n_all_pairs(self):
        # 2500 identical blocks "()" have only one ordering.
        run_case(self, stdin=case("()" * 2500), expected="1")

    def test_max_n_deep_nest(self):
        # A single nest of depth 2500: every valid substring is
        # symmetric, so nothing ever changes.
        run_case(self, stdin=case("(" * 2500 + ")" * 2500), expected="1")

    def test_max_n_one_odd_block(self):
        # One "(())" among 2498 "()": it can sit in any of 2499 positions.
        run_case(self, stdin=case("(())" + "()" * 2498), expected="2499")

    def test_max_n_two_kinds_binomial(self):
        # 1250 "()" and 625 "(())" (N = 2500 + 2500 = 5000): the count is
        # the number of ways to place the two kinds, C(1875, 625).
        s = "()" * 1250 + "(())" * 625
        self.assertEqual(len(s), 5000)
        run_case(self, stdin=case(s), expected=str(math.comb(1875, 625) % MOD))

    def test_seventy_distinct_chains_modulo(self):
        # Chains of depth 1..70 side by side (N = 70 * 71 = 4970). All 70
        # blocks are different, so every ordering is distinct: 70! mod p.
        s = "".join("(" * d + ")" * d for d in range(1, 71))
        self.assertEqual(len(s), 4970)
        run_case(self, stdin=case(s), expected=str(math.factorial(70) % MOD))


if __name__ == "__main__":
    unittest.main()
