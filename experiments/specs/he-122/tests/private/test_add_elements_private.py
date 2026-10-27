import unittest

from src.solution import add_elements


class TestAddElementsPrivate(unittest.TestCase):
    # Extends test_docstring_example: same values in another order, so the
    # qualifying elements fall in different positions of the first k.
    def test_docstring_values_reordered(self):
        # First 4: 5, 6, 111, 7 -> 5 + 6 + 7 = 18 (111 has three digits).
        self.assertEqual(add_elements([5, 6, 111, 7, 21, 3, 4000, 8, 9], 4), 18)

    # Extends test_docstring_example: same array, every k from 1 to len.
    def test_docstring_array_every_k(self):
        arr = [111, 21, 3, 4000, 5, 6, 7, 8, 9]
        # Prefix sums of the qualifying elements, by hand:
        # k=1: 0; k=2: 21; k=3: 24; k=4: 24; k=5: 29; k=6: 35;
        # k=7: 42; k=8: 50; k=9: 59.
        expected = [0, 21, 24, 24, 29, 35, 42, 50, 59]
        for k in range(1, len(arr) + 1):
            self.assertEqual(add_elements(arr, k), expected[k - 1])

    # Extends test_two_digit_rule_typical: qualifying elements after
    # position k must not be counted, and a shortcut that sums "< 1000"
    # or "<= 3 digits" must fail.
    def test_three_digit_numbers_excluded(self):
        # First 3: 101, 999, 42 -> only 42 counts.
        self.assertEqual(add_elements([101, 999, 42, 55], 3), 42)

    # Extends test_two_digit_rule_boundary_99_vs_100: the lower boundary
    # between one and two digits, both of which count.
    def test_boundary_9_and_10_both_count(self):
        # 9 (one digit) + 10 (two digits) = 19.
        self.assertEqual(add_elements([9, 10], 2), 19)

    # Extends test_two_digit_rule_boundary_99_vs_100: 100 first, 99 second,
    # and 99 just outside the first k.
    def test_boundary_100_then_99_outside_k(self):
        # k = 1: only 100 is considered and it has three digits -> 0.
        self.assertEqual(add_elements([100, 99], 1), 0)

    # Extends test_two_digit_rule_boundary_none_qualify: a single element
    # that does not qualify.
    def test_single_element_not_qualifying(self):
        self.assertEqual(add_elements([1000], 1), 0)

    # Extends test_two_digit_rule_boundary_none_qualify: none of the first
    # k qualify although later elements do.
    def test_none_qualify_in_prefix_but_later_do(self):
        # First 2: 500, 123 -> 0; 1, 2, 3 are outside the first k.
        self.assertEqual(add_elements([500, 123, 1, 2, 3], 2), 0)

    # Extends test_first_k_rule_typical: elements after k are large
    # qualifying values, so including any of them changes the result.
    def test_first_k_excludes_next_element(self):
        # First 2: 1, 2 -> 3. The 3rd element 98 must not be counted.
        self.assertEqual(add_elements([1, 2, 98, 97], 2), 3)

    # Extends test_first_k_rule_typical: the first element must be counted
    # (catches arr[1:k]).
    def test_first_k_includes_first_element(self):
        # First 3: 90, 1, 1 -> 92.
        self.assertEqual(add_elements([90, 1, 1, 5], 3), 92)

    # Extends test_first_k_rule_boundary_k_one: k = 1 with a qualifying
    # two-digit first element.
    def test_k_one_two_digit_first(self):
        self.assertEqual(add_elements([77, 3, 4], 1), 77)

    # Extends test_first_k_rule_boundary_k_one: single-element array.
    def test_single_element_qualifying(self):
        self.assertEqual(add_elements([8], 1), 8)

    # Extends test_first_k_rule_boundary_k_equals_len: k = len with a mix
    # of qualifying and non-qualifying elements, last element qualifying.
    def test_k_equals_len_mixed_last_counts(self):
        # 300 excluded, 4000 excluded; 15 + 2 + 33 = 50.
        self.assertEqual(add_elements([15, 300, 2, 4000, 33], 5), 50)

    # Extends test_first_k_rule_boundary_k_equals_len: maximum length 100.
    def test_max_length_k_equals_len(self):
        # arr = 0..99, all at most two digits; sum = 99 * 100 / 2 = 4950.
        arr = list(range(100))
        self.assertEqual(add_elements(arr, 100), 4950)

    # Maximum length, alternating qualifying/non-qualifying, k in middle.
    def test_max_length_alternating_partial_k(self):
        # arr[i] = 7 for even i, 700 for odd i. First 51 elements contain
        # 26 even indices (0..50) -> 26 * 7 = 182.
        arr = [7 if i % 2 == 0 else 700 for i in range(100)]
        self.assertEqual(add_elements(arr, 51), 182)

    # Duplicates: repeated values are each counted.
    def test_duplicates_each_counted(self):
        # 11 four times = 44; 111 twice excluded.
        self.assertEqual(add_elements([11, 111, 11, 11, 111, 11], 6), 44)

    # Zero has one digit and counts (does not change the sum).
    def test_zero_counts(self):
        self.assertEqual(add_elements([0, 0, 5, 100], 4), 5)

    # Negative single-digit numbers have one digit and count.
    def test_negative_single_digit(self):
        # -3 + 4 + -5 = -4.
        self.assertEqual(add_elements([-3, 4, -5], 3), -4)

    # Negative numbers with three or more digits do not count
    # (catches a "x < 100" shortcut that ignores the sign).
    def test_negative_many_digits_excluded(self):
        # -100 and -5000 have 3 and 4 digits; only 20 counts.
        self.assertEqual(add_elements([-100, 20, -5000], 3), 20)

    # Negative two-digit numbers: the minus sign is not a digit, so -10
    # and -99 have two digits and count. -10 + -99 + 1 = -108.
    def test_negative_two_digit_counts(self):
        self.assertEqual(add_elements([-10, -99, 1, -100], 4), -108)

    # Large-magnitude elements are excluded.
    def test_very_large_numbers_excluded(self):
        self.assertEqual(add_elements([10**18, -10**18, 12], 3), 12)

    # Result must not depend on elements beyond k, even huge ones, and
    # brute-force check over many k on a mixed array.
    def test_brute_force_all_k_mixed(self):
        arr = [3, -4, 120, 99, -100, 0, 10, -9, 12345, 50, -777, 101]
        # Qualifying means abs(x) <= 99, which for integers is exactly
        # "at most two decimal digits". Expected computed directly.
        for k in range(1, len(arr) + 1):
            expected = sum(x for x in arr[:k] if -99 <= x <= 99)
            self.assertEqual(add_elements(arr, k), expected)


if __name__ == "__main__":
    unittest.main()
