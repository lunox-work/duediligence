# Public tests for "Ringo's Favorite Numbers 3".
#
# spec.md gives no sample cases and no constraints section. The only bound it
# implies is that a 400 number not exceeding A always exists; the smallest
# 400 number is 2^2 * 3^2 = 36, so A >= 36. Every A here is kept small, and
# every expected answer is either derived by hand (shown in a comment) or
# computed by the brute force below, which applies the definition literally.
import unittest

from sandbox.check import run_case


def exponents(n):
    """Prime factorisation of n by trial division: {prime: exponent}."""
    result = {}
    p = 2
    while p * p <= n:
        while n % p == 0:
            result[p] = result.get(p, 0) + 1
            n //= p
        p += 1
    if n > 1:
        result[n] = result.get(n, 0) + 1
    return result


def is_400(n):
    """The statement's definition: exactly 2 distinct primes, each to an even power."""
    e = exponents(n)
    return len(e) == 2 and all(k % 2 == 0 for k in e.values())


def brute(a):
    """Largest 400 number not exceeding a, by scanning downward."""
    n = a
    while not is_400(n):
        n -= 1
    return n


def make_input(values):
    return "\n".join([str(len(values))] + [str(v) for v in values]) + "\n"


def make_output(values):
    return "\n".join(str(v) for v in values) + "\n"


class TestPublic(unittest.TestCase):
    def test_brute_force_sanity(self):
        # The helper itself, against hand-checked facts, so the cases below
        # rest on a verified oracle. Runs without the program.
        self.assertTrue(is_400(36))     # 2^2 * 3^2
        self.assertTrue(is_400(400))    # 2^4 * 5^2
        self.assertFalse(is_400(64))    # 2^6: one prime only
        self.assertFalse(is_400(72))    # 2^3 * 3^2: odd exponent
        self.assertFalse(is_400(900))   # 2^2 * 3^2 * 5^2: three primes
        self.assertEqual(brute(99), 36)
        self.assertEqual(brute(404), 400)

    def test_smallest_a_is_36(self):
        # 36 = 2^2 * 3^2 is the smallest 400 number, hence the smallest A.
        run_case(self, stdin="1\n36\n", expected="36\n")

    def test_just_below_second_400_number(self):
        # 400 numbers in increasing order begin 36, 100 (2^2 * 5^2); nothing
        # in 37..99 qualifies (checked by brute(99) == 36 above).
        run_case(self, stdin="1\n99\n", expected="36\n")

    def test_second_400_number_exact(self):
        # 100 = 2^2 * 5^2.
        run_case(self, stdin="1\n100\n", expected="100\n")

    def test_skips_single_prime_power(self):
        # 64 = 2^6 has one prime factor, so the answer for 64 is still 36.
        run_case(self, stdin="1\n64\n", expected="36\n")

    def test_skips_odd_exponent(self):
        # 72 = 2^3 * 3^2 has an odd exponent; 37..72 contains no 400 number.
        run_case(self, stdin="1\n72\n", expected="36\n")

    def test_title_value_404(self):
        # 400 = 2^4 * 5^2; 401..404 are not 400 numbers (brute(404) == 400).
        run_case(self, stdin="1\n404\n", expected="400\n")

    def test_skips_three_distinct_primes(self):
        # 900 = 2^2 * 3^2 * 5^2 has three primes. A 400 number is a perfect
        # square; the squares in (784, 900] are 841 = 29^2 (one prime) and 900,
        # while 784 = 2^4 * 7^2 qualifies. Answer 784.
        run_case(self, stdin="1\n900\n", expected="784\n")

    def test_several_queries_in_order(self):
        # Answers must be printed one per line, in query order.
        values = [404, 36, 60, 100, 900]
        run_case(self, stdin=make_input(values),
                 expected=make_output([400, 36, 36, 100, 784]))

    def test_every_a_from_36_to_1000(self):
        # One query per A in 36..1000; expected answers from brute().
        values = list(range(36, 1001))
        run_case(self, stdin=make_input(values),
                 expected=make_output([brute(a) for a in values]))

    def test_descending_a_from_5000(self):
        # Queries in decreasing order (4000..5000 reversed), expected from brute().
        values = list(range(5000, 3999, -1))
        run_case(self, stdin=make_input(values),
                 expected=make_output([brute(a) for a in values]))

    def test_moderate_a_brute_force(self):
        # A handful of larger values, expected from brute().
        values = [10007, 44100, 44099, 99999, 1000000]
        run_case(self, stdin=make_input(values),
                 expected=make_output([brute(a) for a in values]))


if __name__ == "__main__":
    unittest.main()
