import unittest

from src.solution import f


# Element at position k (0-based) holds the value for i = k + 1, as the
# docstring example shows: f(5) == [1, 2, 6, 24, 15].
# Values by hand: i=1 -> 1, i=2 -> 2! = 2, i=3 -> 1+2+3 = 6, i=4 -> 4! = 24,
# i=5 -> 15, i=6 -> 6! = 720, i=7 -> 1+...+7 = 28, i=8 -> 8! = 40320.
class TestF(unittest.TestCase):
    # Docstring example.
    def test_docstring_example_n5(self):
        self.assertEqual(f(5), [1, 2, 6, 24, 15])

    # Rule: the result is a list of size n.
    def test_size_typical_n7(self):
        # Seven values from the table above, i = 1..7.
        self.assertEqual(f(7), [1, 2, 6, 24, 15, 720, 28])

    def test_size_boundary_n1(self):
        # Single element, i = 1 (odd): sum 1..1 = 1.
        self.assertEqual(f(1), [1])

    # Rule: for even i the value is i! (1 * 2 * ... * i).
    def test_even_factorial_typical_i8(self):
        # i = 8: 1*2*3*4*5*6*7*8 = 40320.
        self.assertEqual(f(8)[7], 40320)

    def test_even_factorial_boundary_i2(self):
        # Smallest even i = 2: 1*2 = 2.
        self.assertEqual(f(2), [1, 2])

    # Rule: for odd i the value is 1 + 2 + ... + i.
    def test_odd_sum_typical_i7(self):
        # i = 7: 1+2+3+4+5+6+7 = 28.
        self.assertEqual(f(7)[6], 28)

    def test_odd_sum_boundary_i1(self):
        # Smallest odd i = 1: sum 1..1 = 1.
        self.assertEqual(f(3)[0], 1)

    # Rule: i starts from 1 (position k holds the value for i = k + 1).
    def test_i_starts_from_1_typical(self):
        # Position 3 is i = 4 (even): 4! = 24. Were i 0-based it would be
        # i = 3 (odd), sum 6.
        self.assertEqual(f(4)[3], 24)

    def test_i_starts_from_1_boundary(self):
        # Position 1 is i = 2 (even): 2! = 2. Were i 0-based it would be
        # i = 1 (odd), sum 1.
        self.assertEqual(f(6)[1], 2)


if __name__ == "__main__":
    unittest.main()
