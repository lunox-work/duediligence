import unittest

from src.solution import greatest_common_divisor


class TestGreatestCommonDivisor(unittest.TestCase):
    # Docstring examples.

    def test_example_coprime_3_5(self):
        self.assertEqual(greatest_common_divisor(3, 5), 1)

    def test_example_25_15(self):
        self.assertEqual(greatest_common_divisor(25, 15), 5)

    # Rule: return the greatest common divisor of a and b.

    def test_typical_12_18(self):
        # Divisors of 12: 1,2,3,4,6,12; of 18: 1,2,3,6,9,18. Largest shared: 6.
        self.assertEqual(greatest_common_divisor(12, 18), 6)

    def test_typical_larger_values(self):
        # 462 = 2*3*7*11, 1071 = 3^2*7*17; shared factors 3*7 = 21.
        self.assertEqual(greatest_common_divisor(462, 1071), 21)

    def test_argument_order_does_not_matter(self):
        # Common divisors of a and b do not depend on argument order,
        # so this is the 25, 15 example swapped.
        self.assertEqual(greatest_common_divisor(15, 25), 5)

    def test_boundary_one_divides_the_other(self):
        # 7 divides 21, and no divisor of 7 exceeds 7.
        self.assertEqual(greatest_common_divisor(7, 21), 7)

    def test_boundary_equal_arguments(self):
        # Every divisor of 10 is common to (10, 10); the largest is 10.
        self.assertEqual(greatest_common_divisor(10, 10), 10)

    def test_boundary_one(self):
        # 1's only positive divisor is 1.
        self.assertEqual(greatest_common_divisor(1, 9), 1)

    def test_boundary_zero_argument(self):
        # Every integer divides 0, so the common divisors of 0 and 5 are
        # exactly the divisors of 5; the largest is 5.
        self.assertEqual(greatest_common_divisor(0, 5), 5)

    def test_boundary_negative_argument(self):
        # Divisors of -6 are those of 6 up to sign, so the common divisors
        # of -6 and 4 are +-1, +-2. The docstring says "a" greatest common
        # divisor, so only the magnitude is asserted.
        self.assertEqual(abs(greatest_common_divisor(-6, 4)), 2)


if __name__ == "__main__":
    unittest.main()
