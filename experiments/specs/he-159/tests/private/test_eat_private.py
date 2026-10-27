import unittest

from src.solution import eat


def simulate(number, need, remaining):
    # Obviously-correct reference: eat one carrot at a time while still
    # hungry and while stock lasts.
    eaten, left, hunger = number, remaining, need
    while hunger > 0 and left > 0:
        eaten += 1
        left -= 1
        hunger -= 1
    return [eaten, left]


class TestEatPrivate(unittest.TestCase):
    # Result shape: the docstring's examples are two-element lists.

    def test_result_is_two_element_list(self):
        result = eat(3, 2, 9)
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)

    # Extends test_example_enough_carrots_some_left: number larger than both
    # need and remaining, so swapping number and need in the leftover is caught.
    # 50 + 3 = 53 eaten; 8 - 3 = 5 left.
    def test_enough_number_larger_than_stock(self):
        self.assertEqual(eat(50, 3, 8), [53, 5])

    # Extends test_example_enough_carrots_some_left: leftover must not
    # subtract number. 9 + 1 = 10 eaten; 20 - 1 = 19 left.
    def test_enough_leftover_ignores_number(self):
        self.assertEqual(eat(9, 1, 20), [10, 19])

    # Extends test_example_enough_carrots_one_left: larger sizes.
    # 400 + 599 = 999 eaten; 600 - 599 = 1 left.
    def test_enough_one_left_large(self):
        self.assertEqual(eat(400, 599, 600), [999, 1])

    # Extends test_example_need_equals_remaining: equality at the top of range
    # with number 0. 0 + 1000 = 1000 eaten; 0 left.
    def test_need_equals_remaining_max_number_zero(self):
        self.assertEqual(eat(0, 1000, 1000), [1000, 0])

    # Extends test_example_not_enough_carrots: total must be number + remaining,
    # not need + remaining or number + need. 100 + 1 = 101 eaten; 0 left.
    def test_not_enough_total_is_number_plus_remaining(self):
        self.assertEqual(eat(100, 7, 1), [101, 0])

    # Extends test_enough_typical: number zero.
    # 0 + 4 = 4 eaten; 9 - 4 = 5 left.
    def test_enough_number_zero(self):
        self.assertEqual(eat(0, 4, 9), [4, 5])

    # Extends test_enough_boundary_need_zero: need 0 with maximal stock.
    # 0 + 0 = 0 eaten; 1000 left.
    def test_need_zero_full_stock(self):
        self.assertEqual(eat(0, 0, 1000), [0, 1000])

    # Extends test_enough_boundary_need_zero: everything zero.
    def test_all_zero(self):
        self.assertEqual(eat(0, 0, 0), [0, 0])

    # Extends test_enough_boundary_need_zero: need 0 and remaining 0.
    # 1000 + 0 = 1000 eaten; 0 left.
    def test_need_zero_remaining_zero_number_max(self):
        self.assertEqual(eat(1000, 0, 0), [1000, 0])

    # Extends test_enough_boundary_need_equals_remaining: equality with a
    # nonzero number and size 1. 6 + 1 = 7 eaten; 0 left.
    def test_need_equals_remaining_one(self):
        self.assertEqual(eat(6, 1, 1), [7, 0])

    # Extends test_not_enough_typical: number zero, so result is just remaining.
    # 0 + 30 = 30 eaten; 0 left.
    def test_not_enough_number_zero(self):
        self.assertEqual(eat(0, 31, 30), [30, 0])

    # Extends test_not_enough_boundary_need_one_more_than_remaining: at the
    # top of the range. 1000 + 999 = 1999 eaten; 0 left.
    def test_not_enough_need_max_remaining_one_less(self):
        self.assertEqual(eat(1000, 1000, 999), [1999, 0])

    # Extends test_enough_boundary_need_equals_remaining: need one less than
    # remaining (enough side of the boundary). 1000 + 999 = 1999; 1 left.
    def test_enough_need_one_less_than_remaining_max(self):
        self.assertEqual(eat(1000, 999, 1000), [1999, 1])

    # Extends test_not_enough_boundary_remaining_zero: maximal need, empty stock.
    # 0 + 0 = 0 eaten; 0 left.
    def test_remaining_zero_need_max(self):
        self.assertEqual(eat(0, 1000, 0), [0, 0])

    # Extends test_all_at_upper_bound: other upper-bound combinations.
    # need 0: 1000 eaten, 1000 left. need max, stock max, number 0 covered
    # above; here remaining max, need 1: 1001 eaten, 999 left.
    def test_upper_bound_need_zero(self):
        self.assertEqual(eat(1000, 0, 1000), [1000, 1000])

    def test_upper_bound_need_one(self):
        self.assertEqual(eat(1000, 1, 1000), [1001, 999])

    # Exhaustive small grid against the one-at-a-time simulation.
    def test_exhaustive_small_grid(self):
        for number in range(0, 8):
            for need in range(0, 12):
                for remaining in range(0, 12):
                    with self.subTest(number=number, need=need, remaining=remaining):
                        self.assertEqual(
                            eat(number, need, remaining),
                            simulate(number, need, remaining),
                        )

    # Coarse grid across the whole stated range against the simulation,
    # including both ends (0 and 1000).
    def test_full_range_grid(self):
        values = [0, 1, 2, 137, 499, 500, 501, 863, 998, 999, 1000]
        for number in values:
            for need in values:
                for remaining in values:
                    with self.subTest(number=number, need=need, remaining=remaining):
                        self.assertEqual(
                            eat(number, need, remaining),
                            simulate(number, need, remaining),
                        )


if __name__ == "__main__":
    unittest.main()
