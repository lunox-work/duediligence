import unittest

from src.solution import f


def expected_values(n):
    # Directly apply the definition: visit every integer from 1 through i,
    # adding for odd i and multiplying for even i. No recurrence is assumed.
    result = []
    for i in range(1, n + 1):
        value = 1 if i % 2 == 0 else 0
        for number in range(1, i + 1):
            if i % 2 == 0:
                value *= number
            else:
                value += number
        result.append(value)
    return result


class TestFactorialSumPrivate(unittest.TestCase):
    # Extends test_docstring_example: a table ending at 5 cannot supply 8 or 9.
    def test_nine_positions_include_both_new_branches(self):
        # 8! = 40320; 1 + ... + 9 = 45; the earlier entries follow likewise.
        self.assertEqual(f(9), [1, 2, 6, 24, 15, 720, 28, 40320, 45])

    # Extends test_zero_size_returns_empty_list: zero must also work between
    # nonempty calls, without an old result leaking into the empty result.
    def test_empty_size_before_and_after_nonempty_size(self):
        self.assertEqual(f(0), [])
        self.assertEqual(f(8), expected_values(8))
        self.assertEqual(f(0), [])

    # Extends test_first_position_uses_one_based_index: requesting one entry
    # after a larger result must still return exactly that first entry.
    def test_single_position_after_longer_request(self):
        self.assertEqual(f(13), expected_values(13))
        # The only index is 1, whose sum is 1.
        self.assertEqual(f(1), [1])

    # Extends test_first_even_position_uses_factorial: higher even indices
    # distinguish factorials from small-value tables or triangular numbers.
    def test_ten_positions_end_in_factorial(self):
        self.assertEqual(f(10), expected_values(10))

    # Extends test_three_element_list_uses_indices_one_through_three:
    # size 4 is absent publicly and must include the fourth index itself.
    def test_four_positions_end_in_twenty_four(self):
        # The sums at 1 and 3 are 1 and 6; 2! = 2 and 4! = 24.
        self.assertEqual(f(4), [1, 2, 6, 24])

    # Extends test_later_even_position_uses_factorial: 14! exceeds signed
    # 32-bit range, and factorials must continue beyond the visible index 6.
    def test_fourteen_positions_include_large_even_products(self):
        self.assertEqual(f(14), expected_values(14))

    # Extends test_later_odd_position_uses_sum: several later odd indices
    # must sum all integers through i, rather than just the odd integers.
    def test_fifteen_positions_include_later_odd_sums(self):
        self.assertEqual(f(15), expected_values(15))

    # Extends test_later_even_position_uses_factorial: 24! exceeds 64 bits
    # and cannot be represented exactly by a binary64 float.
    def test_twenty_four_positions_preserve_exact_factorials(self):
        self.assertEqual(f(24), expected_values(24))

    # Extends test_later_even_position_uses_factorial: a substantially longer
    # even-length result catches fixed tables and arbitrary small cutoffs.
    def test_long_sequence_with_even_final_index(self):
        self.assertEqual(f(128), expected_values(128))

    # Extends test_later_odd_position_uses_sum: a long odd-length result
    # must end with a sum even after computing a much larger factorial.
    def test_long_sequence_with_odd_final_index(self):
        self.assertEqual(f(257), expected_values(257))

    # Extends test_first_even_position_uses_factorial and
    # test_three_element_list_uses_indices_one_through_three: results must
    # remain correct while requested sizes grow, shrink, and repeat.
    def test_changing_and_repeated_sizes(self):
        for n in (2, 25, 3, 26, 0, 1, 25, 2):
            with self.subTest(n=n):
                self.assertEqual(f(n), expected_values(n))
