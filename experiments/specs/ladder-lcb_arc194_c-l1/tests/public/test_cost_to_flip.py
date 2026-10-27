import heapq
import unittest

from sandbox.check import run_case


def fmt(a, b, c):
    """The input exactly as the statement lays it out."""
    return "%d\n%s\n%s\n%s\n" % (
        len(a),
        " ".join(map(str, a)),
        " ".join(map(str, b)),
        " ".join(map(str, c)),
    )


def brute(a, b, c):
    """Dijkstra over all 2^N states of A: flipping bit i moves s to
    s ^ (1 << i) and costs sum of C_k over the set bits of the new state,
    exactly the operation in the statement. Only for tiny N."""
    n = len(a)
    cost = [sum(c[k] for k in range(n) if s >> k & 1) for s in range(1 << n)]
    start = sum(a[k] << k for k in range(n))
    goal = sum(b[k] << k for k in range(n))
    dist = [None] * (1 << n)
    dist[start] = 0
    heap = [(0, start)]
    while heap:
        d, s = heapq.heappop(heap)
        if d != dist[s]:
            continue
        if s == goal:
            return d
        for i in range(n):
            t = s ^ (1 << i)
            nd = d + cost[t]
            if dist[t] is None or nd < dist[t]:
                dist[t] = nd
                heapq.heappush(heap, (nd, t))
    raise AssertionError("unreachable")


class TestCostToFlip(unittest.TestCase):
    # --- N = 1, derived by hand ---

    def test_n1_already_equal_zero(self):
        # A = B, zero operations cost nothing; costs are never negative.
        run_case(self, stdin="1\n0\n0\n7\n", expected="0")

    def test_n1_already_equal_one(self):
        run_case(self, stdin="1\n1\n1\n1000000\n", expected="0")

    def test_n1_turn_off_max_c(self):
        # One flip 1 -> 0; the cost uses A after the change, which is all 0.
        run_case(self, stdin="1\n1\n0\n1000000\n", expected="0")

    def test_n1_turn_on_max_c(self):
        # One flip 0 -> 1; the cost uses A after the change: C_1.
        run_case(self, stdin="1\n0\n1\n1000000\n", expected="1000000")

    def test_n1_turn_on_min_c(self):
        run_case(self, stdin="1\n0\n1\n1\n", expected="1")

    # --- tiny cases, expected from the brute force above ---

    def test_brute_four_mixed(self):
        a, b, c = [0, 1, 1, 1], [1, 0, 1, 0], [4, 6, 2, 9]
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    def test_brute_heavy_matching_one(self):
        # A heavy position already equal to 1 in both A and B, with several
        # positions to turn on: temporarily turning it off may pay off.
        a, b, c = [1, 0, 0, 0, 0], [1, 1, 1, 1, 1], [1000000, 1, 1, 1, 1]
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    def test_brute_heavy_matching_one_not_worth(self):
        a, b, c = [1, 0], [1, 1], [5, 3]
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    def test_brute_on_and_off(self):
        a, b, c = [1, 0, 1, 0, 1], [0, 1, 1, 1, 0], [3, 8, 5, 2, 7]
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    def test_brute_all_off_to_all_on(self):
        a, b, c = [0, 0, 0, 0], [1, 1, 1, 1], [1, 2, 3, 4]
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    def test_brute_all_on_to_all_off(self):
        a, b, c = [1, 1, 1, 1], [0, 0, 0, 0], [1, 2, 3, 4]
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    def test_brute_six_max_values(self):
        a, b, c = [1, 1, 0, 1, 0, 1], [1, 0, 1, 1, 1, 0], [10**6] * 6
        run_case(self, stdin=fmt(a, b, c), expected=str(brute(a, b, c)))

    # --- N = 2 * 10^5, C_i = 10^6 everywhere ---
    # With equal C the cost of an operation is 10^6 times the number of
    # ones after it. That count moves by 1 per operation, so every level it
    # must pass through is first reached by a distinct operation; the plain
    # one-flip-per-position order attains exactly that bound.

    def test_max_all_equal_ones(self):
        n = 200000
        stdin = "%d\n%s\n%s\n%s\n" % (n, " ".join(["1"] * n), " ".join(["1"] * n), " ".join(["1000000"] * n))
        run_case(self, stdin=stdin, expected="0")

    def test_max_all_off_to_all_on(self):
        # Levels 1..N: 10^6 * N(N+1)/2.
        n = 200000
        stdin = "%d\n%s\n%s\n%s\n" % (n, " ".join(["0"] * n), " ".join(["1"] * n), " ".join(["1000000"] * n))
        run_case(self, stdin=stdin, expected="20000100000000000")

    def test_max_all_on_to_all_off(self):
        # Levels N-1..0: 10^6 * (N-1)N/2.
        n = 200000
        stdin = "%d\n%s\n%s\n%s\n" % (n, " ".join(["1"] * n), " ".join(["0"] * n), " ".join(["1000000"] * n))
        run_case(self, stdin=stdin, expected="19999900000000000")


if __name__ == "__main__":
    unittest.main()
