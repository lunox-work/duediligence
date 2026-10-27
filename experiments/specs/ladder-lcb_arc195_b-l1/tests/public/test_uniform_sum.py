# Public tests for "Uniform Sum". spec.md gives no sample cases, so every
# expected answer here was derived by hand from the statement and
# cross-checked with a brute force (all permutations of A times every
# target sum S up to 2*max+1, a free -1 accepting any S >= its partner).
import unittest

from sandbox.check import run_case


def line(values):
    return " ".join(str(v) for v in values)


class TestUniformSum(unittest.TestCase):
    def test_smallest_all_unknown(self):
        # N=2, every value free: fill everything with 0.
        run_case(self, stdin="2\n-1 -1\n-1 -1\n", expected="Yes")

    def test_smallest_all_zero(self):
        # 0+0 = 0+0, nothing to do.
        run_case(self, stdin="2\n0 0\n0 0\n", expected="Yes")

    def test_max_values_all_equal(self):
        # Every pair sums to 2*10^9.
        run_case(self, stdin="2\n1000000000 1000000000\n1000000000 1000000000\n", expected="Yes")

    def test_max_value_mismatch_no_unknowns(self):
        # B is all 0, so the sums are the A values themselves, 10^9 and 0,
        # in every order: impossible.
        run_case(self, stdin="2\n1000000000 0\n0 0\n", expected="No")

    def test_rearrangement_required(self):
        # As given the sums are 2*10^9 and 0; swapping A gives 10^9 twice.
        run_case(self, stdin="2\n1000000000 0\n1000000000 0\n", expected="Yes")

    def test_fill_a_with_max_value(self):
        # Pair 10^9 with B=0 (sum 10^9), set the -1 in A to 10^9.
        run_case(self, stdin="2\n1000000000 -1\n0 0\n", expected="Yes")

    def test_fill_would_need_negative(self):
        # The two fully known pairs (two A values against B=0, B=0) must sum
        # equally; they are either {0,0} giving S=0, leaving 5 + B_3 = 0, or
        # {0,5} giving sums 0 and 5. Neither works with non-negative values.
        run_case(self, stdin="3\n0 0 5\n0 0 -1\n", expected="No")

    def test_mixed_unknowns_in_both(self):
        # Witness with S=6: A=(3, 0, 2, -1->4), B=(3, -1->6, 4, 2).
        run_case(self, stdin="4\n2 0 -1 3\n3 -1 4 2\n", expected="Yes")

    def test_all_known_no_matching(self):
        # Total of A plus total of B is 13, not divisible by N=3, so no
        # common sum exists.
        run_case(self, stdin="3\n1 2 3\n1 2 4\n", expected="No")

    def test_one_unknown_not_enough(self):
        # The free A goes against one B; the 1 and 2 take the other two.
        # Free vs 4: 1,2 against 1,2 sums (2,4) or (3,3); S=3 needs 4+x=3.
        # Free vs 1: 1,2 against 2,4 sums (3,6) or (5,4), unequal.
        # Free vs 2: 1,2 against 1,4 sums (2,6) or (3,5), unequal.
        run_case(self, stdin="3\n1 2 -1\n1 2 4\n", expected="No")

    def test_largest_n_all_unknown(self):
        n = 2000
        row = line([-1] * n)
        run_case(self, stdin=f"{n}\n{row}\n{row}\n", expected="Yes")

    def test_largest_n_reverse_pairing(self):
        # A and B are both 0..1999; reversing A makes every sum 1999.
        n = 2000
        row = line(range(n))
        run_case(self, stdin=f"{n}\n{row}\n{row}\n", expected="Yes")

    def test_largest_n_max_values_one_off(self):
        # A is all 10^9, so the sums are B_i + 10^9 in every order; B has one
        # 999999999 among 10^9's: impossible.
        n = 2000
        a = line([1000000000] * n)
        b = line([1000000000] * (n - 1) + [999999999])
        run_case(self, stdin=f"{n}\n{a}\n{b}\n", expected="No")

    def test_largest_n_single_unknown_in_b(self):
        # All sums are 10^9 + 0 except the last, where B_n is free: set 0.
        n = 2000
        a = line([1000000000] * n)
        b = line([0] * (n - 1) + [-1])
        run_case(self, stdin=f"{n}\n{a}\n{b}\n", expected="Yes")


if __name__ == "__main__":
    unittest.main()
