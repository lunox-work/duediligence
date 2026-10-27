import itertools
import unittest

from sandbox.check import run_case


def brute(nums, x, k):
    # Obviously-correct brute force for tiny inputs: try every set of k
    # window starts that do not overlap, and for each window every target
    # value between its min and max (an optimal target always lies there).
    n = len(nums)

    def cost(s):
        w = nums[s:s + x]
        return min(sum(abs(a - t) for a in w) for t in range(min(w), max(w) + 1))

    best = None
    for starts in itertools.combinations(range(n - x + 1), k):
        if any(b - a < x for a, b in zip(starts, starts[1:])):
            continue
        total = sum(cost(s) for s in starts)
        if best is None or total < best:
            best = total
    return best


class TestMinOperations(unittest.TestCase):
    def test_example_1(self):
        run_case(self, fn="minOperations", args=[[5, -2, 1, 3, 7, 3, 6, 4, -1], 3, 2], expected=8)

    def test_example_2(self):
        run_case(self, fn="minOperations", args=[[9, -2, -2, -2, 1, 5], 2, 2], expected=3)

    def test_smallest_input(self):
        # n=2, x=2, k=1: make 1 and 2 equal, one operation.
        run_case(self, fn="minOperations", args=[[1, 2], 2, 1], expected=1)

    def test_already_equal(self):
        # The only window is already equal: zero operations.
        run_case(self, fn="minOperations", args=[[7, 7], 2, 1], expected=0)

    def test_extreme_values(self):
        # Any common target t in [-1e6, 1e6] costs (t + 1e6) + (1e6 - t) = 2e6.
        run_case(self, fn="minOperations", args=[[-10**6, 10**6], 2, 1], expected=2 * 10**6)

    def test_k_times_x_equals_length(self):
        # Windows are forced: [1,2] and [3,4], each costs 1.
        run_case(self, fn="minOperations", args=[[1, 2, 3, 4], 2, 2], expected=2)

    def test_x_equals_length(self):
        # Single window is the whole array; target 3 (median): 2 + 0 + 2 = 4.
        run_case(self, fn="minOperations", args=[[1, 5, 3], 3, 1], expected=4)

    def test_brute_choice_matters(self):
        # Expected computed by the brute force above.
        nums, x, k = [3, 1, 1, 3, 3, 1, 2], 2, 3
        run_case(self, fn="minOperations", args=[nums, x, k], expected=brute(nums, x, k))

    def test_brute_negative_values(self):
        # Expected computed by the brute force above.
        nums, x, k = [-3, 4, -1, 0, 2, -2, 5, -4], 3, 2
        run_case(self, fn="minOperations", args=[nums, x, k], expected=brute(nums, x, k))

    def test_brute_even_window(self):
        # Expected computed by the brute force above.
        nums, x, k = [6, 0, 2, 9, 1, 1, 8, 3, 5, 4], 4, 2
        run_case(self, fn="minOperations", args=[nums, x, k], expected=brute(nums, x, k))

    def test_large_all_equal_max_k(self):
        # n = 1e5, every element 1e6: any windows are already equal.
        run_case(self, fn="minOperations", args=[[10**6] * 10**5, 2, 15], expected=0)

    def test_large_alternating_x2_max_k(self):
        # Alternating -1e6, 1e6: every size-2 window holds one of each and
        # costs 2e6, so 15 windows cost 3e7.
        nums = [-10**6, 10**6] * 50000
        run_case(self, fn="minOperations", args=[nums, 2, 15], expected=15 * 2 * 10**6)

    def test_large_alternating_wide_windows(self):
        # Alternating -1e6, 1e6, x = 50000: every window holds 25000 of each
        # value, costing 25000 * 2e6 for any target in between; k = 2
        # forces the two halves. Total 2 * 25000 * 2e6 = 1e11.
        nums = [-10**6, 10**6] * 50000
        run_case(self, fn="minOperations", args=[nums, 50000, 2], expected=2 * 25000 * 2 * 10**6)


if __name__ == "__main__":
    unittest.main()
