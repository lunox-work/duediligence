import sys
import unittest

from src.solution import fib4


def reference_value(n):
    # Directly expand the definition: retain the entire prefix and explicitly
    # add the four preceding terms. Python integers preserve the exact result.
    values = [0, 0, 2, 0]
    for index in range(4, n + 1):
        values.append(
            values[index - 1]
            + values[index - 2]
            + values[index - 3]
            + values[index - 4]
        )
    return values[n]


class TestFib4Hidden(unittest.TestCase):
    # Extends test_docstring_example_five: a table ending at the examples fails.
    def test_ninth_term(self):
        # f(9) = f(8) + f(7) + f(6) + f(5) = 28 + 14 + 8 + 4.
        self.assertEqual(fib4(9), 54)

    # Extends test_docstring_example_six: doubling the previous term fails here.
    def test_tenth_term(self):
        # f(10) = 54 + 28 + 14 + 8.
        self.assertEqual(fib4(10), 104)

    # Extends test_docstring_example_seven: exercise another recurrence window.
    def test_eleventh_term(self):
        # f(11) = 104 + 54 + 28 + 14.
        self.assertEqual(fib4(11), 200)

    # Extends test_initial_value_zero: computing a later value must not replace
    # the initial terms in persistent state used by a subsequent call.
    def test_zero_after_fortieth_term(self):
        self.assertEqual(fib4(40), reference_value(40))
        self.assertEqual(fib4(0), 0)

    # Extends test_initial_value_one: cover a small index after a larger query,
    # including a second request for the same larger index.
    def test_one_between_repeated_queries(self):
        expected = reference_value(33)
        self.assertEqual(fib4(33), expected)
        self.assertEqual(fib4(1), 0)
        self.assertEqual(fib4(33), expected)

    # Extends test_initial_value_two: the exceptional nonzero seed must survive
    # previous computations, including repeated requests for that seed.
    def test_two_after_forty_second_term(self):
        self.assertEqual(fib4(42), reference_value(42))
        self.assertEqual(fib4(2), 2)
        self.assertEqual(fib4(2), 2)

    # Extends test_initial_value_three: index 3 is zero even after positive terms.
    def test_three_between_later_terms(self):
        self.assertEqual(fib4(31), reference_value(31))
        self.assertEqual(fib4(3), 0)
        self.assertEqual(fib4(32), reference_value(32))

    # Extends test_recurrence_first_applicable_index: apply the recurrence well
    # beyond the first window, catching hardcoded early recurrence results.
    def test_twelfth_term(self):
        # f(12) = 200 + 104 + 54 + 28.
        self.assertEqual(fib4(12), 386)

    # Extends test_recurrence_later_index: all four terms have advanced beyond
    # the original public recurrence window.
    def test_thirteenth_term(self):
        # f(13) = 386 + 200 + 104 + 54.
        self.assertEqual(fib4(13), 744)

    # Extends test_recurrence_later_index: cover many moving windows, including
    # wraparound errors in implementations that retain only four terms.
    def test_complete_unseen_prefix(self):
        for n in range(14, 81):
            with self.subTest(n=n):
                self.assertEqual(fib4(n), reference_value(n))

    # Extends test_initial_value_two and test_recurrence_later_index: repeated,
    # decreasing, and interleaved inputs cannot depend on the previous query.
    def test_interleaved_duplicate_queries(self):
        for n in (64, 17, 48, 2, 64, 0, 15, 3, 48, 1, 17, 16, 15):
            with self.subTest(n=n):
                self.assertEqual(fib4(n), reference_value(n))

    # Extends test_recurrence_later_index: exact results beyond floating-point
    # integer precision and fixed-width machine integer ranges are required.
    def test_hundredth_term_exactly(self):
        self.assertEqual(fib4(100), reference_value(100))

    # Extends test_docstring_example_seven: reject truncated tables, overflow,
    # and approximations that only reproduce short prefixes.
    def test_thousandth_term_exactly(self):
        self.assertEqual(fib4(1000), reference_value(1000))

    # Extends test_recurrence_later_index: the spec gives no upper index limit;
    # a long prefix also exercises efficient evaluation without a deep stack.
    def test_ten_thousandth_term(self):
        self.assertEqual(fib4(10000), reference_value(10000))

    # Extends test_docstring_example_five: recursive and memoized recursive
    # implementations can match every public value but violate "Do not use
    # recursion." Observe Python calls, including calls to recursive helpers.
    def test_evaluation_does_not_recurse(self):
        active = {}
        recursive_call_seen = False

        def observe(frame, event, arg):
            nonlocal recursive_call_seen
            code = frame.f_code
            if event == "call":
                depth = active.get(code, 0)
                if depth:
                    recursive_call_seen = True
                active[code] = depth + 1
            elif event == "return" and code in active:
                active[code] -= 1
                if active[code] == 0:
                    del active[code]

        previous_profile = sys.getprofile()
        try:
            sys.setprofile(observe)
            actual = fib4(20)
        finally:
            sys.setprofile(previous_profile)

        self.assertEqual(actual, reference_value(20))
        self.assertFalse(recursive_call_seen, "fib4 must not use recursion")
