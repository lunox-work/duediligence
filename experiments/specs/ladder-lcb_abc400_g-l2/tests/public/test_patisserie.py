# Public tests for "Patisserie ABC 3" (spec.md).
#
# The statement as given contains no sample cases and no constraints
# section, so every case here is derived: either by hand (worked in the
# comment above the case) or by an exhaustive brute force over all ways
# to choose K disjoint pairs, run on tiny inputs. All cases keep
# 2K <= N, K >= 1 and non-negative integer values, as the statement
# requires.
import random
import unittest

from sandbox.check import run_case


def price(a, b):
    return max(a[0] + b[0], a[1] + b[1], a[2] + b[2])


def brute(cakes, k):
    """Best total price of exactly k disjoint pairs: the first remaining
    cake is either left unused or paired with some later cake; recurse."""
    if k == 0:
        return 0
    if len(cakes) < 2 * k:
        return None
    best = brute(cakes[1:], k)
    first, rest = cakes[0], cakes[1:]
    for j in range(len(rest)):
        sub = brute(rest[:j] + rest[j + 1:], k - 1)
        if sub is not None:
            total = price(first, rest[j]) + sub
            if best is None or total > best:
                best = total
    return best


def build(cases):
    lines = [str(len(cases))]
    for cakes, k in cases:
        lines.append(f"{len(cakes)} {k}")
        lines.extend(f"{x} {y} {z}" for x, y, z in cakes)
    return "\n".join(lines) + "\n"


def random_cases(seed, count, max_n, max_value):
    rng = random.Random(seed)
    cases = []
    for _ in range(count):
        n = rng.randint(2, max_n)
        k = rng.randint(1, n // 2)
        cakes = [tuple(rng.randint(0, max_value) for _ in range(3)) for _ in range(n)]
        cases.append((cakes, k))
    return cases


class TestPatisserie(unittest.TestCase):
    def test_smallest_single_pair(self):
        # N=2, K=1: the only pair; sums are X=5, Y=2, Z=3, so the price is 5.
        run_case(self, stdin="1\n2 1\n1 2 3\n4 0 0\n", expected="5")

    def test_choose_best_pair_of_three(self):
        # Pairs: (1,2) -> max(9,8,8)=9; (1,3) -> max(8,10,11)=11;
        # (2,3) -> max(5,12,3)=12. Best is 12.
        run_case(self, stdin="1\n3 1\n6 3 8\n3 5 0\n2 7 3\n", expected="12")

    def test_pairing_matters(self):
        # A=B=(10,0,0), C=D=(0,10,0). Pairings: AB+CD = 20+20 = 40,
        # AC+BD = 10+10 = 20, AD+BC = 10+10 = 20. Best is 40.
        run_case(self, stdin="1\n4 2\n10 0 0\n0 10 0\n10 0 0\n0 10 0\n", expected="40")

    def test_all_zero(self):
        # Every sum is 0, so every pair costs 0.
        run_case(self, stdin="1\n4 2\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n", expected="0")

    def test_large_values_single_pair(self):
        # 10^9 + 10^9 in every coordinate: 2000000000.
        run_case(self, stdin="1\n2 1\n1000000000 1000000000 1000000000\n"
                 "1000000000 1000000000 1000000000\n", expected="2000000000")

    def test_large_values_mixed_coordinates(self):
        # Every pairing by hand: (1,2)+(3,4) = 10^9 + 2*10^9;
        # (1,3)+(2,4) = 10^9 + 2*10^9; (1,4)+(2,3) = 2*10^9 + 10^9.
        # Each totals 3000000000 (above 2^31 - 1).
        cakes = "1000000000 0 0\n0 1000000000 0\n0 0 1000000000\n1000000000 1000000000 1000000000\n"
        run_case(self, stdin="1\n4 2\n" + cakes, expected="3000000000")

    def test_all_max_values_four_cakes(self):
        # All coordinates 10^9: each of the 2 pairs costs 2*10^9, total 4*10^9.
        row = "1000000000 1000000000 1000000000\n"
        run_case(self, stdin="1\n4 2\n" + row * 4, expected="4000000000")

    def test_multiple_test_cases_in_order(self):
        # The three hand-derived cases above, answered one per line in order.
        stdin = ("3\n"
                 "2 1\n1 2 3\n4 0 0\n"
                 "3 1\n6 3 8\n3 5 0\n2 7 3\n"
                 "4 2\n10 0 0\n0 10 0\n10 0 0\n0 10 0\n")
        run_case(self, stdin=stdin, expected="5\n12\n40")

    def test_brute_force_small_values(self):
        # 60 random tiny cases (N <= 8, values <= 10); expected by brute force.
        cases = random_cases(seed=400, count=60, max_n=8, max_value=10)
        expected = "\n".join(str(brute(c, k)) for c, k in cases)
        run_case(self, stdin=build(cases), expected=expected)

    def test_brute_force_large_values(self):
        # 40 random tiny cases (N <= 8, values <= 10^9); expected by brute force.
        cases = random_cases(seed=7, count=40, max_n=8, max_value=10**9)
        expected = "\n".join(str(brute(c, k)) for c, k in cases)
        run_case(self, stdin=build(cases), expected=expected)

    def test_brute_force_full_pairing(self):
        # 30 random cases with K = N/2 (every cake used), N in {2,4,6,8};
        # expected by brute force.
        rng = random.Random(2025)
        cases = []
        for _ in range(30):
            n = rng.choice([2, 4, 6, 8])
            cakes = [tuple(rng.randint(0, 20) for _ in range(3)) for _ in range(n)]
            cases.append((cakes, n // 2))
        expected = "\n".join(str(brute(c, k)) for c, k in cases)
        run_case(self, stdin=build(cases), expected=expected)


if __name__ == "__main__":
    unittest.main()
