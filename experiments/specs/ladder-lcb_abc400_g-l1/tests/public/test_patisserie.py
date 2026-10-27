import random
import unittest

from sandbox.check import run_case


def price(a, b):
    return max(a[0] + b[0], a[1] + b[1], a[2] + b[2])


def brute(k, cakes):
    """Maximum total price over every way to pick k disjoint pairs.

    Exhaustive: the first remaining cake is either left unpaired or paired
    with each other remaining cake in turn. Only used for N <= 8."""

    def best(rest, need):
        if need == 0:
            return 0
        if len(rest) < 2 * need:
            return None
        first, others = rest[0], rest[1:]
        result = best(others, need)
        for j in range(len(others)):
            sub = best(others[:j] + others[j + 1:], need - 1)
            if sub is not None:
                total = price(cakes[first], cakes[others[j]]) + sub
                if result is None or total > result:
                    result = total
        return result

    return best(list(range(len(cakes))), k)


def build(cases):
    lines = [str(len(cases))]
    for k, cakes in cases:
        lines.append(f"{len(cakes)} {k}")
        lines.extend(f"{x} {y} {z}" for x, y, z in cakes)
    return "\n".join(lines) + "\n"


def random_cases(seed, count, max_n, max_v):
    rng = random.Random(seed)
    cases = []
    for _ in range(count):
        n = rng.randint(2, max_n)
        k = rng.randint(1, n // 2)
        cakes = [tuple(rng.randint(0, max_v) for _ in range(3)) for _ in range(n)]
        cases.append((k, cakes))
    return cases


class TestPatisserie(unittest.TestCase):
    # Hand-derived small cases.

    def test_smallest_all_zero(self):
        # N=2, K=1: the only pair has price max(0,0,0) = 0.
        run_case(self, stdin="1\n2 1\n0 0 0\n0 0 0\n", expected="0")

    def test_smallest_max_values(self):
        # max(1e9+1e9, ...) = 2000000000, beyond 32-bit range.
        run_case(self, stdin="1\n2 1\n1000000000 1000000000 1000000000\n"
                 "1000000000 1000000000 1000000000\n", expected="2000000000")

    def test_max_taken_over_sums_not_per_cake(self):
        # max(5+0, 0+5, 0+0) = 5, not 5 + 5.
        run_case(self, stdin="1\n2 1\n5 0 0\n0 5 0\n", expected="5")

    def test_each_dimension_can_win(self):
        # Pair prices: X wins (3+4=7), Y wins (2+6=8), Z wins (9+1=10).
        stdin = ("3\n"
                 "2 1\n3 1 1\n4 1 1\n"
                 "2 1\n0 2 1\n1 6 0\n"
                 "2 1\n0 0 9\n2 0 1\n")
        run_case(self, stdin=stdin, expected="7\n8\n10")

    def test_three_cakes_one_pair(self):
        # Pairs: (1,2) max(9,8,8)=9, (1,3) max(8,10,11)=11, (2,3) max(5,12,3)=12.
        run_case(self, stdin="1\n3 1\n6 3 8\n3 5 0\n2 7 3\n", expected="12")

    def test_four_cakes_two_pairs(self):
        # Cakes A=(10,0,0) B=(0,10,0) C=(10,0,0) D=(0,10,0).
        # Pairings: AB+CD = 10+10, AC+BD = 20+20, AD+BC = 10+10. Best 40.
        run_case(self, stdin="1\n4 2\n10 0 0\n0 10 0\n10 0 0\n0 10 0\n", expected="40")

    def test_four_cakes_one_pair(self):
        # Same cakes, K=1: best single pair is AC (or BD) with price 20.
        run_case(self, stdin="1\n4 1\n10 0 0\n0 10 0\n10 0 0\n0 10 0\n", expected="20")

    def test_odd_n_one_cake_left_out(self):
        # N=5, K=2, X only: total is the sum of the 4 largest X = 5+4+3+2 = 14.
        run_case(self, stdin="1\n5 2\n1 0 0\n2 0 0\n3 0 0\n4 0 0\n5 0 0\n", expected="14")

    # Brute force over all pairings on tiny inputs (N <= 8).

    def _check_random(self, seed, count, max_n, max_v):
        cases = random_cases(seed, count, max_n, max_v)
        expected = "\n".join(str(brute(k, cakes)) for k, cakes in cases)
        run_case(self, stdin=build(cases), expected=expected)

    def test_brute_small_values(self):
        self._check_random(seed=1, count=40, max_n=6, max_v=5)

    def test_brute_small_values_n8(self):
        self._check_random(seed=2, count=30, max_n=8, max_v=10)

    def test_brute_binary_values(self):
        self._check_random(seed=3, count=40, max_n=8, max_v=1)

    def test_brute_large_values(self):
        self._check_random(seed=4, count=30, max_n=8, max_v=10 ** 9)

    # Large structured inputs whose answers follow directly.

    def test_large_all_max(self):
        # N=1e5, K=5e4, every pair costs 2e9: total 5e4 * 2e9 = 1e14.
        n = 10 ** 5
        stdin = f"1\n{n} {n // 2}\n" + "1000000000 1000000000 1000000000\n" * n
        run_case(self, stdin=stdin, expected=str(n // 2 * 2 * 10 ** 9))

    def test_large_x_only_all_paired(self):
        # Y=Z=0, so every pair costs X_a+X_b and pairing everyone gives
        # sum of X_i = 1+...+1e5 = 5000050000.
        n = 10 ** 5
        stdin = f"1\n{n} {n // 2}\n" + "".join(f"{i} 0 0\n" for i in range(1, n + 1))
        run_case(self, stdin=stdin, expected=str(n * (n + 1) // 2))

    def test_large_z_only_one_pair(self):
        # X=Y=0, K=1: the best pair is the two largest Z, 1e5 + 99999 = 199999.
        n = 10 ** 5
        stdin = f"1\n{n} 1\n" + "".join(f"0 0 {i}\n" for i in range(1, n + 1))
        run_case(self, stdin=stdin, expected="199999")

    def test_many_test_cases(self):
        # T=1000, each N=2 K=1: the answer is the single pair's price.
        rng = random.Random(5)
        cases = [(1, [tuple(rng.randint(0, 10 ** 9) for _ in range(3)) for _ in range(2)])
                 for _ in range(1000)]
        expected = "\n".join(str(price(c[0], c[1])) for _, c in cases)
        run_case(self, stdin=build(cases), expected=expected)


if __name__ == "__main__":
    unittest.main()
