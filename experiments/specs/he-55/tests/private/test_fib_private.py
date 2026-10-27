import unittest

from src.solution import fib


def brute_fib(n):
    # Iterative reference: starts from fib(1) = fib(2) = 1, the indexing the
    # docstring examples fix (fib(8) = 21, fib(10) = 55), and adds the last
    # two terms n - 1 times.
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return a


class TestFibPrivate(unittest.TestCase):
    # Extends test_example_fib_1: the start of the sequence, fib(3) = 1 + 1.
    def test_fib_3(self):
        self.assertEqual(fib(3), 2)

    # Extends test_boundary_fib_2: next values by hand, 1, 1, 2, 3, 5.
    def test_fib_4_and_5(self):
        self.assertEqual(fib(4), 3)
        self.assertEqual(fib(5), 5)

    # Extends test_example_fib_8: the values between the docstring examples,
    # by hand from 1, 1, 2, 3, 5, 8, 13, 21, 34, 55.
    def test_fib_6_7_9(self):
        self.assertEqual(fib(6), 8)
        self.assertEqual(fib(7), 13)
        self.assertEqual(fib(9), 34)

    # Extends test_example_fib_10: fib(11) = 34 + 55 = 89.
    def test_fib_11(self):
        self.assertEqual(fib(11), 89)

    # Extends test_typical_fib_12: by hand from fib(11) = 89, fib(12) = 144:
    # fib(13) = 233, fib(14) = 377, fib(15) = 610.
    def test_fib_13_to_15(self):
        self.assertEqual(fib(13), 233)
        self.assertEqual(fib(14), 377)
        self.assertEqual(fib(15), 610)

    # Defeats a lookup table of the public values: every n from 1 to 25
    # against the iterative reference above.
    def test_fib_1_to_25_against_reference(self):
        for n in range(1, 26):
            with self.subTest(n=n):
                self.assertEqual(fib(n), brute_fib(n))

    # Extends test_typical_fib_12 to a larger n; well-known value, also
    # equal to brute_fib(20).
    def test_fib_20(self):
        self.assertEqual(fib(20), 6765)

    # Well-known value, also equal to brute_fib(25).
    def test_fib_25(self):
        self.assertEqual(fib(25), 75025)

    # The recurrence fib(n) = fib(n - 1) + fib(n - 2) holds for every n >= 3.
    def test_recurrence_holds(self):
        for n in range(3, 23):
            with self.subTest(n=n):
                self.assertEqual(fib(n), fib(n - 1) + fib(n - 2))

    # The result is an int, as the docstring examples show 55, not 55.0.
    def test_result_is_int(self):
        for n in (1, 2, 10, 20):
            with self.subTest(n=n):
                result = fib(n)
                self.assertIsInstance(result, int)
                self.assertNotIsInstance(result, bool)

    # Exactness past float precision: a Binet-formula shortcut with floats
    # rounds wrongly here. Expected value from brute_fib(100), which is the
    # well-known 354224848179261915075.
    def test_fib_100_exact(self):
        self.assertEqual(fib(100), 354224848179261915075)
        self.assertEqual(fib(100), brute_fib(100))

    # Exactness in the range where float Binet first breaks down, against
    # the reference.
    def test_fib_70_to_90_exact(self):
        for n in range(70, 91):
            with self.subTest(n=n):
                self.assertEqual(fib(n), brute_fib(n))


if __name__ == "__main__":
    unittest.main()
