import unittest

from src.solution import eat


class TestEat(unittest.TestCase):
    # Examples from the docstring, one test each.

    def test_example_enough_carrots_some_left(self):
        self.assertEqual(eat(5, 6, 10), [11, 4])

    def test_example_enough_carrots_one_left(self):
        self.assertEqual(eat(4, 8, 9), [12, 1])

    def test_example_need_equals_remaining(self):
        self.assertEqual(eat(1, 10, 10), [11, 0])

    def test_example_not_enough_carrots(self):
        self.assertEqual(eat(2, 11, 5), [7, 0])

    # Rule: with enough stock (need <= remaining) you eat exactly `need`,
    # giving [number + need, remaining - need].

    def test_enough_typical(self):
        # 3 + 4 = 7 eaten; 10 - 4 = 6 left.
        self.assertEqual(eat(3, 4, 10), [7, 6])

    def test_enough_boundary_need_zero(self):
        # Nothing needed: 7 + 0 = 7 eaten; 3 - 0 = 3 left.
        self.assertEqual(eat(7, 0, 3), [7, 3])

    def test_enough_boundary_need_equals_remaining(self):
        # Stock exactly covers the need: 0 + 5 = 5 eaten; 5 - 5 = 0 left.
        self.assertEqual(eat(0, 5, 5), [5, 0])

    # Rule: without enough stock (need > remaining) you eat all remaining
    # carrots, giving [number + remaining, 0].

    def test_not_enough_typical(self):
        # Only 6 in stock: 10 + 6 = 16 eaten; 0 left.
        self.assertEqual(eat(10, 20, 6), [16, 0])

    def test_not_enough_boundary_need_one_more_than_remaining(self):
        # need 6 > remaining 5: eat all 5, 3 + 5 = 8 eaten; 0 left.
        self.assertEqual(eat(3, 6, 5), [8, 0])

    def test_not_enough_boundary_remaining_zero(self):
        # Empty stock: nothing eaten, 4 + 0 = 4; 0 left.
        self.assertEqual(eat(4, 3, 0), [4, 0])

    # Constraint upper bound: every argument at 1000.

    def test_all_at_upper_bound(self):
        # need == remaining == 1000: 1000 + 1000 = 2000 eaten; 0 left.
        self.assertEqual(eat(1000, 1000, 1000), [2000, 0])


if __name__ == "__main__":
    unittest.main()
