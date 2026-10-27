import unittest

from src.solution import add_elements


class TestAddElements(unittest.TestCase):
    # Docstring example.
    def test_docstring_example(self):
        self.assertEqual(add_elements([111, 21, 3, 4000, 5, 6, 7, 8, 9], 4), 24)

    # Rule: only elements with at most two digits are summed.
    # Inputs are non-negative so "digits" is unambiguous.

    def test_two_digit_rule_typical(self):
        # Within the first 4: 12 (2 digits) and 7 (1 digit) count;
        # 345 (3 digits) and 6789 (4 digits) do not. 12 + 7 = 19.
        self.assertEqual(add_elements([12, 345, 7, 6789], 4), 19)

    def test_two_digit_rule_boundary_99_vs_100(self):
        # 99 has two digits and counts; 100 has three and does not. Sum = 99.
        self.assertEqual(add_elements([99, 100], 2), 99)

    def test_two_digit_rule_boundary_none_qualify(self):
        # No element has at most two digits, so the sum is empty: 0.
        self.assertEqual(add_elements([100, 200, 3000], 3), 0)

    # Rule: only the first k elements are considered.

    def test_first_k_rule_typical(self):
        # First 3 of [1, 2, 3, 4, 5] are 1, 2, 3, all one digit. Sum = 6.
        self.assertEqual(add_elements([1, 2, 3, 4, 5], 3), 6)

    def test_first_k_rule_boundary_k_one(self):
        # k = 1: only 5 is considered; 50 is excluded despite qualifying. Sum = 5.
        self.assertEqual(add_elements([5, 50, 500], 1), 5)

    def test_first_k_rule_boundary_k_equals_len(self):
        # k = len(arr): every element is considered; all are two digits.
        # 10 + 20 + 30 = 60.
        self.assertEqual(add_elements([10, 20, 30], 3), 60)


if __name__ == "__main__":
    unittest.main()
