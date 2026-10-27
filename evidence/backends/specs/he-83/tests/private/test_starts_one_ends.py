import unittest

from src.solution import starts_one_ends


class TestStartsOneEndsPrivate(unittest.TestCase):
    # Extends test_single_digit_minimum_length: revisit length 1 after other
    # lengths, catching an unconditional general formula or retained state.
    def test_single_digit_among_repeated_calls(self):
        # For n >= 2, inclusion-exclusion gives
        # 10**(n-1) + 9*10**(n-2) - 10**(n-2).
        # For n = 1, the only qualifying positive integer is 1.
        for length, expected in [(5, 18000), (1, 1), (7, 1800000), (1, 1)]:
            with self.subTest(length=length):
                self.assertEqual(starts_one_ends(length), expected)

    # Extends test_two_digits_inclusive_or: use an unseen length and enumerate
    # the union directly, so overlap must still be counted just once.
    def test_four_digits_against_exhaustive_count(self):
        # Every four-digit positive integer is in range(1000, 10000).
        # Checking its actual first and last decimal digits is a direct oracle.
        expected = sum(
            str(value).startswith("1") or str(value).endswith("1")
            for value in range(1000, 10000)
        )
        self.assertEqual(starts_one_ends(4), expected)

    # Extends test_three_digits_excludes_leading_zero: three free interior
    # digits must not cause zero-prefixed strings to enter the count.
    def test_five_digits(self):
        # Starts: 10000; ends: 9000; both: 1000. Union: 18000.
        self.assertEqual(starts_one_ends(5), 18000)

    # Extends test_six_digits_with_multiple_interior_digits: the next length
    # defeats a table containing only the visible lengths or a six-digit cap.
    def test_seven_digits(self):
        # Starts: 1000000; ends: 900000; both: 100000. Union: 1800000.
        self.assertEqual(starts_one_ends(7), 1800000)

    # Extends test_two_digits_inclusive_or: the shared set now has 10**6
    # members, catching implementations that always subtract just one.
    def test_eight_digits(self):
        # Starts: 10**7; ends: 9*10**6; both: 10**6.
        self.assertEqual(starts_one_ends(8), 18000000)

    # Extends test_three_digits_excludes_leading_zero: lengths themselves can
    # have two decimal digits; counting their digits is not the requested task.
    def test_ten_digits(self):
        # 10**9 + 9*10**8 - 10**8 = 18*10**8.
        self.assertEqual(starts_one_ends(10), 1800000000)

    # Extends test_six_digits_with_multiple_interior_digits: the count exceeds
    # a 32-bit integer, catching fixed-width overflow or truncation.
    def test_eleven_digits(self):
        # 10**10 + 9*10**9 - 10**9 = 18*10**9.
        self.assertEqual(starts_one_ends(11), 18000000000)

    # Extends test_six_digits_with_multiple_interior_digits: the count also
    # exceeds a 64-bit integer; the spec does not bound the positive length.
    def test_twenty_digits(self):
        # Starts: 10**19; ends: 9*10**18; both: 10**18.
        self.assertEqual(starts_one_ends(20), 18 * 10**18)

    # Extends test_two_digits_inclusive_or: a large union must remain exact,
    # catching floating-point approximations that happen to fit small cases.
    def test_twenty_five_digits_exact_count(self):
        # Starts: 10**24; ends: 9*10**23; both: 10**23.
        self.assertEqual(starts_one_ends(25), 18 * 10**23)

    # Extends test_three_digits_excludes_leading_zero: many interior positions
    # still give nine choices, not ten, for a free leading digit.
    def test_one_hundred_digits(self):
        # 10**99 + 9*10**98 - 10**98 = 18*10**98.
        self.assertEqual(starts_one_ends(100), 18 * 10**98)

    # Extends test_six_digits_with_multiple_interior_digits: a positive length
    # beyond floating-point exponent limits is allowed by the docstring.
    def test_one_thousand_digits(self):
        # 10**999 + 9*10**998 - 10**998 = 18*10**998;
        # integer exponentiation keeps this hand-derived count exact.
        self.assertEqual(starts_one_ends(1000), 18 * 10**998)
