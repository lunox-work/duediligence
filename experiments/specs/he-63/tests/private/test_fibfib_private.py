import time
import unittest

from src.solution import fibfib


def brute_fibfib(n):
    # Obviously correct oracle: start from the three base values the
    # docstring gives and apply fibfib(k) = fibfib(k-1)+fibfib(k-2)+fibfib(k-3)
    # forward, one step at a time, with exact Python ints.
    values = [0, 0, 1]
    while len(values) <= n:
        values.append(values[-1] + values[-2] + values[-3])
    return values[n]


# Small values worked out by hand from the definition:
#   n:      0  1  2  3  4  5  6  7   8   9   10  11   12   13   14   15
#   fibfib: 0  0  1  1  2  4  7  13  24  44  81  149  274  504  927  1705
# e.g. 6 = 4+2+1, 7 = 7+4+2, 11 = 81+44+24, 12 = 149+81+44, 13 = 274+149+81,
# 14 = 504+274+149, 15 = 927+504+274.


class TestFibfibPrivate(unittest.TestCase):
    # Extends test_example_fibfib_5 / test_example_fibfib_8: the values
    # between and after the examples, which a table of the visible values
    # would not contain.

    def test_hand_value_n_6(self):
        self.assertEqual(fibfib(6), 7)

    def test_hand_value_n_7(self):
        self.assertEqual(fibfib(7), 13)

    def test_hand_value_n_9(self):
        self.assertEqual(fibfib(9), 44)

    # Extends test_recurrence_typical_n_10: the next terms past 10.

    def test_hand_value_n_11(self):
        self.assertEqual(fibfib(11), 149)

    def test_hand_value_n_12(self):
        self.assertEqual(fibfib(12), 274)

    def test_hand_value_n_15(self):
        self.assertEqual(fibfib(15), 1705)

    # Extends test_base_case_zero / test_base_case_one / test_base_case_two
    # and the recurrence boundary tests: every n from 0 to 60 against the
    # oracle, catching wrong seeds (e.g. tribonacci starting 0, 1, 1) and
    # off-by-one shifts anywhere in the range.

    def test_every_n_0_to_60_matches_oracle(self):
        for n in range(61):
            with self.subTest(n=n):
                self.assertEqual(fibfib(n), brute_fibfib(n))

    # Extends test_recurrence_boundary_n_3 / test_recurrence_boundary_n_4:
    # the recurrence must hold at every n >= 3, not only at the first ones.

    def test_recurrence_holds_for_n_3_to_80(self):
        for n in range(3, 81):
            with self.subTest(n=n):
                self.assertEqual(fibfib(n), fibfib(n - 1) + fibfib(n - 2) + fibfib(n - 3))

    # Extends test_efficient_typical_n_30: other mid-size values, exact.

    def test_value_n_20(self):
        # Value given in the public table's continuation, rechecked by oracle.
        self.assertEqual(fibfib(20), 35890)
        self.assertEqual(fibfib(20), brute_fibfib(20))

    def test_value_n_50(self):
        self.assertEqual(fibfib(50), brute_fibfib(50))

    # Extends test_efficient_boundary_large_n_recurrence_holds: that test
    # only checks the recurrence near 100, which any function satisfying the
    # recurrence there (even one returning 0 for large n) passes. Check the
    # exact values instead.

    def test_exact_value_n_100(self):
        self.assertEqual(fibfib(100), brute_fibfib(100))

    def test_exact_value_n_100_nonzero(self):
        # Shortcut returning 0 (or any constant) for large n: fibfib is
        # increasing from n=3 on, so fibfib(100) > fibfib(99) > 0.
        self.assertGreater(fibfib(100), fibfib(99))
        self.assertGreater(fibfib(99), 0)

    def test_exact_value_n_300_big_integer(self):
        # Far beyond float precision: a closed-form/float implementation
        # would lose exactness here.
        self.assertEqual(fibfib(300), brute_fibfib(300))

    def test_exact_value_n_500(self):
        self.assertEqual(fibfib(500), brute_fibfib(500))

    # Rule: compute it efficiently. A naive triple recursion takes far longer
    # than a second at n=35 (tens of millions of calls).

    def test_efficient_n_35_fast(self):
        start = time.perf_counter()
        result = fibfib(35)
        elapsed = time.perf_counter() - start
        self.assertEqual(result, brute_fibfib(35))
        self.assertLess(elapsed, 1.0)

    # Results are integers: the doctests print 0, 4 and 24, which a float
    # result (0.0, 4.0, 24.0) would not.

    def test_result_is_int_small(self):
        for n in (0, 1, 2, 5, 8):
            with self.subTest(n=n):
                self.assertIsInstance(fibfib(n), int)

    def test_result_is_int_large(self):
        self.assertIsInstance(fibfib(100), int)

    # Calls are independent: a large call first must not disturb a later
    # small one (e.g. a mis-managed shared cache), and repeated calls agree.

    def test_large_then_small_calls(self):
        fibfib(200)
        self.assertEqual(fibfib(3), 1)
        self.assertEqual(fibfib(0), 0)
        self.assertEqual(fibfib(13), 504)

    def test_descending_order_calls(self):
        for n in range(40, -1, -1):
            with self.subTest(n=n):
                self.assertEqual(fibfib(n), brute_fibfib(n))

    def test_repeated_call_same_result(self):
        first = fibfib(77)
        second = fibfib(77)
        self.assertEqual(first, second)
        self.assertEqual(first, brute_fibfib(77))


if __name__ == "__main__":
    unittest.main()
