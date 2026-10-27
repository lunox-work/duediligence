import unittest

from src.solution import fib4


# Sequence derived by hand from the docstring's definition:
# n:       0  1  2  3  4  5  6  7   8   9   10
# fib4(n): 0  0  2  0  2  4  8  14  28  54  104
# e.g. fib4(4) = 0 + 2 + 0 + 0 = 2, fib4(8) = 14 + 8 + 4 + 2 = 28.
class TestFib4(unittest.TestCase):
    # Docstring examples.
    def test_example_fib4_5(self):
        self.assertEqual(fib4(5), 4)

    def test_example_fib4_6(self):
        self.assertEqual(fib4(6), 8)

    def test_example_fib4_7(self):
        self.assertEqual(fib4(7), 14)

    # Rule: the four stated base values.
    def test_base_value_n0(self):
        # Boundary: the smallest index.
        self.assertEqual(fib4(0), 0)

    def test_base_value_n1(self):
        self.assertEqual(fib4(1), 0)

    def test_base_value_n2(self):
        # Typical: the only nonzero base value.
        self.assertEqual(fib4(2), 2)

    def test_base_value_n3(self):
        self.assertEqual(fib4(3), 0)

    # Rule: fib4(n) = fib4(n-1) + fib4(n-2) + fib4(n-3) + fib4(n-4).
    def test_recurrence_first_index_n4(self):
        # Boundary: first index the recurrence applies to; 0 + 2 + 0 + 0 = 2.
        self.assertEqual(fib4(4), 2)

    def test_recurrence_n8(self):
        # 14 + 8 + 4 + 2 = 28.
        self.assertEqual(fib4(8), 28)

    def test_recurrence_n10(self):
        # fib4(9) = 28 + 14 + 8 + 4 = 54; fib4(10) = 54 + 28 + 14 + 8 = 104.
        self.assertEqual(fib4(10), 104)

    # Rule: compute efficiently, without recursion. A large n must finish
    # (no exponential blow-up, no recursion-depth error), and its value must
    # still satisfy the recurrence exactly.
    def test_large_n_satisfies_recurrence(self):
        n = 1000
        self.assertEqual(
            fib4(n), fib4(n - 1) + fib4(n - 2) + fib4(n - 3) + fib4(n - 4)
        )


if __name__ == "__main__":
    unittest.main()
