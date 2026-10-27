import unittest

from src.solution import fib


class TestFib(unittest.TestCase):
    def test_docstring_tenth_number(self):
        self.assertEqual(fib(10), 55)

    def test_docstring_first_number(self):
        # The first positive index is the lower boundary tested here.
        self.assertEqual(fib(1), 1)

    def test_docstring_eighth_number(self):
        self.assertEqual(fib(8), 21)

    def test_second_number(self):
        # The Fibonacci sequence starts 1, 1, so its second number is 1.
        self.assertEqual(fib(2), 1)

    def test_sixth_number(self):
        # Adding consecutive terms gives 1, 1, 2, 3, 5, 8.
        self.assertEqual(fib(6), 8)
