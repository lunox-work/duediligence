# Public tests for "Smooth Occlusion".
#
# spec.md gives only the input format. The rules, constraints and samples
# below are from the original problem (AtCoder ABC395 F):
#   There are N upper teeth of lengths U_i and N lower teeth of lengths D_i.
#   Paying 1 reduces any tooth of positive length by 1. The teeth fit well
#   when some integer H has U_i + D_i = H for every i and
#   |U_i - U_{i+1}| <= X for every i. Print the minimum total cost.
#   2 <= N <= 2*10^5, 1 <= U_i, D_i <= 10^9, 1 <= X <= 10^9.
import unittest
from itertools import product

from sandbox.check import run_case


def brute(x, teeth):
    """Exhaustive search for tiny inputs. The cost of reaching a common sum H
    is sum(U_i + D_i) - N*H, so try every H from the largest possible value
    downward. For each H, try every assignment of upper lengths u_i with
    0 <= u_i <= U_i and 0 <= H - u_i <= D_i, and accept H if some assignment
    has adjacent differences of at most x."""
    total = sum(u + d for u, d in teeth)
    for h in range(min(u + d for u, d in teeth), -1, -1):
        ranges = [range(max(0, h - d), min(u, h) + 1) for u, d in teeth]
        for ups in product(*ranges):
            if all(abs(a - b) <= x for a, b in zip(ups, ups[1:])):
                return total - len(teeth) * h


def stdin_for(x, teeth):
    lines = [f"{len(teeth)} {x}"] + [f"{u} {d}" for u, d in teeth]
    return "\n".join(lines) + "\n"


class TestSmoothOcclusion(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="4 3\n3 1\n4 1\n5 9\n2 6\n", expected="15")

    def test_sample_2(self):
        run_case(self, stdin="4 1000000000\n3 3\n3 3\n3 3\n3 3\n", expected="0")

    def test_sample_3(self):
        run_case(
            self,
            stdin="4 1\n1000000000 1000000000\n1000000000 1000000000\n"
            "1000000000 1000000000\n1 1\n",
            expected="5999999994",
        )

    def test_smallest_n_already_fitting(self):
        # N = 2 with equal teeth: H = 2 and both upper lengths are 1, so the
        # teeth already fit and nothing needs to be paid.
        run_case(self, stdin="2 1\n1 1\n1 1\n", expected="0")

    def test_smallest_n_tiny_brute(self):
        # Expected value from brute(). By hand: u2 >= H - 1 and u1 <= 1, so
        # H <= 3. H = 3 works with u = (1, 2), so the cost is 12 - 6 = 6.
        teeth = [(1, 5), (5, 1)]
        self.assertEqual(brute(1, teeth), 6)
        run_case(self, stdin=stdin_for(1, teeth), expected="6")

    def test_three_teeth_tiny_brute(self):
        # Expected value from brute().
        teeth = [(2, 1), (1, 4), (4, 2)]
        run_case(self, stdin=stdin_for(1, teeth), expected=str(brute(1, teeth)))

    def test_max_values_already_fitting(self):
        # All lengths and X are at their maximum. H = 2*10^9 and every upper
        # length is equal, so the teeth already fit and the cost is 0.
        run_case(
            self,
            stdin="2 1000000000\n1000000000 1000000000\n1000000000 1000000000\n",
            expected="0",
        )

    def test_max_values_opposed_teeth(self):
        # Worked out by hand: U = (10^9, 1), D = (1, 10^9), X = 1. Both sums
        # are 10^9 + 1, and u1 >= H - 1, u2 <= 1, |u1 - u2| <= 1 give H <= 3.
        # H = 3 works with u = (2, 1). Cost = 2*(10^9 + 1) - 2*3.
        run_case(
            self,
            stdin="2 1\n1000000000 1\n1 1000000000\n",
            expected=str(2 * (10**9 + 1) - 6),
        )

    def test_max_n_one_short_tooth(self):
        # Worked out by hand: N = 2*10^5, X = 1. The first N-1 teeth are
        # (10^9, 10^9) and the last is (1, 1). The last sum forces H <= 2.
        # H = 2 works with every u_i = 1, so the cost is the total minus 2N.
        n = 200000
        teeth = [(10**9, 10**9)] * (n - 1) + [(1, 1)]
        expected = (n - 1) * 2 * 10**9 + 2 - 2 * n
        run_case(self, stdin=stdin_for(1, teeth), expected=str(expected))


if __name__ == "__main__":
    unittest.main()
