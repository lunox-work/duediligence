# Only inputs whose every answer is "No" are asserted here. A "Yes" answer
# is any valid placement ("show one example"), so its exact text is not
# fixed by the statement and cannot be compared line by line.
#
# Why these are "No" (proved, not guessed):
# - A red move changes the parity of r+c and a blue move keeps it. The cycle
#   makes exactly R red moves and B blue moves and returns to its start, so
#   R must be even. R odd -> No.
# - A blue move changes r by exactly 1. With R = 0 the cycle is B blue moves
#   back to the start, so B must be even. R = 0 and B odd -> No.
import unittest

from sandbox.check import run_case


class TestNoCases(unittest.TestCase):
    def test_sample1_second_case_one_red_one_blue(self):
        # Sample 1, case 2: "1 1" -> "No" as the statement prints it.
        run_case(self, stdin="1\n1 1\n", expected="No")

    def test_three_red_no_blue(self):
        # R = 3 is odd.
        run_case(self, stdin="1\n3 0\n", expected="No")

    def test_zero_red_three_blue(self):
        # R = 0 and B = 3 is odd.
        run_case(self, stdin="1\n0 3\n", expected="No")

    def test_one_red_two_blue(self):
        # R = 1 is odd.
        run_case(self, stdin="1\n1 2\n", expected="No")

    def test_several_no_cases_in_one_input(self):
        # Each case has R odd, or R = 0 with B odd.
        run_case(self, stdin="4\n1 1\n3 0\n0 5\n5 4\n", expected="No\nNo\nNo\nNo")

    def test_largest_total_all_red_odd(self):
        # R + B = 2*10^5 with R = 199999 odd.
        run_case(self, stdin="1\n199999 1\n", expected="No")

    def test_largest_total_all_blue_odd(self):
        # R + B = 199999 <= 2*10^5, R = 0 and B odd.
        run_case(self, stdin="1\n0 199999\n", expected="No")

    def test_largest_total_one_red(self):
        # R + B = 2*10^5 with R = 1 odd.
        run_case(self, stdin="1\n1 199999\n", expected="No")

    def test_max_number_of_test_cases(self):
        # T = 10^5 cases of "1 1": sum of R+B is exactly 2*10^5; each is "No".
        t = 10 ** 5
        run_case(self, stdin=f"{t}\n" + "1 1\n" * t, expected="\n".join(["No"] * t))


if __name__ == "__main__":
    unittest.main()
