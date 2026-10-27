# Public tests for "Uniform Sum" (spec.md).
#
# spec.md gives no sample cases and no constraints, so every case below is
# small and was derived by hand from the statement: a common sum S >= 0
# works iff, after rearranging A, every pair with both values known sums to
# S and every known value paired with a -1 is at most S (the -1 must become
# S minus it, which has to be non-negative). Each answer was also checked
# with a brute force over all permutations of A and all S in [0, 2*max+1].
import unittest

from sandbox.check import run_case


class TestUniformSum(unittest.TestCase):
    def test_single_pair_known(self):
        # N=1: 0 + 0 is trivially uniform.
        run_case(self, stdin="1\n0\n0\n", expected="Yes")

    def test_single_pair_both_unknown(self):
        # N=1: set both -1 to any non-negative integers.
        run_case(self, stdin="1\n-1\n-1\n", expected="Yes")

    def test_single_pair_b_unknown(self):
        # N=1: B_1 can be any non-negative integer, e.g. 0.
        run_case(self, stdin="1\n5\n-1\n", expected="Yes")

    def test_single_pair_a_unknown(self):
        # N=1: A_1 can be any non-negative integer, e.g. 0.
        run_case(self, stdin="1\n-1\n5\n", expected="Yes")

    def test_rearrangement_needed(self):
        # As given 1+1 != 2+2, but A rearranged to (2,1) gives 3 = 3.
        run_case(self, stdin="2\n1 2\n1 2\n", expected="Yes")

    def test_all_known_impossible_two(self):
        # Pairings: (1+1, 2+3) = (2, 5) and (1+3, 2+1) = (4, 3); neither uniform.
        run_case(self, stdin="2\n1 2\n1 3\n", expected="No")

    def test_unknown_a_must_take_smaller_b(self):
        # A=1 with B=3 gives S=4; the -1 pairs with B=1 and becomes 3.
        # (A=1 with B=1 gives S=2, but then -1 + 3 = 2 needs -1 -> -1: invalid.)
        run_case(self, stdin="2\n1 -1\n1 3\n", expected="Yes")

    def test_all_known_rearranged_three(self):
        # A rearranged to (3,2,1) gives sums 4, 4, 4.
        run_case(self, stdin="3\n1 2 3\n1 2 3\n", expected="Yes")

    def test_all_known_impossible_three(self):
        # Multiset sums: total 13 over 3 pairs is not divisible by 3, so no
        # uniform sum exists.
        run_case(self, stdin="3\n1 2 3\n1 2 4\n", expected="No")

    def test_one_unknown_a_impossible(self):
        # B=4 forces S >= 4. If a known A pairs with 4 (S=5 or 6), the other
        # known A and B sum to at most 2+2=4 < S. If -1 pairs with 4, the
        # pairs from A {1,2} and B {1,2} need a common sum: 1+2 = 2+1 = 3 < 4.
        # So No.
        run_case(self, stdin="3\n1 2 -1\n1 2 4\n", expected="No")

    def test_no_matching_known_pairs(self):
        # Two known-known pairs from A in {3,5,1}, B in {0,1}: the sums would
        # be a+0 = a'+1, i.e. two A values differing by 1; none do. So No.
        run_case(self, stdin="3\n3 5 1\n0 1 -1\n", expected="No")

    def test_non_negativity_blocks(self):
        # Either S=0 (0+0 twice), but then 7 + B = 0 needs B=-7 < 0; or 7 is
        # paired with a known 0 (S=7), but then the other known pair is 0+0=0.
        run_case(self, stdin="3\n0 0 7\n0 0 -1\n", expected="No")

    def test_all_a_unknown(self):
        # Take S = 9 = max(B); set A to (5, 9, 0).
        run_case(self, stdin="3\n-1 -1 -1\n4 0 9\n", expected="Yes")

    def test_mixed_unknowns_four(self):
        # Without rearranging, with S = 5: 2+3, 0+(-1 -> 5), (-1 -> 1)+4, 3+2.
        run_case(self, stdin="4\n2 0 -1 3\n3 -1 4 2\n", expected="Yes")


if __name__ == "__main__":
    unittest.main()
