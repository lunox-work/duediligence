import unittest

from sandbox.check import run_case


def brute(l, r):
    """Direct definition: product of digits divisible by sum of digits."""
    count = 0
    for n in range(l, r + 1):
        digits = [int(c) for c in str(n)]
        product = 1
        for d in digits:
            product *= d
        if product % sum(digits) == 0:
            count += 1
    return count


class TestBeautifulNumbers(unittest.TestCase):
    def test_example_1(self):
        run_case(self, fn="beautifulNumbers", args=[10, 20], expected=2)

    def test_example_2(self):
        run_case(self, fn="beautifulNumbers", args=[1, 15], expected=10)

    def test_smallest_input(self):
        # 1: product 1, sum 1 -> beautiful.
        run_case(self, fn="beautifulNumbers", args=[1, 1], expected=1)

    def test_single_eleven_not_beautiful(self):
        # 11: product 1, sum 2 -> 1 % 2 != 0.
        run_case(self, fn="beautifulNumbers", args=[11, 11], expected=0)

    def test_single_with_zero_digit(self):
        # 100000000: product 0, sum 1 -> 0 is divisible by 1.
        run_case(self, fn="beautifulNumbers", args=[100000000, 100000000], expected=1)

    def test_largest_value_beautiful(self):
        # 999999999: product 9^9 = 3^18, sum 81 = 3^4 -> divisible.
        run_case(self, fn="beautifulNumbers", args=[999999999, 999999999], expected=1)

    def test_largest_minus_one_not_beautiful(self):
        # 999999998: product 9^8 * 8 = 3^16 * 2^3, sum 80 = 2^4 * 5 -> not divisible.
        run_case(self, fn="beautifulNumbers", args=[999999998, 999999998], expected=0)

    def test_one_to_hundred_brute(self):
        # Expected computed by brute force over the definition.
        run_case(self, fn="beautifulNumbers", args=[1, 100], expected=brute(1, 100))

    def test_one_to_five_thousand_brute(self):
        # Expected computed by brute force over the definition.
        run_case(self, fn="beautifulNumbers", args=[1, 5000], expected=brute(1, 5000))

    def test_top_of_range_brute(self):
        # Last 2000 values below 10^9; expected computed by brute force.
        l, r = 999998000, 999999999
        run_case(self, fn="beautifulNumbers", args=[l, r], expected=brute(l, r))

    def test_around_power_of_ten_brute(self):
        # Crosses 10^8 boundary; expected computed by brute force.
        l, r = 99999000, 100001000
        run_case(self, fn="beautifulNumbers", args=[l, r], expected=brute(l, r))


if __name__ == "__main__":
    unittest.main()
