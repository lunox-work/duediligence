# spec.md gives no samples and no explicit constraints. Every case keeps
# x >= 2, k >= 1 and k * x <= len(nums), so the k blocks always fit.
#
# Each expected value was derived by hand (cost of a block = sum of
# |v - median|, the best common value) and cross-checked with a brute
# force that tries every set of k non-overlapping start positions and,
# for each block, every target value taken from the block itself.
# Exactly k blocks suffice for "at least k", since extra blocks never
# lower the cost.
import unittest

from sandbox.check import run_case


class TestMinOperations(unittest.TestCase):
    def test_mixed_signs_two_blocks_of_three(self):
        # [-2,1,3] -> 1 costs 3+0+2 = 5; [3,6,4] -> 4 costs 1+2+0 = 3; total 8.
        run_case(self, fn="minOperations",
                 args=[[5, -2, 1, 3, 7, 3, 6, 4, -1], 3, 2], expected=8)

    def test_existing_equal_run_reused(self):
        # [-2,-2] costs 0; [-2,1] (indices 3-4) costs 3; total 3.
        run_case(self, fn="minOperations",
                 args=[[9, -2, -2, -2, 1, 5], 2, 2], expected=3)

    def test_smallest_input(self):
        # One block of two: make 1 and 2 equal in one step.
        run_case(self, fn="minOperations", args=[[1, 2], 2, 1], expected=1)

    def test_already_equal(self):
        run_case(self, fn="minOperations", args=[[7, 7, 7, 7], 2, 2], expected=0)

    def test_single_block_is_whole_array(self):
        # Target 3 (median): 2+2+1+5+0 = 10.
        run_case(self, fn="minOperations", args=[[1, 5, 2, 8, 3], 5, 1], expected=10)

    def test_blocks_tile_array_exactly(self):
        # k * x == n forces [1,3] and [10,20]: 2 + 10 = 12.
        run_case(self, fn="minOperations", args=[[1, 3, 10, 20], 2, 2], expected=12)

    def test_extreme_values_single_block(self):
        run_case(self, fn="minOperations",
                 args=[[1000000, -1000000], 2, 1], expected=2000000)

    def test_extreme_values_two_blocks(self):
        # Forced blocks [1e6,-1e6] and [1e6,-1e6], each costs 2e6.
        run_case(self, fn="minOperations",
                 args=[[1000000, -1000000, 1000000, -1000000], 2, 2],
                 expected=4000000)

    def test_cheapest_block_not_in_optimum(self):
        # The free block [1,1,1] at index 1 leaves no room for a second
        # block; the only valid pair is [1,1,1] + [1,9,9] -> 0 + 8.
        run_case(self, fn="minOperations",
                 args=[[1, 1, 1, 1, 9, 9], 3, 2], expected=8)

    def test_all_negative(self):
        # Target -3: 2+0+2 = 4.
        run_case(self, fn="minOperations", args=[[-5, -3, -1], 3, 1], expected=4)


if __name__ == "__main__":
    unittest.main()
