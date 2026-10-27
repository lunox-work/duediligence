import unittest

from src.solution import prime_fib


class TestPrimeFib(unittest.TestCase):
    def test_example_first_prime_fibonacci(self):
        # Lower boundary: 0 and 1 are not prime, so the first result is 2.
        self.assertEqual(prime_fib(1), 2)

    def test_example_second_prime_fibonacci(self):
        self.assertEqual(prime_fib(2), 3)

    def test_example_third_prime_fibonacci(self):
        self.assertEqual(prime_fib(3), 5)

    def test_example_fourth_prime_fibonacci(self):
        self.assertEqual(prime_fib(4), 13)

    def test_example_fifth_prime_fibonacci(self):
        self.assertEqual(prime_fib(5), 89)

    def test_sixth_prime_fibonacci_skips_even_number(self):
        # By hand: after 89 the Fibonacci numbers are 144 and 233.
        # 144 is composite; 233 has no prime divisor among 2, 3, 5, 7,
        # 11, 13 (all primes <= sqrt(233)), so it is the sixth result.
        self.assertEqual(prime_fib(6), 233)

    def test_seventh_prime_fibonacci_skips_odd_composites(self):
        # By hand: after 233 come 377 = 13*29, 610 = 2*305,
        # 987 = 3*329, then 1597. None of the primes <= sqrt(1597)
        # (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37) divides 1597,
        # so 1597 is the seventh prime Fibonacci number.
        self.assertEqual(prime_fib(7), 1597)
