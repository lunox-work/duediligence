import unittest

from src.solution import fib


class TestFib(unittest.TestCase):
    # Docstring examples.

    def test_example_fib_10(self):
        self.assertEqual(fib(10), 55)

    def test_example_fib_1(self):
        self.assertEqual(fib(1), 1)

    def test_example_fib_8(self):
        self.assertEqual(fib(8), 21)

    # Rule: return the n-th Fibonacci number. The examples fix the indexing
    # as fib(1) = 1, fib(2) = 1, fib(3) = 2, ... (fib(8) = 21 and
    # fib(10) = 55 only fit that convention). n = 0 and negative n are not
    # covered by the docstring, so they are not tested.

    def test_typical_fib_12(self):
        # By hand from fib(10) = 55: fib(9) = 55 - 21 = 34,
        # fib(11) = 34 + 55 = 89, fib(12) = 55 + 89 = 144.
        self.assertEqual(fib(12), 144)

    def test_boundary_fib_2(self):
        # Smallest n after the base case. Sequence 1, 1, 2, 3, 5, 8, 13, 21
        # gives fib(8) = 21 as in the docstring, so fib(2) = 1.
        self.assertEqual(fib(2), 1)


if __name__ == "__main__":
    unittest.main()
