# Public tests for "Ringo's Favorite Numbers 3" (AtCoder ABC400 E).
#
# spec.md carries only the title and the input/output layout. The problem
# body below is the upstream ABC400 E statement, which that title and
# layout identify:
#   A positive integer N is a "400 number" iff N has exactly 2 distinct
#   prime factors and the exponent of each is even. For each query A,
#   print the largest 400 number not exceeding A.
#   Constraints: 1 <= Q <= 2*10^5, 36 <= A <= 10^12 (an answer always exists).
#
# Non-sample expected values come from brute_force() below. A 400 number is
# exactly m*m where m has exactly 2 distinct prime factors, so the answer is
# m*m for the largest such m <= isqrt(A). The helper scans m downward and
# factors each one by trial division. It was also cross-checked offline
# against direct factorization of every n <= 20000.
import unittest
from math import isqrt

from sandbox.check import run_case


def distinct_primes(m):
    count, p = 0, 2
    while p * p <= m:
        if m % p == 0:
            count += 1
            while m % p == 0:
                m //= p
        p += 1
    return count + (m > 1)


def brute_force(a):
    m = isqrt(a)
    while distinct_primes(m) != 2:
        m -= 1
    return m * m


class TestPublic(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="5\n404\n36\n60\n1000000000000\n123456789\n",
            expected="400\n36\n36\n1000000000000\n123454321\n",
        )

    def test_smallest_a(self):
        # 36 = 2^2 * 3^2 is the smallest 400 number and the smallest allowed A.
        run_case(self, stdin="1\n36\n", expected="36\n")

    def test_just_below_second_400_number(self):
        # Squares of 7, 8, 9 have fewer than 2 distinct primes; 100 = 10^2 is next.
        self.assertEqual(brute_force(99), 36)
        run_case(self, stdin="1\n99\n", expected="36\n")

    def test_exactly_second_400_number(self):
        # 100 = 2^2 * 5^2.
        self.assertEqual(brute_force(100), 100)
        run_case(self, stdin="1\n100\n", expected="100\n")

    def test_just_below_and_at_144(self):
        # 121 = 11^2 has one prime; 144 = 2^4 * 3^2 qualifies.
        self.assertEqual(brute_force(143), 100)
        self.assertEqual(brute_force(144), 144)
        run_case(self, stdin="2\n143\n144\n", expected="100\n144\n")

    def test_largest_a(self):
        # 10^12 = 2^12 * 5^12.
        run_case(self, stdin="1\n1000000000000\n", expected="1000000000000\n")

    def test_just_below_largest_a(self):
        # 999997 = 757 * 1321 is the largest m < 10^6 with 2 distinct primes.
        self.assertEqual(brute_force(999999999999), 999994000009)
        run_case(self, stdin="1\n999999999999\n", expected="999994000009\n")

    def test_max_q_all_largest_a(self):
        # Q at its maximum, every query at the maximum A; each answer is 10^12.
        q = 200000
        run_case(
            self,
            stdin=f"{q}\n" + "1000000000000\n" * q,
            expected="1000000000000\n" * q,
        )

    def test_max_q_mixed(self):
        # Q at its maximum, cycling through the values checked above.
        values = [36, 99, 100, 143, 144, 404, 999999999999, 1000000000000]
        q = 200000
        queries = [values[i % len(values)] for i in range(q)]
        answers = {v: brute_force(v) for v in values}
        run_case(
            self,
            stdin=f"{q}\n" + "".join(f"{a}\n" for a in queries),
            expected="".join(f"{answers[a]}\n" for a in queries),
        )


if __name__ == "__main__":
    unittest.main()
