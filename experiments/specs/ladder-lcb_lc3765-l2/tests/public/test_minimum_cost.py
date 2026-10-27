import unittest

from sandbox.check import run_case

# Cost of a division: sum over its subarrays nums[l..r], numbered i = 1, 2, ...,
# of (nums[0] + ... + nums[r] + k * i) * (cost[l] + ... + cost[r]).
# Expected values not worked out by hand below were obtained by an exhaustive
# brute force over all 2^(n-1) ways to cut the array, applying that formula.


class TestMinimumCost(unittest.TestCase):
    def test_example_1(self):
        # Published example; confirmed by brute force.
        run_case(self, fn="minimumCost", args=[[3, 1, 4], [4, 6, 6], 1], expected=110)

    def test_example_2(self):
        # Published example; confirmed by brute force.
        run_case(
            self,
            fn="minimumCost",
            args=[[4, 8, 5, 1, 14, 2, 2, 12, 1], [7, 2, 8, 4, 2, 2, 1, 1, 2], 7],
            expected=985,
        )

    def test_single_element_all_ones(self):
        # Only one division: (1 + 1*1) * 1 = 2.
        run_case(self, fn="minimumCost", args=[[1], [1], 1], expected=2)

    def test_single_element(self):
        # Only one division: (5 + 2*1) * 3 = 21.
        run_case(self, fn="minimumCost", args=[[5], [3], 2], expected=21)

    def test_two_elements_keep_whole(self):
        # Whole: (2 + 10) * 2 = 24. Split: (1 + 10) * 1 + (2 + 20) * 1 = 33.
        run_case(self, fn="minimumCost", args=[[1, 1], [1, 1], 10], expected=24)

    def test_two_elements_split(self):
        # Whole: (101 + 1) * 101 = 10302. Split: (1 + 1) * 100 + (101 + 2) * 1 = 303.
        run_case(self, fn="minimumCost", args=[[1, 100], [100, 1], 1], expected=303)

    def test_three_equal_all_singletons(self):
        # [9][9][9]: (9+1)*1 + (18+2)*1 + (27+3)*1 = 60, the minimum by brute force
        # (whole array alone is (27+1)*3 = 84).
        run_case(self, fn="minimumCost", args=[[9, 9, 9], [1, 1, 1], 1], expected=60)

    def test_eight_ones(self):
        # Brute force over all 128 divisions.
        run_case(self, fn="minimumCost", args=[[1] * 8, [1] * 8, 1], expected=58)

    def test_mixed_six(self):
        # Brute force over all 32 divisions.
        run_case(
            self,
            fn="minimumCost",
            args=[[2, 7, 1, 8, 2, 8], [3, 1, 4, 1, 5, 9], 3],
            expected=593,
        )


if __name__ == "__main__":
    unittest.main()
