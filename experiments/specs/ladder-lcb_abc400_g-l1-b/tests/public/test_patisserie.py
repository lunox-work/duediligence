import random
import unittest

from sandbox.check import run_case


def brute_force(k, cakes):
    """Best total price over every set of exactly k disjoint pairs, by
    trying every matching. Only for tiny N."""
    n = len(cakes)
    best = -1

    def go(i, used, pairs, total):
        nonlocal best
        if pairs == k:
            best = max(best, total)
            return
        if i >= n:
            return
        if used[i]:
            go(i + 1, used, pairs, total)
            return
        go(i + 1, used, pairs, total)  # leave cake i unpaired
        used[i] = True
        for j in range(i + 1, n):
            if not used[j]:
                used[j] = True
                price = max(cakes[i][d] + cakes[j][d] for d in range(3))
                go(i + 1, used, pairs + 1, total + price)
                used[j] = False
        used[i] = False

    go(0, [False] * n, 0, 0)
    return best


def format_cases(cases):
    lines = [str(len(cases))]
    for k, cakes in cases:
        lines.append(f"{len(cakes)} {k}")
        lines.extend(" ".join(map(str, c)) for c in cakes)
    return "\n".join(lines) + "\n"


class TestPatisserie(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="1\n3 1\n6 3 8\n3 5 0\n2 7 3\n", expected="12\n")

    def test_sample_2(self):
        run_case(
            self,
            stdin=(
                "2\n"
                "5 2\n1 2 3\n1 2 3\n1 2 3\n1 2 3\n100 100 200\n"
                "6 2\n21 74 25\n44 71 80\n46 28 96\n1 74 24\n81 83 16\n55 31 1\n"
            ),
            expected="209\n333\n",
        )

    def test_smallest_all_zero(self):
        # N=2, K=1, every value 0: the only pair has price 0.
        run_case(self, stdin="1\n2 1\n0 0 0\n0 0 0\n", expected="0\n")

    def test_smallest_max_values(self):
        # N=2, K=1, every value 10^9: price is 10^9 + 10^9.
        run_case(
            self,
            stdin="1\n2 1\n1000000000 1000000000 1000000000\n"
            "1000000000 1000000000 1000000000\n",
            expected="2000000000\n",
        )

    def test_smallest_different_dimensions(self):
        # Only pair: max(10+0, 0+10, 0+0) = 10.
        run_case(self, stdin="1\n2 1\n10 0 0\n0 10 0\n", expected="10\n")

    def test_all_cakes_used_pairing_matters(self):
        # K = N/2 = 2, so all four cakes are used. The three matchings:
        # {1,2},{3,4}: 10 + 20 = 30; {1,3},{2,4}: 10 + 10 = 20;
        # {1,4},{2,3}: 10 + 10 = 20. Best is 30.
        run_case(
            self,
            stdin="1\n4 2\n10 0 0\n0 10 0\n0 0 10\n0 0 10\n",
            expected="30\n",
        )

    def test_random_small_brute_force(self):
        # Seeded random cases with N <= 8; answers from brute_force above,
        # which tries every set of K disjoint pairs.
        rng = random.Random(400)
        cases = []
        for _ in range(200):
            n = rng.randint(2, 8)
            k = rng.randint(1, n // 2)
            hi = rng.choice([3, 20, 10**9])
            cakes = [tuple(rng.randint(0, hi) for _ in range(3)) for _ in range(n)]
            cases.append((k, cakes))
        expected = "\n".join(str(brute_force(k, c)) for k, c in cases) + "\n"
        run_case(self, stdin=format_cases(cases), expected=expected)

    def test_max_t_tiny_cases(self):
        # T = 1000 cases, each N=2, K=1, cake values (i, 0, 0) and (0, 0, i):
        # the only pair costs max(i, 0, i) = i.
        cases = [(1, [(i, 0, 0), (0, 0, i)]) for i in range(1000)]
        expected = "\n".join(str(i) for i in range(1000)) + "\n"
        run_case(self, stdin=format_cases(cases), expected=expected)

    def test_large_all_max_values(self):
        # N = 10^5, K = N/2, every value 10^9: each pair costs 2*10^9,
        # total 50000 * 2*10^9 = 10^14.
        n = 100000
        line = "1000000000 1000000000 1000000000\n"
        run_case(self, stdin=f"1\n{n} {n // 2}\n" + line * n, expected="100000000000000\n")

    def test_large_all_used_one_dimension(self):
        # N = 10^5, cake i = (i, 0, 0), K = N/2: every cake is used and each
        # pair costs X_a + X_b, so the total is 1 + 2 + ... + N = 5000050000.
        n = 100000
        body = "".join(f"{i} 0 0\n" for i in range(1, n + 1))
        run_case(self, stdin=f"1\n{n} {n // 2}\n" + body, expected="5000050000\n")

    def test_large_single_pair(self):
        # N = 10^5, cake i = (0, i, 0), K = 1: the best pair is the two
        # largest Y values, 100000 + 99999 = 199999.
        n = 100000
        body = "".join(f"0 {i} 0\n" for i in range(1, n + 1))
        run_case(self, stdin=f"1\n{n} 1\n" + body, expected="199999\n")


if __name__ == "__main__":
    unittest.main()
