import unittest

from src.solution import fibfib


def expected_terms(last_index):
    # Directly tabulate the defining recurrence with exact integer addition.
    # Keeping every term makes this oracle independent of rolling-buffer logic.
    terms = [0, 0, 1]
    for index in range(3, last_index + 1):
        terms.append(terms[index - 1] + terms[index - 2] + terms[index - 3])
    return terms[:last_index + 1]


class TestFibFibHidden(unittest.TestCase):
    # Extends TestFibFib.test_docstring_example_one: a base case after growth
    # catches a result or accumulator incorrectly retained between calls.
    def test_index_one_after_nonzero_result(self):
        # f(9) = 24 + 13 + 7 = 44; f(1) is a specified base case.
        self.assertEqual(fibfib(9), 44)
        self.assertEqual(fibfib(1), 0)

    # Extends TestFibFib.test_docstring_example_five: the next term is not
    # twice the preceding term, despite f(4) and f(5) fitting that shortcut.
    def test_sixth_element(self):
        # f(6) = f(5) + f(4) + f(3) = 4 + 2 + 1.
        self.assertEqual(fibfib(6), 7)

    # Extends TestFibFib.test_docstring_example_eight: a neighboring value
    # defeats a lookup containing only the displayed examples.
    def test_ninth_element(self):
        # f(9) = f(8) + f(7) + f(6) = 24 + 13 + 7.
        self.assertEqual(fibfib(9), 44)

    # Extends TestFibFib.test_initial_value_zero: revisit zero after a later
    # index to catch stateful implementations that cannot move backward.
    def test_zero_after_later_index(self):
        # Repeated recurrence gives f(12..15) = 274, 504, 927, 1705.
        self.assertEqual(fibfib(15), 1705)
        self.assertEqual(fibfib(0), 0)

    # Extends TestFibFib.test_initial_value_two: request the exceptional
    # nonzero base value after computing a non-base value.
    def test_two_after_later_index(self):
        # f(12) = f(11) + f(10) + f(9) = 149 + 81 + 44.
        self.assertEqual(fibfib(12), 274)
        self.assertEqual(fibfib(2), 1)

    # Extends TestFibFib.test_first_recurrence_step: test a recurrence step
    # with three distinct positive summands, beyond special-cased starts.
    def test_seventh_element(self):
        # f(7) = f(6) + f(5) + f(4) = 7 + 4 + 2.
        self.assertEqual(fibfib(7), 13)

    # Extends TestFibFib.test_recurrence_after_first_step: later terms expose
    # using only two predecessors or extending an initial doubling pattern.
    def test_tenth_element(self):
        # f(10) = f(9) + f(8) + f(7) = 44 + 24 + 13.
        self.assertEqual(fibfib(10), 81)

    # Extends TestFibFib.test_larger_index: go beyond its largest argument,
    # catching tables ending at 40 and an isolated special case for 40.
    def test_immediately_beyond_public_largest_index(self):
        # f(41) = f(40) + f(39) + f(38).
        self.assertEqual(fibfib(41), 7046319384 + 3831006429 + 2082876103)

    def test_contiguous_small_indices(self):
        # Every expectation is generated directly from the three base cases.
        expected = expected_terms(25)
        for index in range(26):
            with self.subTest(index=index):
                self.assertEqual(fibfib(index), expected[index])

    def test_descending_indices(self):
        # Direct recurrence oracle; descending calls exercise shrinking indices.
        expected = expected_terms(32)
        for index in range(32, -1, -1):
            with self.subTest(index=index):
                self.assertEqual(fibfib(index), expected[index])

    def test_repeated_nonbase_index(self):
        # The same mathematical argument must retain its recurrence-derived value.
        expected = expected_terms(19)[19]
        for repetition in range(4):
            with self.subTest(repetition=repetition):
                self.assertEqual(fibfib(19), expected)

    def test_interleaved_large_small_and_duplicate_indices(self):
        # Direct recurrence oracle; no assumption about the order of calls.
        expected = expected_terms(83)
        for index in (52, 3, 83, 0, 2, 52, 17, 1, 82, 4, 83):
            with self.subTest(index=index):
                self.assertEqual(fibfib(index), expected[index])

    def test_integer_precision_beyond_floating_point(self):
        # Exact repeated addition detects approximate closed forms or float sums.
        self.assertEqual(fibfib(70), expected_terms(70)[70])

    def test_integer_precision_beyond_machine_word(self):
        # The recurrence specifies exact integers, with no machine-word modulus.
        self.assertEqual(fibfib(100), expected_terms(100)[100])

    def test_index_one_thousand(self):
        # Direct tabulation stays small and fast; naive recursive expansion does not.
        self.assertEqual(fibfib(1000), expected_terms(1000)[1000])

    def test_index_four_thousand_ninety_six(self):
        # No maximum index is stated. This also exceeds common fixed cache sizes.
        self.assertEqual(fibfib(4096), expected_terms(4096)[4096])
