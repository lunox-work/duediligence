import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(n, a, queries):
    """Enumerate every P (all (N-1)! parent choices), build T(P), and sum the
    u-v path weight directly by walking both vertices up to the root.
    a[i] is the weight A_i of the edge from i to its parent (a[0], a[1] unused)."""
    sums = [0] * len(queries)
    for choice in itertools.product(*[range(1, i) for i in range(2, n + 1)]):
        parent = [0, 0] + list(choice)
        for k, (u, v) in enumerate(queries):
            up = {}
            x, d = u, 0
            while True:
                up[x] = d
                if x == 1:
                    break
                d += a[x]
                x = parent[x]
            y, d = v, 0
            while y not in up:
                d += a[y]
                y = parent[y]
            sums[k] += d + up[y]
    return [s % MOD for s in sums]


def make_input(n, a, queries):
    lines = [f"{n} {len(queries)}", " ".join(str(a[i]) for i in range(2, n + 1))]
    lines += [f"{u} {v}" for u, v in queries]
    return "\n".join(lines) + "\n"


class TestRandomTreeDistance(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 2\n1 1\n1 2\n1 3\n", expected="2\n3\n")

    def test_sample_2(self):
        run_case(self, stdin="2 1\n100\n1 2\n", expected="100\n")

    def test_sample_3(self):
        run_case(
            self,
            stdin=(
                "9 6\n"
                "765689282 93267307 563699854 951829154 801512848 389123318 924504746 596035433\n"
                "3 8\n2 5\n5 8\n2 9\n8 9\n5 7\n"
            ),
            expected="55973424\n496202632\n903509579\n343265517\n550981449\n68482696\n",
        )

    def test_smallest_n_max_weight(self):
        # N=2: the only tree is the single edge 1-2, so the sum is
        # A_2 = 10^9, and 10^9 mod 998244353 = 1755647.
        run_case(self, stdin="2 1\n1000000000\n1 2\n", expected="1755647\n")

    def test_n3_max_weights_all_pairs(self):
        # By hand with a = 10^9: P=(1,1) gives d12=a, d13=a, d23=2a;
        # P=(1,2) gives d12=a, d13=2a, d23=a. Sums 2a, 3a, 3a, and
        # a mod 998244353 = 1755647.
        run_case(
            self,
            stdin="3 3\n1000000000 1000000000\n1 2\n1 3\n2 3\n",
            expected="3511294\n5266941\n5266941\n",
        )

    def test_repeated_query(self):
        # Same query twice must give the same answer twice (sample 1's 1 3 -> 3).
        run_case(self, stdin="3 2\n1 1\n1 3\n1 3\n", expected="3\n3\n")

    def test_n6_all_pairs_brute_force(self):
        # Expected computed by enumerating all 5! trees (brute above).
        n = 6
        a = [0, 0, 3, 1, 4, 1, 5]
        queries = [(u, v) for u in range(1, n + 1) for v in range(u + 1, n + 1)]
        expected = brute(n, a, queries)
        run_case(self, stdin=make_input(n, a, queries),
                 expected="\n".join(map(str, expected)) + "\n")

    def test_n8_large_weights_brute_force(self):
        # Expected computed by enumerating all 7! trees (brute above);
        # weights near the 10^9 limit exercise the modulo.
        n = 8
        a = [0, 0, 10**9, 999999999, 10**9, 123456789, 10**9, 998244353, 10**9]
        queries = [(1, 8), (7, 8), (2, 3), (4, 6), (1, 2), (5, 8), (3, 7)]
        expected = brute(n, a, queries)
        run_case(self, stdin=make_input(n, a, queries),
                 expected="\n".join(map(str, expected)) + "\n")


if __name__ == "__main__":
    unittest.main()
