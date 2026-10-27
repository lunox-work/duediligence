# spec.md has no sample block, so every expected value here is derived.
# A 400 number is exactly N = m^2 where m has exactly 2 distinct prime
# factors (both exponents of N even and >= 2). So the answer for A is m^2
# for the largest m <= isqrt(A) with exactly 2 distinct primes. Each value
# was found by hand with that rule and checked against a brute force that
# factors every N downward from A straight from the statement's definition.
import unittest

from sandbox.check import run_case


class TestPublic(unittest.TestCase):
    def test_smallest_a_is_itself_400_number(self):
        # 36 = 2^2 * 3^2, the smallest 400 number and the smallest allowed A.
        run_case(self, stdin="1\n36\n", expected="36")

    def test_largest_a_is_itself_400_number(self):
        # 10^12 = 2^12 * 5^12.
        run_case(self, stdin="1\n1000000000000\n", expected="1000000000000")

    def test_just_below_largest_a(self):
        # isqrt(10^12 - 1) = 999999 = 3^3*7*11*13*37 (5 primes);
        # 999998 = 2*31*127^2 (3 primes); 999997 = 757*1321 -> 999997^2.
        run_case(self, stdin="1\n999999999999\n", expected="999994000009")

    def test_404(self):
        # isqrt(404) = 20 = 2^2 * 5 -> 400.
        run_case(self, stdin="1\n404\n", expected="400")

    def test_60_falls_back_to_36(self):
        # isqrt(60) = 7 is prime; 6 = 2*3 -> 36.
        run_case(self, stdin="1\n60\n", expected="36")

    def test_99_skips_prime_power(self):
        # isqrt(99) = 9 = 3^2 (one prime), 8 = 2^3, 7 prime; 6 -> 36.
        run_case(self, stdin="1\n99\n", expected="36")

    def test_100(self):
        # 100 = 2^2 * 5^2.
        run_case(self, stdin="1\n100\n", expected="100")

    def test_143_just_below_square(self):
        # isqrt(143) = 11 is prime; 10 = 2*5 -> 100.
        run_case(self, stdin="1\n143\n", expected="100")

    def test_144_unequal_exponents(self):
        # 144 = 2^4 * 3^2.
        run_case(self, stdin="1\n144\n", expected="144")

    def test_1000(self):
        # isqrt(1000) = 31 prime, 30 = 2*3*5 (3 primes), 29 prime; 28 = 2^2*7 -> 784.
        run_case(self, stdin="1\n1000\n", expected="784")

    def test_123456789(self):
        # isqrt(123456789) = 11111 = 41 * 271 -> 123454321.
        run_case(self, stdin="1\n123456789\n", expected="123454321")

    def test_several_queries_in_order(self):
        # Values from the single-query cases above, answered line by line.
        run_case(
            self,
            stdin="5\n404\n36\n60\n1000000000000\n123456789\n",
            expected="400\n36\n36\n1000000000000\n123454321",
        )

    def test_max_q_at_max_a(self):
        # Q = 2*10^5 queries, each A = 10^12 (itself a 400 number).
        q = 200000
        run_case(
            self,
            stdin=f"{q}\n" + "1000000000000\n" * q,
            expected="\n".join(["1000000000000"] * q),
        )


if __name__ == "__main__":
    unittest.main()
