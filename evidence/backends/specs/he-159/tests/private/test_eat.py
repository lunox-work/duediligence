import unittest

from src.solution import eat


class TestEatPrivate(unittest.TestCase):
    # Extends test_example_five_six_ten: need is additional, even below number.
    def test_need_smaller_than_previous_total(self):
        # Eat 3: 20 + 3 = 23 eaten, 8 - 3 = 5 left.
        self.assertEqual(eat(20, 3, 8), [23, 5])

    # Extends test_example_four_eight_nine: all three inputs are large interiors.
    def test_surplus_with_large_distinct_inputs(self):
        # Eat 456: 321 + 456 = 777 eaten, 789 - 456 = 333 left.
        self.assertEqual(eat(321, 456, 789), [777, 333])

    # Extends test_example_exactly_enough_stock: equality at a different scale.
    def test_exact_stock_with_previous_total_above_need(self):
        # Eat all 287: 713 + 287 = 1000 eaten, none left.
        self.assertEqual(eat(713, 287, 287), [1000, 0])

    # Extends test_example_insufficient_stock: a large shortfall, number > need.
    def test_large_shortfall_with_large_previous_total(self):
        # Only 17 exist: 902 + 17 = 919 eaten, none left.
        self.assertEqual(eat(902, 611, 17), [919, 0])

    # Extends test_no_carrots_previously_eaten: zero number with insufficient stock.
    def test_zero_previous_total_with_shortfall(self):
        # Only 42 exist: 0 + 42 = 42 eaten, none left.
        self.assertEqual(eat(0, 731, 42), [42, 0])

    # Extends test_no_additional_carrots_needed: both other inputs at their maxima.
    def test_zero_need_with_maximum_total_and_stock(self):
        # Eat zero: the previous total and all 1000 stock remain unchanged.
        self.assertEqual(eat(1000, 0, 1000), [1000, 1000])

    # Extends test_no_stock_with_positive_need: maximum number and need together.
    def test_no_stock_with_maximum_total_and_need(self):
        # No carrots exist: the total stays 1000, with none left.
        self.assertEqual(eat(1000, 1000, 0), [1000, 0])

    # Extends test_all_inputs_zero: zero number and need do not erase positive stock.
    def test_zero_number_and_need_with_maximum_stock(self):
        # Eat zero: the total stays zero and all 1000 stock remain.
        self.assertEqual(eat(0, 0, 1000), [0, 1000])

    # Extends test_stock_one_less_than_need: large values and a total above 1000.
    def test_large_stock_one_below_need(self):
        # Only 700 exist: 517 + 700 = 1217 eaten, none left.
        self.assertEqual(eat(517, 701, 700), [1217, 0])

    # Extends test_maximum_previously_eaten_with_surplus_stock: almost all stock eaten.
    def test_maximum_previous_total_with_one_carrot_left(self):
        # Eat 999: 1000 + 999 = 1999 eaten, 1000 - 999 = 1 left.
        self.assertEqual(eat(1000, 999, 1000), [1999, 1])

    # Extends test_maximum_need_with_insufficient_stock: only one carrot exists.
    def test_maximum_need_with_single_carrot(self):
        # Eat the one available carrot: 999 + 1 = 1000 eaten, none left.
        self.assertEqual(eat(999, 1000, 1), [1000, 0])

    # Extends test_maximum_stock_with_surplus: substantial need and total above 1000.
    def test_maximum_stock_with_large_meal(self):
        # Eat 873: 400 + 873 = 1273 eaten, 1000 - 873 = 127 left.
        self.assertEqual(eat(400, 873, 1000), [1273, 127])

    # Extends test_all_inputs_at_maximum: equal inputs just below the maximum.
    def test_all_inputs_one_below_maximum(self):
        # Eat exactly 999: 999 + 999 = 1998 eaten, none left.
        self.assertEqual(eat(999, 999, 999), [1998, 0])

    # Extends test_all_inputs_zero: previous meals survive zero need and zero stock.
    def test_maximum_previous_total_with_no_need_or_stock(self):
        # Eat zero: the previous total stays 1000, with none left.
        self.assertEqual(eat(1000, 0, 0), [1000, 0])

    # Extends test_example_exactly_enough_stock: zero previous total, maximum meal.
    def test_maximum_exact_meal_from_zero(self):
        # Eat exactly 1000: 0 + 1000 = 1000 eaten, none left.
        self.assertEqual(eat(0, 1000, 1000), [1000, 0])

    # Extends test_no_stock_with_positive_need: hunger cannot create eaten carrots.
    def test_zero_previous_total_and_stock_with_maximum_need(self):
        # No carrots exist: nothing has been eaten and none remain.
        self.assertEqual(eat(0, 1000, 0), [0, 0])

    # Extends test_example_exactly_enough_stock: the smallest positive exact meal.
    def test_one_carrot_exact_meal_from_zero(self):
        # Eat exactly one: 0 + 1 = 1 eaten, none left.
        self.assertEqual(eat(0, 1, 1), [1, 0])

    # Extends test_no_additional_carrots_needed: one previous carrot and one in stock.
    def test_zero_need_preserves_single_carrot_stock(self):
        # Eat zero: the previous total stays 1 and the stock stays 1.
        self.assertEqual(eat(1, 0, 1), [1, 1])

    # Extends test_example_five_six_ten: a single-carrot meal with a single surplus.
    def test_single_carrot_meal_with_one_left(self):
        # Eat one: 1 + 1 = 2 eaten, 2 - 1 = 1 left.
        self.assertEqual(eat(1, 1, 2), [2, 1])

    # Extends test_stock_one_less_than_need: the smallest positive insufficient stock.
    def test_single_carrot_stock_with_need_of_two(self):
        # Only one exists: 1 + 1 = 2 eaten, none left.
        self.assertEqual(eat(1, 2, 1), [2, 0])

    # Extends test_example_four_eight_nine: a one-carrot surplus at interior values.
    def test_interior_stock_one_above_need(self):
        # Eat 476: 524 + 476 = 1000 eaten, 477 - 476 = 1 left.
        self.assertEqual(eat(524, 476, 477), [1000, 1])

    # Extends test_no_carrots_previously_eaten: zero number with a near-maximum meal.
    def test_zero_previous_total_with_one_carrot_left(self):
        # Eat 999: 0 + 999 = 999 eaten, 1000 - 999 = 1 left.
        self.assertEqual(eat(0, 999, 1000), [999, 1])
