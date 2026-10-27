import unittest

from src.solution import double_the_difference


class TestDoubleTheDifferencePrivate(unittest.TestCase):
    # Extends test_example_mixed_odd_even_zero: same values, other order.
    def test_mixed_reordered(self):
        # odd: 3, 1 -> 9 + 1 = 10
        self.assertEqual(double_the_difference([0, 2, 3, 1]), 10)

    # Extends test_example_mixed_odd_even_zero: zero first must not stop the scan.
    def test_zero_first_then_odd(self):
        # 3*3 = 9
        self.assertEqual(double_the_difference([0, 3]), 9)

    # Extends test_example_negatives_and_zero: only negatives, many of them.
    def test_all_negatives(self):
        self.assertEqual(double_the_difference([-1, -3, -5, -7, -2, -100]), 0)

    # Extends test_example_odd_and_negative_even: negative odd first, then
    # odd values after it, so an implementation that stops at the first
    # negative fails.
    def test_negative_between_odds(self):
        # 1 + 25 + 49 = 75; -3 ignored
        self.assertEqual(double_the_difference([1, -3, 5, -4, 7]), 75)

    # Extends test_example_single_zero: single odd and single even values.
    def test_single_seven(self):
        self.assertEqual(double_the_difference([7]), 49)

    def test_single_even(self):
        self.assertEqual(double_the_difference([8]), 0)

    def test_single_negative_odd(self):
        self.assertEqual(double_the_difference([-9]), 0)

    # Extends test_odd_numbers_squared_and_summed: duplicates each count.
    def test_duplicate_odds_each_counted(self):
        # 3*3 three times = 27
        self.assertEqual(double_the_difference([3, 3, 3]), 27)

    def test_duplicate_mixed(self):
        # 5,5 -> 50; 1 -> 1; 2,2 even; total 51
        self.assertEqual(double_the_difference([5, 2, 5, 2, 1]), 51)

    # Extends test_odd_numbers_squared_and_summed: larger list, brute force.
    def test_range_zero_to_999(self):
        # Brute force: sum of k*k for odd k in 1..999.
        expected = sum(k * k for k in range(1, 1000, 2))
        self.assertEqual(double_the_difference(list(range(1000))), expected)

    def test_symmetric_range_negatives_ignored(self):
        # range(-50, 51): negatives ignored; odd k in 1..49.
        expected = sum(k * k for k in range(1, 50, 2))
        self.assertEqual(double_the_difference(list(range(-50, 51))), expected)

    # Extends test_only_even_numbers_gives_zero: many evens, including big ones.
    def test_many_evens_zero(self):
        self.assertEqual(double_the_difference([0, 2, 10, 1000, 10 ** 12]), 0)

    # Extends test_single_element_one: 1 alongside evens and zero.
    def test_one_among_evens(self):
        self.assertEqual(double_the_difference([2, 0, 1, 4]), 1)

    # Extends test_large_odd_number_squared: arbitrary-precision integer.
    def test_huge_odd_exact(self):
        # (10**20 + 1)**2 = 10**40 + 2*10**20 + 1
        self.assertEqual(
            double_the_difference([10 ** 20 + 1]),
            10 ** 40 + 2 * 10 ** 20 + 1,
        )

    def test_huge_even_ignored(self):
        self.assertEqual(double_the_difference([10 ** 20, 3]), 9)

    # Extends test_negative_odd_ignored: large negative odd, negative
    # before and after positive odds.
    def test_large_negative_odd_ignored(self):
        # 11*11 = 121
        self.assertEqual(double_the_difference([-99999, 11, -1]), 121)

    # Extends test_negative_one_ignored: -1 alone.
    def test_negative_one_alone(self):
        self.assertEqual(double_the_difference([-1]), 0)

    # Extends test_non_integer_ignored: non-integers that round or truncate
    # to odd integers must still be ignored.
    def test_non_integers_rounding_to_odd_ignored(self):
        # round(2.7) = 3, round(0.9) = 1, int(3.5) = 3, int(1.2) = 1:
        # none are integers, so the sum is 0.
        self.assertEqual(double_the_difference([2.7, 0.9, 3.5, 1.2]), 0)

    def test_non_integers_mixed_with_odds(self):
        # 2.5, 4.5, 0.5 ignored; 1 + 9 + 25 = 35
        self.assertEqual(double_the_difference([2.5, 1, 4.5, 3, 0.5, 5]), 35)

    def test_non_integer_first_then_odds(self):
        # 7.3 ignored; 3*3 + 5*5 = 34
        self.assertEqual(double_the_difference([7.3, 3, 5]), 34)

    # Extends test_only_non_integers_gives_zero: list of only non-integers.
    def test_only_non_integers(self):
        self.assertEqual(double_the_difference([1.5, 2.5, 3.1, 9.9]), 0)

    def test_negative_non_integers_ignored(self):
        # -2.5 and -1.5 are negative and not integers; 9*9 = 81
        self.assertEqual(double_the_difference([-2.5, -1.5, 9]), 81)

    # Extends test_empty_list: all three ignore rules together.
    def test_all_rules_combined(self):
        # keep 1, 3, 13 -> 1 + 9 + 169 = 179;
        # ignore -5 (negative), 2.5 (non-integer), 4, 0 (even)
        self.assertEqual(
            double_the_difference([1, -5, 2.5, 4, 3, 0, 13]), 179
        )


if __name__ == "__main__":
    unittest.main()
