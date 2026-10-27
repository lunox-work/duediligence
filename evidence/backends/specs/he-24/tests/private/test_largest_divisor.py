import unittest

from src.solution import largest_divisor


class TestLargestDivisorPrivate(unittest.TestCase):
    # Extends test_docstring_example: the least factor need not be 3.
    def test_product_of_five_and_seven(self):
        # 35 = 5 * 7; its positive proper divisors are 1, 5, 7.
        self.assertEqual(largest_divisor(35), 7)

    # Extends test_docstring_example: both prime factors exceed 5.
    def test_product_of_seven_and_eleven(self):
        # 77 = 7 * 11; its positive proper divisors are 1, 7, 11.
        self.assertEqual(largest_divisor(77), 11)

    # Extends test_docstring_example: the answer can itself be composite.
    def test_product_of_three_distinct_odd_primes(self):
        # 105 = 3 * 5 * 7; dividing by the least prime factor gives 35.
        self.assertEqual(largest_divisor(105), 35)

    # Extends test_docstring_example: factors can all exceed a small lookup table.
    def test_product_of_seventeen_nineteen_and_twenty_three(self):
        # 7429 = 17 * 19 * 23; the least prime factor is 17, so 7429/17=437.
        self.assertEqual(largest_divisor(7429), 437)

    # Extends test_even_composite: the first even composite is also a square.
    def test_four(self):
        # The positive proper divisors of 4 are 1 and 2.
        self.assertEqual(largest_divisor(4), 2)

    # Extends test_even_composite: a product of two distinct primes.
    def test_six(self):
        # The positive proper divisors of 6 are 1, 2, 3.
        self.assertEqual(largest_divisor(6), 3)

    # Extends test_even_composite: the largest proper divisor can be odd.
    def test_twice_an_odd_prime(self):
        # 194 = 2 * 97; division by the least factor 2 gives 97.
        self.assertEqual(largest_divisor(194), 97)

    # Extends test_even_composite: a square's answer need not be its square root.
    def test_even_square(self):
        # 144 = 2 * 72, and no proper divisor can exceed n/2.
        self.assertEqual(largest_divisor(144), 72)

    # Extends test_even_composite: larger powers of two retain the n/2 rule.
    def test_power_of_two(self):
        # 256 = 2 * 128, and no proper divisor can exceed n/2.
        self.assertEqual(largest_divisor(256), 128)

    # Extends test_odd_composite_with_multiple_proper_divisors: no factor 3.
    def test_five_squared_times_seven(self):
        # 175 = 5^2 * 7; division by the least prime factor 5 gives 35.
        self.assertEqual(largest_divisor(175), 35)

    # Extends test_odd_composite_with_multiple_proper_divisors: no factor 3 or 5.
    def test_seven_times_eleven_times_thirteen(self):
        # 1001 = 7 * 11 * 13; its least prime factor is 7, giving 143.
        self.assertEqual(largest_divisor(1001), 143)

    # Extends test_odd_composite_with_multiple_proper_divisors: repeated factors.
    def test_large_odd_composite(self):
        # 945 = 3^3 * 5 * 7; its least prime factor is 3, giving 315.
        self.assertEqual(largest_divisor(945), 315)

    # Extends test_odd_composite_with_multiple_proper_divisors: a composite square.
    def test_odd_square_with_distinct_prime_factors(self):
        # 225 = 3^2 * 5^2; division by the least prime factor 3 gives 75.
        self.assertEqual(largest_divisor(225), 75)

    # Extends test_odd_composite_with_multiple_proper_divisors: an odd prime cube.
    def test_cube_of_three(self):
        # The positive proper divisors of 27 are 1, 3, 9.
        self.assertEqual(largest_divisor(27), 9)

    # Extends test_odd_composite_with_multiple_proper_divisors: a fourth power.
    def test_fourth_power_of_three(self):
        # The positive proper divisors of 81 are 1, 3, 9, 27.
        self.assertEqual(largest_divisor(81), 27)

    # Extends test_odd_composite_with_multiple_proper_divisors: a different cube.
    def test_cube_of_seven(self):
        # The positive proper divisors of 343 are 1, 7, 49.
        self.assertEqual(largest_divisor(343), 49)

    # Extends test_square_of_a_prime: the smallest odd prime square.
    def test_square_of_three(self):
        # The positive proper divisors of 9 are 1 and 3.
        self.assertEqual(largest_divisor(9), 3)

    # Extends test_square_of_a_prime: another square below the visible example.
    def test_square_of_five(self):
        # The positive proper divisors of 25 are 1 and 5.
        self.assertEqual(largest_divisor(25), 5)

    # Extends test_square_of_a_prime: trial division must include the square root.
    def test_square_of_eleven(self):
        # The positive proper divisors of 121 are 1 and 11.
        self.assertEqual(largest_divisor(121), 11)

    # Extends test_square_of_a_prime: a larger prime square.
    def test_square_of_thirty_one(self):
        # The positive proper divisors of 961 are 1 and 31.
        self.assertEqual(largest_divisor(961), 31)

    # Extends test_prime_excludes_the_number_itself: the smallest odd prime.
    def test_prime_three(self):
        # The only positive proper divisor of the prime 3 is 1.
        self.assertEqual(largest_divisor(3), 1)

    # Extends test_prime_excludes_the_number_itself: beyond small prime tables.
    def test_prime_ninety_seven(self):
        # 97 has no prime factor among 2, 3, 5, 7 (all primes <= sqrt(97)).
        self.assertEqual(largest_divisor(97), 1)

    # Extends test_prime_excludes_the_number_itself: just above a power of two.
    def test_prime_two_hundred_fifty_seven(self):
        # None of 2, 3, 5, 7, 11, 13 divides 257; these cover primes <= sqrt(257).
        self.assertEqual(largest_divisor(257), 1)

    # Extends test_smallest_positive_number_with_a_proper_divisor: n=2 alone
    # cannot distinguish returning 1 for every input from finding a divisor.
    def test_next_even_number_with_an_odd_largest_divisor(self):
        # The positive proper divisors of 10 are 1, 2, 5.
        self.assertEqual(largest_divisor(10), 5)
