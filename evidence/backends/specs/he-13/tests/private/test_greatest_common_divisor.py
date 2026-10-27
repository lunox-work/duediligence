import unittest

from src.solution import greatest_common_divisor


class TestGreatestCommonDivisorHidden(unittest.TestCase):
    # Extends test_docstring_coprime_example: composite inputs can be coprime.
    def test_coprime_composites(self):
        # 49 = 7^2 and 100 = 2^2 * 5^2 have no shared prime.
        self.assertEqual(greatest_common_divisor(49, 100), 1)

    # Extends test_docstring_coprime_example: many Euclidean reductions.
    def test_consecutive_fibonacci_numbers(self):
        # These are consecutive Fibonacci numbers; repeated subtraction
        # reduces their common divisors to those of 1 and 1.
        self.assertEqual(greatest_common_divisor(1346269, 2178309), 1)

    # Extends test_docstring_common_factor_example: a shared prime above 5.
    def test_shared_eleven(self):
        # 121 = 11^2 and 55 = 5 * 11, so the greatest divisor is 11.
        self.assertEqual(greatest_common_divisor(121, 55), 11)

    # Extends test_docstring_common_factor_example: the gcd is composite.
    def test_composite_common_divisor(self):
        # 84 = 42 * 2 and 126 = 42 * 3; 2 and 3 are coprime.
        self.assertEqual(greatest_common_divisor(84, 126), 42)

    # Extends test_multiple_shared_prime_factors: three distinct shared primes.
    def test_three_shared_primes(self):
        # 540 = 180 * 3 and 1260 = 180 * 7; 3 and 7 are coprime.
        self.assertEqual(greatest_common_divisor(540, 1260), 180)

    # Extends test_multiple_shared_prime_factors: unequal powers of two.
    def test_unequal_prime_exponents(self):
        # 256 = 2^8 and 96 = 2^5 * 3; use the smaller exponent, 5.
        self.assertEqual(greatest_common_divisor(256, 96), 32)

    # Extends test_equal_positive_inputs: the smallest positive integer.
    def test_equal_units(self):
        # 1 is the largest divisor of 1.
        self.assertEqual(greatest_common_divisor(1, 1), 1)

    # Extends test_equal_positive_inputs: equality with negative inputs.
    def test_equal_negative_inputs(self):
        # The positive divisors of -97 are 1 and 97.
        self.assertEqual(greatest_common_divisor(-97, -97), 97)

    # Extends test_equal_positive_inputs: integers exceed fixed-width ranges.
    def test_equal_large_integers(self):
        value = 2**127 + 19
        # A positive integer is its own greatest divisor.
        self.assertEqual(greatest_common_divisor(value, value), value)

    # Extends test_first_input_divides_second: a different factor and quotient.
    def test_first_input_divides_square(self):
        # 1225 = 35^2; every common divisor must divide 35.
        self.assertEqual(greatest_common_divisor(35, 1225), 35)

    # Extends test_second_input_divides_first: reverse the larger example.
    def test_second_input_divides_square(self):
        # 1225 = 35^2; every common divisor must divide 35.
        self.assertEqual(greatest_common_divisor(1225, 35), 35)

    # Extends test_one_as_an_input: place 1 in the second position.
    def test_second_input_is_one(self):
        # Only 1 is a positive divisor of the second input.
        self.assertEqual(greatest_common_divisor(987654321, 1), 1)

    # Extends test_one_as_an_input and test_negative_first_input: negative unit.
    def test_first_input_is_negative_one(self):
        # The only positive divisor of -1 is 1.
        self.assertEqual(greatest_common_divisor(-1, 91), 1)

    # Extends test_one_as_an_input and test_negative_second_input: negative unit.
    def test_second_input_is_negative_one(self):
        # The only positive divisor of -1 is 1.
        self.assertEqual(greatest_common_divisor(91, -1), 1)

    # Extends test_zero_first_input: combine zero with a negative integer.
    def test_zero_then_negative(self):
        # Every divisor of -81 divides 0; the greatest is 81.
        self.assertEqual(greatest_common_divisor(0, -81), 81)

    # Extends test_zero_second_input: combine a negative integer with zero.
    def test_negative_then_zero(self):
        # Every divisor of -81 divides 0; the greatest is 81.
        self.assertEqual(greatest_common_divisor(-81, 0), 81)

    # Extends test_zero_first_input and test_one_as_an_input: zero and one.
    def test_zero_then_one(self):
        # Only 1 is a positive divisor of 1, and it divides 0.
        self.assertEqual(greatest_common_divisor(0, 1), 1)

    # Extends test_zero_second_input and test_negative_first_input: zero and -1.
    def test_negative_one_then_zero(self):
        # Only 1 is a positive divisor of -1, and it divides 0.
        self.assertEqual(greatest_common_divisor(-1, 0), 1)

    # Extends test_negative_first_input: the negative input has larger magnitude.
    def test_negative_first_has_larger_magnitude(self):
        # Signs preserve divisibility; 105 = 35 * 3 and 70 = 35 * 2.
        self.assertEqual(greatest_common_divisor(-105, 70), 35)

    # Extends test_negative_second_input: different magnitudes and common factor.
    def test_negative_second_has_larger_magnitude(self):
        # Signs preserve divisibility; 70 = 35 * 2 and 105 = 35 * 3.
        self.assertEqual(greatest_common_divisor(70, -105), 35)

    # Extends test_both_inputs_negative: a larger composite common divisor.
    def test_both_negative_with_composite_gcd(self):
        # Signs preserve divisibility; 84 = 42 * 2 and 126 = 42 * 3.
        self.assertEqual(greatest_common_divisor(-84, -126), 42)

    # Extends test_both_inputs_negative: no shared prime factors.
    def test_both_negative_and_coprime(self):
        # 35 = 5 * 7 and 64 = 2^6 have no shared prime.
        self.assertEqual(greatest_common_divisor(-35, -64), 1)

    # Extends test_docstring_coprime_example: preserve precision for large inputs.
    def test_large_consecutive_integers(self):
        value = 2**100 + 7
        # Any common divisor divides their difference, 1.
        self.assertEqual(greatest_common_divisor(value, value + 1), 1)

    # Extends test_multiple_shared_prime_factors: a very large common divisor.
    def test_large_common_factor(self):
        common = 2**100 + 7
        # gcd(common * 35, common * 64) = common because 35 and 64 are coprime.
        self.assertEqual(greatest_common_divisor(common * 35, common * 64), common)

    # Extends test_second_input_divides_first: large powers beyond 64-bit values.
    def test_large_powers_of_two(self):
        # The smaller power, 2^127, divides 2^130 exactly.
        self.assertEqual(greatest_common_divisor(2**130, 2**127), 2**127)

    # Extends test_zero_first_input: zero with an integer beyond fixed-width limits.
    def test_zero_then_large_positive(self):
        value = 2**150 + 1
        # Every divisor of value divides 0; value itself is the greatest.
        self.assertEqual(greatest_common_divisor(0, value), value)
