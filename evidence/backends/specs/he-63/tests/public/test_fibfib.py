import unittest

from src.solution import fibfib


class TestFibFib(unittest.TestCase):
    def test_docstring_example_one(self):
        self.assertEqual(fibfib(1), 0)

    def test_docstring_example_five(self):
        self.assertEqual(fibfib(5), 4)

    def test_docstring_example_eight(self):
        self.assertEqual(fibfib(8), 24)

    def test_initial_value_zero(self):
        self.assertEqual(fibfib(0), 0)

    def test_initial_value_two(self):
        self.assertEqual(fibfib(2), 1)

    def test_first_recurrence_step(self):
        # f(3) = f(2) + f(1) + f(0) = 1 + 0 + 0 = 1.
        self.assertEqual(fibfib(3), 1)

    def test_recurrence_after_first_step(self):
        # f(4) = f(3) + f(2) + f(1) = 1 + 1 + 0 = 2.
        self.assertEqual(fibfib(4), 2)

    def test_larger_index(self):
        # Repeated addition from the initial values gives f(30..36) =
        # 15902591, 29249425, 53798080, 98950096, 181997601,
        # 334745777, 615693474. Continuing by hand gives
        # f(37) = 615693474 + 334745777 + 181997601 = 1132436852,
        # f(38) = 1132436852 + 615693474 + 334745777 = 2082876103,
        # f(39) = 2082876103 + 1132436852 + 615693474 = 3831006429,
        # f(40) = 3831006429 + 2082876103 + 1132436852 = 7046319384.
        self.assertEqual(fibfib(40), 7046319384)
