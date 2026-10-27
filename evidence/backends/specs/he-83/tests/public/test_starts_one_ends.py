import unittest

from src.solution import starts_one_ends


class TestStartsOneEnds(unittest.TestCase):
    def test_single_digit_minimum_length(self):
        # Among 1 through 9, only 1 starts or ends with 1; count it once.
        self.assertEqual(starts_one_ends(1), 1)

    def test_two_digits_inclusive_or(self):
        # 10 through 19 give 10 starts; 11, 21, ..., 91 give 9 ends.
        # Subtract the shared number 11: 10 + 9 - 1 = 18.
        self.assertEqual(starts_one_ends(2), 18)

    def test_three_digits_excludes_leading_zero(self):
        # 100 through 199 give 100 starts. Ending in 1 gives 9 choices
        # for the first digit and 10 for the middle; 10 also start in 1.
        # Thus 100 + 90 - 10 = 180.
        self.assertEqual(starts_one_ends(3), 180)

    def test_six_digits_with_multiple_interior_digits(self):
        # Starting in 1 gives 100,000 choices. Ending in 1 gives
        # 9 * 10,000 = 90,000; both gives 10,000.
        # Inclusion-exclusion gives 100,000 + 90,000 - 10,000 = 180,000.
        self.assertEqual(starts_one_ends(6), 180000)
