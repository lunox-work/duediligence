import unittest

from src.solution import simplify


class TestSimplify(unittest.TestCase):
    # Docstring examples.

    def test_example_one_fifth_times_five(self):
        self.assertIs(simplify("1/5", "5/1"), True)

    def test_example_one_sixth_times_two(self):
        self.assertIs(simplify("1/6", "2/1"), False)

    def test_example_seven_tenths_times_ten_halves(self):
        self.assertIs(simplify("7/10", "10/2"), False)

    # Rule: True when x * n is a whole number.

    def test_whole_product_typical(self):
        # 3/4 * 8/3 = 24/12 = 2, a whole number.
        self.assertIs(simplify("3/4", "8/3"), True)

    def test_whole_product_boundary_smallest_fractions(self):
        # 1/1 * 1/1 = 1, the smallest whole product possible with
        # positive numerators and denominators.
        self.assertIs(simplify("1/1", "1/1"), True)

    def test_whole_product_boundary_unreduced_inputs(self):
        # 2/4 * 2/1 = 4/4 = 1: neither input is in lowest terms, but the
        # product is still exactly the whole number 1.
        self.assertIs(simplify("2/4", "2/1"), True)

    # Rule: False when x * n is not a whole number.

    def test_non_whole_product_typical(self):
        # 1/3 * 1/2 = 1/6, strictly between 0 and 1.
        self.assertIs(simplify("1/3", "1/2"), False)

    def test_non_whole_product_boundary_one_half_above_whole(self):
        # 3/2 * 1/1 = 3/2 = 1.5, halfway between the whole numbers 1 and 2.
        self.assertIs(simplify("3/2", "1/1"), False)

    def test_non_whole_product_boundary_just_below_one(self):
        # 99/100 * 1/1 = 99/100, just short of the whole number 1.
        self.assertIs(simplify("99/100", "1/1"), False)

    # Rule: numerator and denominator are whole numbers, possibly multi-digit.

    def test_multi_digit_parts_typical(self):
        # 12/5 * 5/3 = 60/15 = 4, a whole number.
        self.assertIs(simplify("12/5", "5/3"), True)

    def test_multi_digit_parts_boundary_reciprocals(self):
        # 11/10 * 10/11 = 110/110 = 1, a whole number.
        self.assertIs(simplify("11/10", "10/11"), True)

    def test_multi_digit_parts_boundary_non_whole(self):
        # 10/11 * 1/1 = 10/11, not a whole number (reading only first digits
        # would wrongly give 1/1 = 1).
        self.assertIs(simplify("10/11", "1/1"), False)


if __name__ == "__main__":
    unittest.main()
