import itertools
import unittest

from sandbox.check import run_case


def brute(x, teeth):
    """Minimum cost by trying every final length of every tooth (0..original)
    and keeping the cheapest assignment that fits together well. Only for
    tiny inputs."""
    total = sum(u + d for u, d in teeth)
    choices = [[(a, b) for a in range(u + 1) for b in range(d + 1)] for u, d in teeth]
    best = None
    for pick in itertools.product(*choices):
        if len({a + b for a, b in pick}) != 1:
            continue
        if any(abs(pick[i][0] - pick[i + 1][0]) > x for i in range(len(pick) - 1)):
            continue
        cost = total - sum(a + b for a, b in pick)
        if best is None or cost < best:
            best = cost
    return best


def render(x, teeth):
    lines = [f"{len(teeth)} {x}"] + [f"{u} {d}" for u, d in teeth]
    return "\n".join(lines) + "\n"


class TestSmoothOcclusion(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="4 3\n3 1\n4 1\n5 9\n2 6\n", expected="15\n")

    def test_sample_2(self):
        run_case(self, stdin="4 1000000000\n3 3\n3 3\n3 3\n3 3\n", expected="0\n")

    def test_sample_3(self):
        run_case(
            self,
            stdin="4 1\n1000000000 1000000000\n1000000000 1000000000\n"
            "1000000000 1000000000\n1 1\n",
            expected="5999999994\n",
        )

    def test_sample_4(self):
        run_case(
            self,
            stdin="15 128\n748 169\n586 329\n972 529\n432 519\n408 587\n"
            "138 249\n656 114\n632 299\n984 755\n404 772\n155 506\n"
            "832 854\n353 465\n387 374\n567 385\n",
            expected="9460\n",
        )

    def test_smallest_input_already_fits(self):
        # N=2, every value 1: H=2 and |1-1|=0 <= 1, so nothing to grind.
        run_case(self, stdin="2 1\n1 1\n1 1\n", expected="0\n")

    def test_max_values_already_fit(self):
        # Every value at its maximum and all equal: already fits, cost 0.
        run_case(
            self,
            stdin="2 1000000000\n1000000000 1000000000\n1000000000 1000000000\n",
            expected="0\n",
        )

    def test_max_and_min_tooth_pair(self):
        # By hand: H <= min(U_i+D_i) = 2; H=2 with u=(1,1) fits, so the
        # cost is (2e9 + 2) - 2*2 = 1999999998.
        run_case(self, stdin="2 1\n1000000000 1000000000\n1 1\n", expected="1999999998\n")

    def test_tiny_grind_upper_tooth(self):
        # By hand: H <= 2; H=2 with u=(1,1) fits; cost 6 - 4 = 2.
        teeth = [(1, 1), (3, 1)]
        self.assertEqual(brute(1, teeth), 2)
        run_case(self, stdin=render(1, teeth), expected="2\n")

    def test_x_forces_lower_h(self):
        # By hand: H=6,5,4 leave upper lengths at least 4,3,2 apart; H=3
        # with u=(2,1), d=(1,2) fits; cost 12 - 6 = 6. Confirmed by brute().
        teeth = [(5, 1), (1, 5)]
        self.assertEqual(brute(1, teeth), 6)
        run_case(self, stdin=render(1, teeth), expected="6\n")

    def test_tiny_cases_by_brute_force(self):
        # Expected values computed by exhaustive search (brute above).
        for x, teeth in [
            (1, [(3, 1), (1, 5)]),
            (1, [(4, 1), (1, 1), (4, 1)]),
            (2, [(5, 2), (1, 4), (3, 3)]),
            (1, [(1, 4), (4, 1), (1, 4)]),
        ]:
            with self.subTest(x=x, teeth=teeth):
                run_case(self, stdin=render(x, teeth), expected=f"{brute(x, teeth)}\n")

    def test_max_n_alternating_extremes(self):
        # N = 2*10^5 alternating (1e9,1e9) and (1,1), X = 1e9. H <= 2 and
        # H=2 with every u_i = 1 fits, so the cost is the total minus 2N:
        # 10^5*(2e9) + 10^5*2 - 4*10^5 = 199999999800000.
        teeth = [(10**9, 10**9), (1, 1)] * 100000
        run_case(self, stdin=render(10**9, teeth), expected="199999999800000\n")

    def test_max_n_all_max_values(self):
        # N = 2*10^5, all lengths 1e9, X = 1: already fits, cost 0.
        teeth = [(10**9, 10**9)] * 200000
        run_case(self, stdin=render(1, teeth), expected="0\n")


if __name__ == "__main__":
    unittest.main()
