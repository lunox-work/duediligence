import unittest

from src.solution import monotonic


class TestMonotonic(unittest.TestCase):
    def test_docstring_increasing(self):
        self.assertEqual(monotonic([1, 2, 4, 20]), True)

    def test_docstring_not_monotonic(self):
        self.assertEqual(monotonic([1, 20, 4, 10]), False)

    def test_docstring_decreasing(self):
        self.assertEqual(monotonic([4, 1, 0, -10]), True)

    def test_increasing_across_zero(self):
        # -9 < -3 < 0 < 2 < 8, so every step increases.
        self.assertEqual(monotonic([-9, -3, 0, 2, 8]), True)

    def test_decreasing_across_zero(self):
        # 8 > 2 > 0 > -3 > -9, so every step decreases.
        self.assertEqual(monotonic([8, 2, 0, -3, -9]), True)

    def test_two_increasing_elements(self):
        # The only step is -2 < 5, so the list is increasing.
        self.assertEqual(monotonic([-2, 5]), True)

    def test_two_decreasing_elements(self):
        # The only step is 5 > -2, so the list is decreasing.
        self.assertEqual(monotonic([5, -2]), True)

    def test_three_elements_with_peak(self):
        # 1 < 3 but 3 > 2; three elements suffice to change direction.
        self.assertEqual(monotonic([1, 3, 2]), False)

    def test_three_elements_with_valley(self):
        # 3 > 1 but 1 < 2, so neither direction holds throughout.
        self.assertEqual(monotonic([3, 1, 2]), False)

    def test_empty_list(self):
        # There are no pairs of elements that violate monotonicity.
        self.assertEqual(monotonic([]), True)

    def test_single_element(self):
        # With one element there is no step that can violate monotonicity.
        self.assertEqual(monotonic([7]), True)

    def test_constant_list(self):
        # Equal elements never reverse direction: 4 <= 4 <= 4 <= 4.
        self.assertEqual(monotonic([4, 4, 4, 4]), True)

    def test_increasing_with_equal_neighbors(self):
        # -2 <= -2 <= 0 <= 3 <= 3; equality does not reverse direction.
        self.assertEqual(monotonic([-2, -2, 0, 3, 3]), True)

    def test_decreasing_with_equal_neighbors(self):
        # 3 >= 3 >= 0 >= -2 >= -2; equality does not reverse direction.
        self.assertEqual(monotonic([3, 3, 0, -2, -2]), True)
