import unittest

from src.solution import eat


class TestEat(unittest.TestCase):
    def test_example_five_six_ten(self):
        self.assertEqual(eat(5, 6, 10), [11, 4])

    def test_example_four_eight_nine(self):
        self.assertEqual(eat(4, 8, 9), [12, 1])

    def test_example_exactly_enough_stock(self):
        self.assertEqual(eat(1, 10, 10), [11, 0])

    def test_example_insufficient_stock(self):
        self.assertEqual(eat(2, 11, 5), [7, 0])

    def test_no_carrots_previously_eaten(self):
        # Eat the needed 3: total is 0 + 3 = 3; stock is 7 - 3 = 4.
        self.assertEqual(eat(0, 3, 7), [3, 4])

    def test_no_additional_carrots_needed(self):
        # Need is zero, so eat zero: total stays 8 and stock stays 6.
        self.assertEqual(eat(8, 0, 6), [8, 6])

    def test_no_stock_with_positive_need(self):
        # All available stock is zero: total stays 8 and stock stays zero.
        self.assertEqual(eat(8, 3, 0), [8, 0])

    def test_all_inputs_zero(self):
        # Eat zero carrots: both the total and remaining stock are zero.
        self.assertEqual(eat(0, 0, 0), [0, 0])

    def test_stock_one_less_than_need(self):
        # Only 4 of the needed 5 exist: total is 6 + 4 = 10; none remain.
        self.assertEqual(eat(6, 5, 4), [10, 0])

    def test_maximum_previously_eaten_with_surplus_stock(self):
        # Eat 7: total is 1000 + 7 = 1007; stock is 9 - 7 = 2.
        self.assertEqual(eat(1000, 7, 9), [1007, 2])

    def test_maximum_need_with_insufficient_stock(self):
        # Eat all 999 available: total is 12 + 999 = 1011; none remain.
        self.assertEqual(eat(12, 1000, 999), [1011, 0])

    def test_maximum_stock_with_surplus(self):
        # Eat the needed 1: total is 9 + 1 = 10; stock is 1000 - 1 = 999.
        self.assertEqual(eat(9, 1, 1000), [10, 999])

    def test_all_inputs_at_maximum(self):
        # Eat exactly 1000: total is 1000 + 1000 = 2000; none remain.
        self.assertEqual(eat(1000, 1000, 1000), [2000, 0])
