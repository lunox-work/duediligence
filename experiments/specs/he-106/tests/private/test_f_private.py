import unittest

from src.solution import f


# Brute force, obviously correct from the docstring: position k (0-based)
# holds the value for i = k + 1; even i -> 1 * 2 * ... * i, odd i ->
# 1 + 2 + ... + i, each computed with a plain loop.
def _product_1_to(i):
    result = 1
    for k in range(1, i + 1):
        result *= k
    return result


def _sum_1_to(i):
    result = 0
    for k in range(1, i + 1):
        result += k
    return result


def _expected(n):
    return [_product_1_to(i) if i % 2 == 0 else _sum_1_to(i)
            for i in range(1, n + 1)]


class TestFPrivate(unittest.TestCase):
    # Rule: the result is a list of size n; n = 0 gives a list of size 0.
    def test_empty_n0(self):
        self.assertEqual(f(0), [])

    # Rule: the function returns a list.
    def test_returns_list_type(self):
        self.assertIsInstance(f(4), list)

    # Extends test_docstring_example_n5: the next sizes up, by hand.
    # i=6 -> 720, i=7 -> 28, i=8 -> 40320, i=9 -> 45, i=10 -> 3628800.
    def test_n10_by_hand(self):
        self.assertEqual(
            f(10), [1, 2, 6, 24, 15, 720, 28, 40320, 45, 3628800])

    # Extends test_size_typical_n7: other sizes, brute-force values.
    def test_sizes_1_to_30_match_brute_force(self):
        for n in range(1, 31):
            self.assertEqual(f(n), _expected(n), msg="n=%d" % n)

    # Extends test_size_typical_n7: length is exactly n for larger n
    # (a table hardcoded to the visible sizes would fall short).
    def test_length_large_n(self):
        self.assertEqual(len(f(200)), 200)

    # Extends test_size_boundary_n1: n = 3, smallest size containing a
    # second odd i. i=1 -> 1, i=2 -> 2, i=3 -> 1+2+3 = 6.
    def test_n3_by_hand(self):
        self.assertEqual(f(3), [1, 2, 6])

    # Extends test_even_factorial_typical_i8: larger even i, factorials
    # beyond any small hardcoded table and beyond 64-bit range.
    # 12! = 479001600 (by hand: 10! = 3628800, *11 = 39916800, *12).
    def test_even_factorial_i12_by_hand(self):
        self.assertEqual(f(12)[11], 479001600)

    def test_even_factorial_i40_brute_force(self):
        result = f(40)
        for i in range(2, 41, 2):
            self.assertEqual(result[i - 1], _product_1_to(i), msg="i=%d" % i)

    # Extends test_even_factorial_boundary_i2: the last element when n is
    # even is n!; 6! = 720.
    def test_even_last_element_n6(self):
        self.assertEqual(f(6)[-1], 720)

    # Extends test_odd_sum_typical_i7: larger odd i; the factorial of the
    # previous even i must not leak into the sum.
    # i=11: 11*12/2 = 66; i=13: 13*14/2 = 91.
    def test_odd_sum_i11_i13_by_hand(self):
        result = f(13)
        self.assertEqual(result[10], 66)
        self.assertEqual(result[12], 91)

    def test_odd_sum_i99_brute_force(self):
        result = f(99)
        for i in range(1, 100, 2):
            self.assertEqual(result[i - 1], _sum_1_to(i), msg="i=%d" % i)

    # Extends test_odd_sum_boundary_i1: first element is 1 for every n.
    def test_first_element_always_1(self):
        for n in (1, 2, 9, 50):
            self.assertEqual(f(n)[0], 1, msg="n=%d" % n)

    # Extends test_i_starts_from_1_typical: an odd-length list ends with
    # an odd i. Position 8 is i = 9 (odd): 1+...+9 = 45. Were i 0-based it
    # would be i = 8 (even), 8! = 40320.
    def test_i_starts_from_1_position8(self):
        self.assertEqual(f(9)[8], 45)

    # Extends test_i_starts_from_1_boundary: position 9 is i = 10 (even):
    # 10! = 3628800. Were i 0-based it would be i = 9, sum 45.
    def test_i_starts_from_1_position9(self):
        self.assertEqual(f(10)[9], 3628800)

    # The value at position k depends only on i = k + 1, so f(n) is a
    # prefix of f(m) for n < m; calling in different orders must not
    # change results (catches state kept between calls).
    def test_prefix_and_call_order_independent(self):
        big = f(20)
        small = f(5)
        again = f(20)
        self.assertEqual(small, [1, 2, 6, 24, 15])
        self.assertEqual(big, again)
        self.assertEqual(big[:5], small)

    def test_fresh_list_each_call(self):
        first = f(4)
        first.append(999)
        first[0] = 0
        self.assertEqual(f(4), [1, 2, 6, 24])


if __name__ == "__main__":
    unittest.main()
