import unittest

from sandbox.check import run_case


def factorize(n):
    """Prime factorization {p: exponent} by plain trial division."""
    out = {}
    d = 2
    while d * d <= n:
        while n % d == 0:
            out[d] = out.get(d, 0) + 1
            n //= d
        d += 1
    if n > 1:
        out[n] = out.get(n, 0) + 1
    return out


def is_400(n):
    """The statement's definition, checked literally."""
    f = factorize(n)
    return len(f) == 2 and all(e % 2 == 0 for e in f.values())


def brute_answer(a):
    """Largest 400 number <= a, by scanning downward (tiny a only)."""
    n = a
    while not is_400(n):
        n -= 1
    return n


class TestPublic(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="5\n404\n36\n60\n1000000000000\n123456789\n",
            expected="400\n36\n36\n1000000000000\n123454321\n",
        )

    def test_smallest_a(self):
        # 36 = 2^2 * 3^2 is a 400 number (sample confirms A=36 -> 36).
        run_case(self, stdin="1\n36\n", expected="36\n")

    def test_just_below_100(self):
        # 99: brute force from the definition; 100 = 2^2*5^2 is the next 400 number.
        self.assertEqual(brute_answer(99), 36)
        run_case(self, stdin="1\n99\n", expected="36\n")

    def test_exactly_100(self):
        run_case(self, stdin="1\n100\n", expected="100\n")

    def test_prime_power_square_skipped(self):
        # 64 = 2^6 has only one prime factor, so it is not a 400 number.
        self.assertEqual(brute_answer(64), 36)
        run_case(self, stdin="1\n64\n", expected="36\n")

    def test_three_primes_square_skipped(self):
        # 900 = 2^2*3^2*5^2 has three distinct primes; brute force gives 784 = 2^4*7^2.
        expected = brute_answer(900)
        self.assertEqual(expected, 784)
        run_case(self, stdin="1\n900\n", expected=f"{expected}\n")

    def test_small_range_brute_force(self):
        # Every A in [36, 1500], answers by scanning downward with the literal definition.
        values = list(range(36, 1501))
        stdin = f"{len(values)}\n" + "".join(f"{a}\n" for a in values)
        expected = "".join(f"{brute_answer(a)}\n" for a in values)
        run_case(self, stdin=stdin, expected=expected)

    def test_largest_a(self):
        # 10^12 = (2^6 * 5^6)^2 = 2^12 * 5^12 (also in the sample).
        run_case(self, stdin="1\n1000000000000\n", expected="1000000000000\n")

    def test_just_below_largest_a(self):
        # A 400 number is exactly m^2 where m has exactly 2 distinct prime factors
        # (all exponents even <=> N is a perfect square). The largest m < 10^6 with
        # exactly 2 distinct primes, found by trial division: 999999 = 3^3*7*11*13*37,
        # 999998 = 2*31*127, 999997 = 757*1321.
        m = 10**6 - 1
        while len(factorize(m)) != 2:
            m -= 1
        self.assertEqual(m, 999997)
        run_case(self, stdin="1\n999999999999\n", expected=f"{m * m}\n")

    def test_max_q_max_a(self):
        # Q = 2*10^5 queries, all A = 10^12, each answer 10^12 (a 400 number itself).
        q = 200000
        run_case(
            self,
            stdin=f"{q}\n" + "1000000000000\n" * q,
            expected="1000000000000\n" * q,
        )


if __name__ == "__main__":
    unittest.main()
