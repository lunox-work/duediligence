import unittest

from src.solution import starts_one_ends


# The docstring gives no examples. Every expected value below is derived by
# inclusion-exclusion over the n-digit integers 10**(n-1) .. 10**n - 1:
#   start with 1: 10**(n-1)
#   end with 1:   9 * 10**(n-2)   (first digit 1-9, middle digits free)
#   both:         10**(n-2)       (first and last fixed, middle free)
# so the count is 18 * 10**(n-2) for n >= 2. For n = 1 the digit is both
# first and last, so only the number 1 qualifies.
class TestStartsOneEnds(unittest.TestCase):
    # Boundary: smallest n. One-digit numbers are 1..9; only 1 starts or
    # ends with 1, and it is counted once.
    def test_one_digit(self):
        self.assertEqual(starts_one_ends(1), 1)

    # Boundary: smallest n where start and end differ. Start with 1: 10..19
    # (10). End with 1: 11, 21, ..., 91 (9). Both: 11 (1). 10 + 9 - 1 = 18.
    def test_two_digits_counts_overlap_once(self):
        self.assertEqual(starts_one_ends(2), 18)

    # Typical: 100 + 90 - 10 = 180.
    def test_three_digits(self):
        self.assertEqual(starts_one_ends(3), 180)

    # Typical: 1000 + 900 - 100 = 1800.
    def test_four_digits(self):
        self.assertEqual(starts_one_ends(4), 1800)

    # Larger n: 10**9 + 9 * 10**8 - 10**8 = 18 * 10**8.
    def test_ten_digits(self):
        self.assertEqual(starts_one_ends(10), 1800000000)


if __name__ == "__main__":
    unittest.main()
