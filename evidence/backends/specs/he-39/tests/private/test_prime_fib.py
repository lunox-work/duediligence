import math
import unittest

from src.solution import prime_fib


def _prime_fibonacci_prefix(count):
    # Brute force oracle: enumerate every Fibonacci number in order and try
    # every possible divisor through its square root. This proves primality
    # and ensures that no qualifying Fibonacci number is skipped.
    result = []
    previous, current = 0, 1
    while len(result) < count:
        if current >= 2 and all(
            current % divisor != 0
            for divisor in range(2, math.isqrt(current) + 1)
        ):
            result.append(current)
        previous, current = current, previous + current
    return result


class TestPrimeFibPrivate(unittest.TestCase):
    # Extends test_example_first_prime_fibonacci: one-based counting must
    # remain correct beyond a lookup table of the seven public answers.
    def test_eighth_prime_fibonacci(self):
        expected = _prime_fibonacci_prefix(8)
        self.assertEqual(prime_fib(8), expected[7])

    # Extends test_example_second_prime_fibonacci: a later query followed by
    # repeated earlier queries catches a generator consumed across calls.
    def test_second_rank_after_later_queries(self):
        expected = _prime_fibonacci_prefix(9)
        for rank in (9, 2, 8, 2):
            self.assertEqual(prime_fib(rank), expected[rank - 1])

    # Extends test_example_third_prime_fibonacci: nonmonotonic queries with
    # duplicates must return the same mathematical sequence elements.
    def test_third_rank_interleaved_with_large_ranks(self):
        expected = _prime_fibonacci_prefix(10)
        for rank in (10, 3, 1, 10, 3):
            self.assertEqual(prime_fib(rank), expected[rank - 1])

    # Extends test_example_fourth_prime_fibonacci: continue filtering the
    # Fibonacci sequence well beyond the first gap between prime values.
    def test_ninth_prime_fibonacci(self):
        expected = _prime_fibonacci_prefix(9)
        self.assertEqual(prime_fib(9), expected[8])

    # Extends test_example_fifth_prime_fibonacci: descending queries through
    # all eleven ranks and a repeated fifth query exercise independent calls.
    def test_descending_ranks_and_repeated_fifth(self):
        expected = _prime_fibonacci_prefix(11)
        for rank in (*range(11, 0, -1), 5, 5):
            self.assertEqual(prime_fib(rank), expected[rank - 1])

    # Extends test_sixth_prime_fibonacci_skips_even_number: skipping even
    # numbers alone is insufficient across the larger gaps before rank ten.
    def test_tenth_prime_fibonacci(self):
        expected = _prime_fibonacci_prefix(10)
        self.assertEqual(prime_fib(10), expected[9])

    # Extends test_seventh_prime_fibonacci_skips_odd_composites: trial division
    # must reach beyond the small divisors sufficient for the public values.
    # The eleventh result also exceeds the maximum signed 32-bit integer.
    def test_eleventh_prime_fibonacci(self):
        expected = _prime_fibonacci_prefix(11)
        self.assertEqual(prime_fib(11), expected[10])
