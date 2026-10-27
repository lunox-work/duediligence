# spec.md gives no samples and no constraints. Every case below uses
# A >= 36, because 36 = 2^2 * 3^2 is the smallest 400 number and no answer
# exists below it. A 400 number is exactly m^2 where m has exactly two
# distinct prime factors, so each expected value is the square of the
# largest such m with m^2 <= A; the factorizations are given per case.
import unittest

from sandbox.check import run_case


def _is_400_number(n):
    # Brute force by trial division: exactly two distinct primes, each
    # with an even exponent.
    exponents = []
    d = 2
    while d * d <= n:
        if n % d == 0:
            e = 0
            while n % d == 0:
                n //= d
                e += 1
            exponents.append(e)
        d += 1
    if n > 1:
        exponents.append(1)
    return len(exponents) == 2 and all(e % 2 == 0 for e in exponents)


class Test400Numbers(unittest.TestCase):
    def test_smallest_400_number_itself(self):
        # 36 = 2^2 * 3^2 is the smallest 400 number, and "at most A" includes A.
        run_case(self, stdin="1\n36\n", expected="36")

    def test_between_36_and_100(self):
        # 60 is not a square; the next 400 number after 36 is 100 = 2^2 * 5^2.
        run_case(self, stdin="1\n60\n", expected="36")

    def test_just_below_second_400_number(self):
        # 99 < 100 = 10^2, and 49, 64, 81 are prime-power squares.
        run_case(self, stdin="1\n99\n", expected="36")

    def test_second_400_number_itself(self):
        # 100 = 2^2 * 5^2.
        run_case(self, stdin="1\n100\n", expected="100")

    def test_odd_exponent_not_counted(self):
        # 108 = 2^2 * 3^3 has an odd exponent; 100 is the answer (121 > 108).
        run_case(self, stdin="1\n108\n", expected="100")

    def test_four_hundred(self):
        # 400 = 20^2 = 2^4 * 5^2; the next one, 441 = 21^2, exceeds 404.
        run_case(self, stdin="1\n404\n", expected="400")

    def test_three_prime_square_not_counted(self):
        # 900 = 2^2 * 3^2 * 5^2 has three distinct primes; 29 is prime,
        # 28 = 2^2 * 7, so the answer is 28^2 = 784.
        run_case(self, stdin="1\n900\n", expected="784")

    def test_prime_power_square_not_counted(self):
        # 1024 = 2^10 has one prime; 31 is prime, 30 = 2*3*5, 29 is prime,
        # 28 = 2^2 * 7, so the answer is 784.
        run_case(self, stdin="1\n1024\n", expected="784")

    def test_higher_even_exponents(self):
        # 1296 = 36^2 = 2^4 * 3^4.
        run_case(self, stdin="1\n1296\n", expected="1296")

    def test_just_below_1296(self):
        # m <= 35 and 35 = 5 * 7, so the answer is 35^2 = 1225.
        run_case(self, stdin="1\n1295\n", expected="1225")

    def test_multiple_queries_in_order(self):
        # Answers from the single-query cases above, printed one per line
        # in query order.
        run_case(self, stdin="5\n404\n36\n60\n900\n1296\n", expected="400\n36\n36\n784\n1296")

    def test_repeated_query(self):
        run_case(self, stdin="3\n100\n100\n100\n", expected="100\n100\n100")

    def test_every_a_from_36_to_2000(self):
        # Expected values computed here by brute force: for each A, the
        # largest n <= A that passes the trial-division check above.
        queries = list(range(36, 2001))
        answers = []
        best = None
        for n in range(1, 2001):
            if _is_400_number(n):
                best = n
            if n >= 36:
                answers.append(best)
        stdin = f"{len(queries)}\n" + "".join(f"{a}\n" for a in queries)
        expected = "\n".join(str(x) for x in answers)
        run_case(self, stdin=stdin, expected=expected)

    def test_medium_value(self):
        # 123454321 = 11111^2 = (41 * 271)^2 and 11112^2 = 123476544 > A;
        # checked offline by brute force over m from 11111 downward.
        run_case(self, stdin="1\n123456789\n", expected="123454321")

    def test_ten_to_the_twelfth_itself(self):
        # 10^12 = 2^12 * 5^12.
        run_case(self, stdin="1\n1000000000000\n", expected="1000000000000")

    def test_just_below_ten_to_the_twelfth(self):
        # m <= 999999 = 3^3 * 7 * 11 * 13 * 37 (five primes);
        # 999998 = 2 * 31 * 127^2 (three primes);
        # 999997 = 757 * 1321, both prime. Answer 999997^2 = 999994000009.
        run_case(self, stdin="1\n999999999999\n", expected="999994000009")


if __name__ == "__main__":
    unittest.main()
