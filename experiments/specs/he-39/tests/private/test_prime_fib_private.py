import unittest

from src.solution import prime_fib


def _is_prime(k):
    # Plain trial division: obviously correct, fast enough for k < 3e9.
    if k < 2:
        return False
    d = 2
    while d * d <= k:
        if k % d == 0:
            return False
        d += 1
    return True


def _brute_prime_fibs(count):
    # Walk the Fibonacci sequence 1, 1, 2, 3, ... keeping each distinct
    # value that is prime, until `count` have been collected.
    found = []
    a, b = 1, 1
    while len(found) < count:
        if _is_prime(a) and a not in found:
            found.append(a)
        a, b = b, a + b
    return found


class TestPrimeFibPrivate(unittest.TestCase):
    # Extends test_example_n1: 1 appears twice in the Fibonacci sequence but
    # is not prime, so the first prime Fibonacci is 2, never 1.
    def test_first_is_not_one(self):
        self.assertNotEqual(prime_fib(1), 1)
        self.assertEqual(prime_fib(1), 2)

    # Extends test_example_n2/test_example_n3: the result is an int, not a
    # float or other numeric type.
    def test_returns_int(self):
        for n in (1, 3, 6, 9):
            self.assertIs(type(prime_fib(n)), int)

    # Extends test_boundary_skips_composite_fibonacci_run: the 9th prime
    # Fibonacci. Fibonacci after 28657: 46368 (even), 75025 (ends in 5),
    # 121393 = 233 * 521, 196418 (even), 317811 (div by 3: digit sum 21),
    # 514229. Primality of 514229 checked by the trial-division helper.
    def test_ninth_prime_fibonacci(self):
        self.assertTrue(_is_prime(514229))
        self.assertEqual(prime_fib(9), 514229)

    # Extends test_boundary_skips_composite_fibonacci_run: a lookup table of
    # the eight visible values fails here. The 10th is F(43) = 433494437;
    # between it and 514229 sit F(31) = 1346269 = 557 * 2417, F(37) =
    # 24157817 = 73 * 149 * 2221 and F(41) = 165580141 = 2789 * 59369, so a
    # primality test that only tries small divisors also fails here.
    def test_tenth_prime_fibonacci(self):
        self.assertEqual(557 * 2417, 1346269)
        self.assertEqual(2789 * 59369, 165580141)
        self.assertTrue(_is_prime(433494437))
        self.assertEqual(prime_fib(10), 433494437)

    # Extends test_typical_seventh_prime_fibonacci: the 11th is F(47) =
    # 2971215073 (F(44..46) are 701408733, 1134903170, 1836311903; the first
    # is div by 3, the second even, the third = 139 * 461 * 28657).
    def test_eleventh_prime_fibonacci(self):
        self.assertEqual(139 * 461 * 28657, 1836311903)
        self.assertTrue(_is_prime(2971215073))
        self.assertEqual(prime_fib(11), 2971215073)

    # Extends all public tests: every n from 1 to 11 against the brute force.
    def test_matches_brute_force_1_to_11(self):
        expected = _brute_prime_fibs(11)
        for n in range(1, 12):
            self.assertEqual(prime_fib(n), expected[n - 1], msg="n=%d" % n)

    # Extends test_example_n5: calls in descending and shuffled order give the
    # same answers as ascending order (no state carried between calls).
    def test_order_of_calls_does_not_matter(self):
        expected = _brute_prime_fibs(10)
        for n in (10, 7, 1, 9, 3, 3, 8, 2, 6, 5, 4, 1, 10):
            self.assertEqual(prime_fib(n), expected[n - 1], msg="n=%d" % n)

    # Extends test_typical_sixth_prime_fibonacci: results are strictly
    # increasing, each is prime and each is a Fibonacci number.
    def test_results_prime_fibonacci_and_increasing(self):
        fibs = set()
        a, b = 1, 1
        while a <= 3 * 10 ** 9:
            fibs.add(a)
            a, b = b, a + b
        prev = 0
        for n in range(1, 12):
            v = prime_fib(n)
            self.assertIn(v, fibs, msg="n=%d" % n)
            self.assertTrue(_is_prime(v), msg="n=%d" % n)
            self.assertGreater(v, prev, msg="n=%d" % n)
            prev = v

    # Extends test_example_n4: composite Fibonacci numbers whose index is
    # prime (F(19) = 4181 = 37 * 113) and odd composites (21, 55, 377) are
    # never returned; the values just below and above them are exact.
    def test_skips_composites_with_prime_index(self):
        self.assertEqual(37 * 113, 4181)
        self.assertEqual(13 * 29, 377)
        values = [prime_fib(n) for n in range(1, 9)]
        for composite in (1, 8, 21, 34, 55, 144, 377, 4181, 17711):
            self.assertNotIn(composite, values)
        self.assertEqual(values, [2, 3, 5, 13, 89, 233, 1597, 28657])


if __name__ == "__main__":
    unittest.main()
