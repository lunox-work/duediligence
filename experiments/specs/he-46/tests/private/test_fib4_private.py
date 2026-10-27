import unittest

from src.solution import fib4


def brute_fib4(n):
    # Obviously correct: build the sequence forward from the docstring's four
    # base values, appending the sum of the previous four each step.
    seq = [0, 0, 2, 0]
    while len(seq) <= n:
        seq.append(seq[-1] + seq[-2] + seq[-3] + seq[-4])
    return seq[n]


# Sequence derived by hand from the docstring's definition:
# n:       0  1  2  3  4  5  6  7   8   9   10   11   12   13   14    15
# fib4(n): 0  0  2  0  2  4  8  14  28  54  104  200  386  744  1434  2764
# fib4(11) = 104 + 54 + 28 + 14 = 200
# fib4(12) = 200 + 104 + 54 + 28 = 386
# fib4(13) = 386 + 200 + 104 + 54 = 744
# fib4(14) = 744 + 386 + 200 + 104 = 1434
# fib4(15) = 1434 + 744 + 386 + 200 = 2764
class TestFib4Private(unittest.TestCase):
    # Extends test_example_fib4_5 / _6 / _7 and test_recurrence_n10: indices
    # just past the visible ones, which a lookup table of 0..10 gets wrong.
    def test_hand_value_n9(self):
        self.assertEqual(fib4(9), 54)

    def test_hand_value_n11(self):
        self.assertEqual(fib4(11), 200)

    def test_hand_value_n12(self):
        self.assertEqual(fib4(12), 386)

    def test_hand_value_n13(self):
        self.assertEqual(fib4(13), 744)

    def test_hand_value_n14(self):
        self.assertEqual(fib4(14), 1434)

    def test_hand_value_n15(self):
        self.assertEqual(fib4(15), 2764)

    # Extends test_base_value_n0..n3 and test_recurrence_first_index_n4:
    # every index 0..40 in one sweep, against the forward brute force.
    def test_all_values_0_to_40_match_brute_force(self):
        for n in range(41):
            with self.subTest(n=n):
                self.assertEqual(fib4(n), brute_fib4(n))

    # Extends test_base_value_n0..n3: calling in descending order must not
    # change results (no state leaking between calls).
    def test_descending_call_order(self):
        expected = [0, 0, 2, 0, 2, 4, 8, 14, 28, 54, 104]
        got = [fib4(n) for n in range(10, -1, -1)]
        self.assertEqual(got, expected[::-1])

    # Extends test_large_n_satisfies_recurrence: the public test only checks
    # that fib4(1000) equals the sum of its four predecessors, which an
    # implementation returning 0 for every n > 10 also satisfies. Check the
    # exact value against the forward brute force.
    def test_n1000_exact_value(self):
        self.assertEqual(fib4(1000), brute_fib4(1000))

    def test_n100_exact_value(self):
        self.assertEqual(fib4(100), brute_fib4(100))

    def test_n20_through_30_exact_values(self):
        for n in range(20, 31):
            with self.subTest(n=n):
                self.assertEqual(fib4(n), brute_fib4(n))

    # Extends test_large_n_satisfies_recurrence: "efficiently" and "Do not use
    # recursion" -- n = 20000 overflows the default recursion limit for a
    # recursive (even memoised) implementation and is out of reach of the
    # naive exponential one. The value must be exact (no float rounding).
    def test_n20000_exact_value(self):
        self.assertEqual(fib4(20000), brute_fib4(20000))

    # The docstring examples print integers (4, 8, 14), so results are ints;
    # a float-based implementation would also lose precision here.
    def test_result_is_int_large(self):
        result = fib4(500)
        self.assertIsInstance(result, int)
        self.assertEqual(result, brute_fib4(500))

    def test_result_is_int_small(self):
        self.assertIsInstance(fib4(7), int)
        self.assertEqual(fib4(7), 14)

    # Rule: the recurrence holds at every n >= 4, not just at 1000.
    def test_recurrence_holds_4_to_200(self):
        values = [fib4(n) for n in range(201)]
        for n in range(4, 201):
            with self.subTest(n=n):
                self.assertEqual(
                    values[n],
                    values[n - 1] + values[n - 2] + values[n - 3] + values[n - 4],
                )


if __name__ == "__main__":
    unittest.main()
