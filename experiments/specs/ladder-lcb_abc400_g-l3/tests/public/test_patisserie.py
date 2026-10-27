# spec.md gives no sample cases and no constraints section, so every case
# here is tiny (N <= 6, scores <= 9) and only assumes what the statement
# itself implies: 1 <= K, 2K <= N (the pairs are disjoint), scores are
# non-negative integers. Expected answers are derived by hand (shown in
# the comments) or by the exhaustive search below.
import unittest

from sandbox.check import run_case


def price(a, b):
    return max(a[0] + b[0], a[1] + b[1], a[2] + b[2])


def brute(cakes, k):
    """Best total over every way to choose k disjoint pairs: the lowest
    unused cake is either left out or paired with each other unused cake."""
    def rec(rest, k):
        if k == 0:
            return 0
        if len(rest) < 2 * k:
            return None
        first, others = rest[0], rest[1:]
        best = rec(others, k)
        for i, other in enumerate(others):
            sub = rec(others[:i] + others[i + 1:], k - 1)
            if sub is not None:
                total = price(cakes[first], cakes[other]) + sub
                best = total if best is None else max(best, total)
        return best

    return rec(list(range(len(cakes))), k)


def stdin_of(cases):
    lines = [str(len(cases))]
    for cakes, k in cases:
        lines.append(f"{len(cakes)} {k}")
        lines.extend(" ".join(map(str, c)) for c in cakes)
    return "\n".join(lines) + "\n"


class TestPatisserie(unittest.TestCase):
    def test_smallest_single_pair(self):
        # One pair: sums (1+4, 2+0, 3+1) = (5, 2, 4), so the price is 5.
        run_case(self, stdin="1\n2 1\n1 2 3\n4 0 1\n", expected="5")

    def test_all_zero_scores(self):
        # Every sum is 0.
        run_case(self, stdin="1\n2 1\n0 0 0\n0 0 0\n", expected="0")

    def test_choose_best_of_three(self):
        # Pairs: (1,2) -> max(9,8,8)=9, (1,3) -> max(8,10,11)=11,
        # (2,3) -> max(5,12,3)=12. Best is 12.
        run_case(self, stdin="1\n3 1\n6 3 8\n3 5 0\n2 7 3\n", expected="12")

    def test_price_uses_one_dimension_per_pair(self):
        # a=(10,0,0) b=(10,0,0) c=(0,10,0) d=(0,0,10), K=2.
        # {ab,cd}: 20 + 10 = 30; {ac,bd}: 10 + 10 = 20; {ad,bc}: 10 + 10 = 20.
        run_case(self, stdin="1\n4 2\n10 0 0\n10 0 0\n0 10 0\n0 0 10\n", expected="30")

    def test_best_single_pair_not_in_optimum(self):
        # a=(5,2,5) b=(5,4,3) c=(4,5,1) d=(2,2,4), K=2.
        # {ab,cd}: 10 + 7 = 17; {ac,bd}: 9 + 7 = 16; {ad,bc}: 9 + 9 = 18.
        # The single best pair (ab, 10) leads only to 17.
        run_case(self, stdin="1\n4 2\n5 2 5\n5 4 3\n4 5 1\n2 2 4\n", expected="18")

    def test_multiple_test_cases_one_line_each(self):
        # The three cases above, answered independently and in order.
        stdin = "3\n2 1\n1 2 3\n4 0 1\n3 1\n6 3 8\n3 5 0\n2 7 3\n2 1\n0 0 0\n0 0 0\n"
        run_case(self, stdin=stdin, expected="5\n12\n0")

    def test_odd_n_leaves_one_cake_unpaired(self):
        # N=5, K=2: answer by exhaustive search over all matchings.
        cakes = [(3, 1, 4), (1, 5, 9), (2, 6, 5), (3, 5, 8), (9, 7, 9)]
        run_case(self, stdin=stdin_of([(cakes, 2)]), expected=str(brute(cakes, 2)))

    def test_every_cake_paired(self):
        # N=6, K=3 (2K = N): answer by exhaustive search over all matchings.
        cakes = [(0, 9, 1), (8, 0, 2), (1, 1, 7), (6, 3, 0), (2, 8, 4), (5, 5, 5)]
        run_case(self, stdin=stdin_of([(cakes, 3)]), expected=str(brute(cakes, 3)))

    def test_several_k_on_same_cakes(self):
        # Same six cakes with K = 1, 2, 3 as three test cases; answers by
        # exhaustive search.
        cakes = [(4, 0, 0), (0, 4, 0), (0, 0, 4), (3, 3, 0), (0, 3, 3), (3, 0, 3)]
        cases = [(cakes, k) for k in (1, 2, 3)]
        expected = "\n".join(str(brute(c, k)) for c, k in cases)
        run_case(self, stdin=stdin_of(cases), expected=expected)


if __name__ == "__main__":
    unittest.main()
