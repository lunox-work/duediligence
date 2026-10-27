import unittest

from src.solution import monotonic


class TestMonotonic(unittest.TestCase):
    # Docstring examples.

    def test_example_increasing(self):
        self.assertIs(monotonic([1, 2, 4, 20]), True)

    def test_example_not_monotonic(self):
        self.assertIs(monotonic([1, 20, 4, 10]), False)

    def test_example_decreasing(self):
        self.assertIs(monotonic([4, 1, 0, -10]), True)

    # Rule: increasing elements -> True.
    # Equal neighbours are avoided throughout: the docstring does not say
    # whether "monotonically" is strict or not.

    def test_increasing_typical(self):
        # -5 < -1 < 0 < 3 < 8 < 100: every step goes up.
        self.assertIs(monotonic([-5, -1, 0, 3, 8, 100]), True)

    def test_increasing_boundary_two_elements(self):
        # Shortest list with a step: 1 < 2 is increasing.
        self.assertIs(monotonic([1, 2]), True)

    # Rule: decreasing elements -> True.

    def test_decreasing_typical(self):
        # 50 > 30 > 7 > 2 > -3: every step goes down.
        self.assertIs(monotonic([50, 30, 7, 2, -3]), True)

    def test_decreasing_boundary_two_elements(self):
        # Shortest list with a step: 2 > 1 is decreasing.
        self.assertIs(monotonic([2, 1]), True)

    # Rule: neither increasing nor decreasing -> False.

    def test_not_monotonic_typical(self):
        # 3 > 1 goes down, then 1 < 5 goes up: neither direction holds.
        self.assertIs(monotonic([3, 1, 5, 2, 6]), False)

    def test_not_monotonic_boundary_shortest(self):
        # Three distinct elements is the shortest possible break:
        # 1 < 3 goes up, then 3 > 2 goes down.
        self.assertIs(monotonic([1, 3, 2]), False)

    def test_not_monotonic_boundary_break_at_last_step(self):
        # Increasing until the final step: 1 < 2 < 3 < 4, then 4 > 0.
        self.assertIs(monotonic([1, 2, 3, 4, 0]), False)

    def test_single_element_boundary(self):
        # One element has no pairs to compare, so it is vacuously both
        # increasing and decreasing, strict or not.
        self.assertIs(monotonic([7]), True)


if __name__ == "__main__":
    unittest.main()
