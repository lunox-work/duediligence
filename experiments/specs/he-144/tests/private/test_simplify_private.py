import unittest
from fractions import Fraction

from src.solution import simplify


def _whole(x, n):
    # Brute force reference: exact rational product via Fraction, whole iff
    # its reduced denominator is 1.
    return (Fraction(x) * Fraction(n)).denominator == 1


class TestSimplifyPrivate(unittest.TestCase):
    # Extends test_example_one_fifth_times_five: the same reciprocal pattern
    # with 1/49 * 49/1 = 1, where the float product (1/49)*49 is
    # 0.9999999999999999, so a float-based check gets it wrong.
    def test_reciprocal_49_float_trap(self):
        self.assertIs(simplify("1/49", "49/1"), True)

    # Extends test_example_one_fifth_times_five: arguments swapped,
    # 5/1 * 1/5 = 1.
    def test_example_swapped_order(self):
        self.assertIs(simplify("5/1", "1/5"), True)

    # Extends test_example_one_sixth_times_two: other float-trap reciprocals
    # (1/k * k/1 = 1 exactly; each of these k gives a float product != 1.0).
    def test_reciprocal_float_trap_several(self):
        for k in (98, 103, 107, 161, 187, 196, 197):
            with self.subTest(k=k):
                self.assertIs(simplify("1/%d" % k, "%d/1" % k), True)

    # Extends test_example_one_sixth_times_two: 1/6 * 3/1 = 1/2, still not
    # whole; but 1/6 * 6/1 = 1 is.
    def test_one_sixth_times_three_and_six(self):
        self.assertIs(simplify("1/6", "3/1"), False)
        self.assertIs(simplify("1/6", "6/1"), True)

    # Extends test_example_seven_tenths_times_ten_halves: 7/10 * 10/7 = 1,
    # and 7/10 * 20/1 = 14 are whole.
    def test_seven_tenths_whole_variants(self):
        self.assertIs(simplify("7/10", "10/7"), True)
        self.assertIs(simplify("7/10", "20/1"), True)

    # Extends test_whole_product_typical: the whole result needs factors of
    # both numerators against both denominators. 4/6 * 3/2 = 12/12 = 1, but
    # 3 is not divisible by 6, so checking x_num % n_den and n_num % x_den
    # separately wrongly says False.
    def test_cross_divisibility_shortcut(self):
        self.assertIs(simplify("4/6", "3/2"), True)

    # Extends test_whole_product_typical: 6/35 * 35/2 = 210/70 = 3.
    def test_whole_product_larger_than_one(self):
        self.assertIs(simplify("6/35", "35/2"), True)

    # Extends test_whole_product_boundary_smallest_fractions: whole number
    # inputs with denominator 1 always multiply to a whole number,
    # e.g. 7/1 * 13/1 = 91.
    def test_both_denominators_one(self):
        self.assertIs(simplify("7/1", "13/1"), True)

    # Extends test_whole_product_boundary_smallest_fractions: one side is
    # 1/1, so the result is whole iff the other side is: 8/4 = 2 (True),
    # 1/2 (False).
    def test_identity_side(self):
        self.assertIs(simplify("1/1", "8/4"), True)
        self.assertIs(simplify("1/1", "1/2"), False)

    # Extends test_whole_product_boundary_unreduced_inputs: heavily unreduced
    # inputs; 100/1000 * 30/3 = 3000/3000 = 1.
    def test_unreduced_both_sides(self):
        self.assertIs(simplify("100/1000", "30/3"), True)

    # Extends test_whole_product_boundary_unreduced_inputs: unreduced inputs
    # whose product is not whole; 4/8 * 6/9 = 24/72 = 1/3.
    def test_unreduced_non_whole(self):
        self.assertIs(simplify("4/8", "6/9"), False)

    # Extends test_non_whole_product_typical: product > 1 but not whole;
    # 5/2 * 3/1 = 15/2 = 7.5.
    def test_non_whole_above_one(self):
        self.assertIs(simplify("5/2", "3/1"), False)

    # Extends test_non_whole_product_boundary_one_half_above_whole: a product
    # far from 0.5 fraction; 7/3 * 1/1 = 2.333..., and 5/3 * 2/1 = 10/3.
    def test_non_whole_thirds(self):
        self.assertIs(simplify("7/3", "1/1"), False)
        self.assertIs(simplify("5/3", "2/1"), False)

    # Extends test_non_whole_product_boundary_just_below_one: a product just
    # above 1 that float arithmetic cannot distinguish from 1:
    # (10**17 + 1)/10**17 is not whole, but as a float it equals 1.0.
    def test_just_above_one_large_float_trap(self):
        self.assertIs(simplify("100000000000000001/100000000000000000", "1/1"),
                      False)

    # Extends test_non_whole_product_boundary_just_below_one: just below a
    # whole number via both sides; 999/1000 * 1000/999 = 1 but
    # 999/1000 * 1000/1000 = 999/1000.
    def test_just_below_one_pair(self):
        self.assertIs(simplify("999/1000", "1000/999"), True)
        self.assertIs(simplify("999/1000", "1000/1000"), False)

    # Extends test_multi_digit_parts_typical: large multi-digit values;
    # 123456789/1000 * 1000/1 = 123456789.
    def test_large_whole_product(self):
        self.assertIs(simplify("123456789/1000", "1000/1"), True)

    # Extends test_multi_digit_parts_boundary_reciprocals: very large
    # reciprocals, beyond float precision: (10**20+3)/(10**20+7) times its
    # reciprocal is exactly 1.
    def test_huge_reciprocals(self):
        a = str(10 ** 20 + 3)
        b = str(10 ** 20 + 7)
        self.assertIs(simplify(a + "/" + b, b + "/" + a), True)

    # Extends test_multi_digit_parts_boundary_non_whole: huge product off by
    # one from a whole number: (10**20 + 1)/10**20 * 1/1 is not whole; and
    # (10**20)/(10**20 + 1) is not whole either.
    def test_huge_non_whole(self):
        big = 10 ** 20
        self.assertIs(simplify("%d/%d" % (big + 1, big), "1/1"), False)
        self.assertIs(simplify("%d/%d" % (big, big + 1), "1/1"), False)

    # Extends test_multi_digit_parts_boundary_non_whole: multi-digit in the
    # second argument where only first digits would mislead; 1/1 * 12/13
    # (first digits give 1/1).
    def test_multi_digit_second_argument(self):
        self.assertIs(simplify("1/1", "12/13"), False)
        self.assertIs(simplify("1/1", "26/13"), True)

    # Rule: True iff x * n is whole. Exhaustive check over small numerators
    # and denominators against the Fraction-based brute force above.
    def test_exhaustive_small_against_fraction(self):
        for a in range(1, 9):
            for b in range(1, 9):
                for c in range(1, 9):
                    for d in range(1, 9):
                        x = "%d/%d" % (a, b)
                        n = "%d/%d" % (c, d)
                        with self.subTest(x=x, n=n):
                            self.assertIs(simplify(x, n), _whole(x, n))

    # Rule: multiplication is commutative, so the answer does not depend on
    # argument order; checked on assorted pairs, expected via brute force.
    def test_symmetric_in_arguments(self):
        pairs = [("4/6", "3/2"), ("7/10", "10/2"), ("12/35", "35/6"),
                 ("9/14", "28/3"), ("11/12", "6/11")]
        for x, n in pairs:
            with self.subTest(x=x, n=n):
                expected = _whole(x, n)
                self.assertIs(simplify(x, n), expected)
                self.assertIs(simplify(n, x), expected)

    # Rule: product equal to a large whole number via cancellation across
    # both fractions: 9/14 * 28/3 = 252/42 = 6.
    def test_whole_via_mixed_cancellation(self):
        self.assertIs(simplify("9/14", "28/3"), True)

    # Rule: 12/35 * 35/6 = 420/210 = 2, but 11/12 * 6/11 = 66/132 = 1/2.
    def test_mixed_cancellation_pair(self):
        self.assertIs(simplify("12/35", "35/6"), True)
        self.assertIs(simplify("11/12", "6/11"), False)


if __name__ == "__main__":
    unittest.main()
