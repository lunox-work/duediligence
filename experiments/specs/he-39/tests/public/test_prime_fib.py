import unittest

from src.solution import prime_fib


class TestPrimeFib(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_n1(self):
        self.assertEqual(prime_fib(1), 2)

    def test_example_n2(self):
        self.assertEqual(prime_fib(2), 3)

    def test_example_n3(self):
        self.assertEqual(prime_fib(3), 5)

    def test_example_n4(self):
        self.assertEqual(prime_fib(4), 13)

    def test_example_n5(self):
        self.assertEqual(prime_fib(5), 89)

    # Rule: returns the n-th number that is both Fibonacci and prime.
    # Fibonacci sequence by hand: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144,
    # 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, ...

    def test_typical_sixth_prime_fibonacci(self):
        # After 89 come 144 (even) and 233. 233 is not divisible by any
        # prime up to 15 (2, 3, 5, 7, 11, 13), so it is prime: the 6th.
        self.assertEqual(prime_fib(6), 233)

    def test_typical_seventh_prime_fibonacci(self):
        # After 233: 377 = 13 * 29, 610 is even, 987 = 3 * 329, all
        # composite. 1597 has no prime factor up to 39 (checked 2..37),
        # so it is prime: the 7th.
        self.assertEqual(prime_fib(7), 1597)

    def test_boundary_skips_composite_fibonacci_run(self):
        # After 1597: 2584 (even), 4181 = 37 * 113, 6765 (ends in 5),
        # 10946 (even), 17711 = 89 * 199 are all composite. 28657 has no
        # prime factor up to 169, so it is prime: the 8th.
        self.assertEqual(prime_fib(8), 28657)


if __name__ == "__main__":
    unittest.main()
