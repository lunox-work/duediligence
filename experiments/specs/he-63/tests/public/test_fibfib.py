import unittest

from src.solution import fibfib

# Values used below, worked out by hand from the docstring's definition
# fibfib(0)=0, fibfib(1)=0, fibfib(2)=1, fibfib(n)=sum of the previous three:
#   n:      0  1  2  3  4  5  6  7   8   9   10
#   fibfib: 0  0  1  1  2  4  7  13  24  44  81
# e.g. fibfib(3) = 1+0+0 = 1, fibfib(9) = 24+13+7 = 44, fibfib(10) = 44+24+13 = 81.


class TestFibfib(unittest.TestCase):
    # Docstring examples.

    def test_example_fibfib_1(self):
        self.assertEqual(fibfib(1), 0)

    def test_example_fibfib_5(self):
        self.assertEqual(fibfib(5), 4)

    def test_example_fibfib_8(self):
        self.assertEqual(fibfib(8), 24)

    # Rule: fibfib(0) == 0. The smallest allowed input, so typical and
    # boundary coincide.

    def test_base_case_zero(self):
        self.assertEqual(fibfib(0), 0)

    # Rule: fibfib(1) == 0 (also covered by the first example).

    def test_base_case_one(self):
        self.assertEqual(fibfib(1), 0)

    # Rule: fibfib(2) == 1. The last base case; the recurrence takes over
    # just after it.

    def test_base_case_two(self):
        self.assertEqual(fibfib(2), 1)

    # Rule: fibfib(n) == fibfib(n-1) + fibfib(n-2) + fibfib(n-3).

    def test_recurrence_typical_n_10(self):
        # 44 + 24 + 13 = 81 (see table above).
        self.assertEqual(fibfib(10), 81)

    def test_recurrence_boundary_n_3(self):
        # First n the recurrence applies to: fibfib(2)+fibfib(1)+fibfib(0) = 1+0+0.
        self.assertEqual(fibfib(3), 1)

    def test_recurrence_boundary_n_4(self):
        # First n whose three predecessors include a computed term:
        # fibfib(3)+fibfib(2)+fibfib(1) = 1+1+0 = 2.
        self.assertEqual(fibfib(4), 2)

    # Rule: compute it efficiently.

    def test_efficient_typical_n_30(self):
        # Continuing the table: 11:149 12:274 13:504 14:927 15:1705 16:3136
        # 17:5768 18:10609 19:19513 20:35890 21:66012 22:121415 23:223317
        # 24:410744 25:755476 26:1389537 27:2555757 28:4700770 29:8646064
        # 30: 8646064 + 4700770 + 2555757 = 15902591.
        self.assertEqual(fibfib(30), 15902591)

    def test_efficient_boundary_large_n_recurrence_holds(self):
        # A naive triple recursion would not finish for n near 100; an
        # efficient one must, and the recurrence must still hold exactly.
        self.assertEqual(fibfib(100), fibfib(99) + fibfib(98) + fibfib(97))


if __name__ == "__main__":
    unittest.main()
