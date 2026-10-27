import unittest

from src.solution import factorize


# Inputs are kept to n >= 2: the docstring speaks of "prime factors" and of
# the input being "equal to the product of all factors", so n = 1, 0 and
# negative numbers are left out as cases it does not clearly answer.
class TestFactorize(unittest.TestCase):
    # --- Docstring examples ---

    def test_docstring_example_8(self):
        self.assertEqual(factorize(8), [2, 2, 2])

    def test_docstring_example_25(self):
        self.assertEqual(factorize(25), [5, 5])

    def test_docstring_example_70(self):
        self.assertEqual(factorize(70), [2, 5, 7])

    # --- Rule: prime factors, ordered smallest to largest ---

    def test_order_typical_distinct_primes(self):
        # 30 = 2 * 3 * 5; all three are prime, listed ascending.
        self.assertEqual(factorize(30), [2, 3, 5])

    def test_order_boundary_smallest_prime(self):
        # 2 is the smallest prime; its only prime factor is itself.
        self.assertEqual(factorize(2), [2])

    # --- Rule: each factor repeated as often as it appears ---

    def test_multiplicity_typical_mixed_powers(self):
        # 72 = 8 * 9 = 2^3 * 3^2, so 2 three times then 3 twice.
        self.assertEqual(factorize(72), [2, 2, 2, 3, 3])

    def test_multiplicity_boundary_smallest_repeated(self):
        # 4 = 2 * 2 is the smallest number with a repeated prime factor.
        self.assertEqual(factorize(4), [2, 2])

    # --- Rule: the product of the factors equals the input ---

    def test_product_typical_odd_composite(self):
        # 3 * 5 * 7 * 11 = 15 * 77 = 1155; 1155 is odd, so 2 is absent.
        self.assertEqual(factorize(1155), [3, 5, 7, 11])

    def test_product_boundary_large_prime(self):
        # 9973 is prime (no prime p <= 99, since 100^2 > 9973, divides it),
        # so the only factorization whose product is 9973 is [9973].
        self.assertEqual(factorize(9973), [9973])


if __name__ == "__main__":
    unittest.main()
