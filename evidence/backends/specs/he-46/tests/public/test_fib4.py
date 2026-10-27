import unittest

from src.solution import fib4


class TestFib4(unittest.TestCase):
    def test_docstring_example_five(self):
        self.assertEqual(fib4(5), 4)

    def test_docstring_example_six(self):
        self.assertEqual(fib4(6), 8)

    def test_docstring_example_seven(self):
        self.assertEqual(fib4(7), 14)

    def test_initial_value_zero(self):
        self.assertEqual(fib4(0), 0)

    def test_initial_value_one(self):
        self.assertEqual(fib4(1), 0)

    def test_initial_value_two(self):
        self.assertEqual(fib4(2), 2)

    def test_initial_value_three(self):
        self.assertEqual(fib4(3), 0)

    def test_recurrence_first_applicable_index(self):
        # From the initial values: fib4(4) = 0 + 2 + 0 + 0 = 2.
        self.assertEqual(fib4(4), 2)

    def test_recurrence_later_index(self):
        # fib4(4) = 2; with the examples, fib4(8) = 14 + 8 + 4 + 2 = 28.
        self.assertEqual(fib4(8), 28)
