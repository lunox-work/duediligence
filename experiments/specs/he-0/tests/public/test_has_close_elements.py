import unittest

from src.solution import has_close_elements


# All inputs below use values exactly representable in binary floating point
# (integers and halves/quarters), so every distance is computed exactly and
# the expected results do not depend on rounding.
class TestHasCloseElements(unittest.TestCase):
    # --- Docstring examples ---

    def test_docstring_example_no_close_pair(self):
        self.assertIs(has_close_elements([1.0, 2.0, 3.0], 0.5), False)

    def test_docstring_example_close_pair(self):
        self.assertIs(has_close_elements([1.0, 2.8, 3.0, 4.0, 5.0, 2.0], 0.3), True)

    # --- Rule: True when some two numbers are closer than the threshold ---

    def test_close_pair_typical(self):
        # |3.0 - 3.25| = 0.25 < 1.0, so a close pair exists.
        self.assertIs(has_close_elements([0.0, 3.0, 10.0, 3.25], 1.0), True)

    def test_close_pair_distance_just_under_threshold(self):
        # |1.0 - 1.25| = 0.25 < 0.5 by a clear margin; the only pair.
        self.assertIs(has_close_elements([1.0, 1.25], 0.5), True)

    # --- Rule: the pair may be any two numbers, not only neighbours ---

    def test_close_pair_not_adjacent(self):
        # Adjacent distances are 4.0 and 3.75; the first and last differ by
        # |1.0 - 1.25| = 0.25 < 0.5.
        self.assertIs(has_close_elements([1.0, 5.0, 1.25], 0.5), True)

    def test_equal_values_are_close(self):
        # Two equal numbers are at distance 0.0 < 0.5.
        self.assertIs(has_close_elements([2.0, 7.0, 2.0], 0.5), True)

    # --- Rule: closer *than* threshold is strict ---

    def test_far_apart_typical(self):
        # Smallest pairwise distance is 2.0, not < 1.5.
        self.assertIs(has_close_elements([-4.0, 0.0, 2.0, 6.0], 1.5), False)

    def test_distance_equal_to_threshold_is_not_close(self):
        # |1.0 - 1.5| = 0.5 exactly; 0.5 is not closer than 0.5.
        self.assertIs(has_close_elements([1.0, 1.5], 0.5), False)

    # --- Rule: fewer than two numbers means no pair exists ---

    def test_single_element(self):
        # One number cannot form a pair, so no two numbers are close.
        self.assertIs(has_close_elements([1.0], 100.0), False)

    def test_empty_list(self):
        # No numbers, so no pair can exist.
        self.assertIs(has_close_elements([], 1.0), False)


if __name__ == "__main__":
    unittest.main()
