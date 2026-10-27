import heapq
import unittest

from sandbox.check import run_case


def brute_force(a, b, c):
    """Dijkstra over all 2^N states of A, one edge per single flip, edge
    weight = sum of C over the ones after the flip, exactly as the
    statement defines an operation. Weights are non-negative, so the
    shortest distance from A to B is the minimum total cost. Tiny N only."""
    n = len(a)
    start = sum(bit << i for i, bit in enumerate(a))
    goal = sum(bit << i for i, bit in enumerate(b))

    def weight(state):
        return sum(c[i] for i in range(n) if state >> i & 1)

    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, state = heapq.heappop(heap)
        if state == goal:
            return d
        if d > dist[state]:
            continue
        for i in range(n):
            nxt = state ^ (1 << i)
            nd = d + weight(nxt)
            if nd < dist.get(nxt, float("inf")):
                dist[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    raise AssertionError("unreachable")


def make_input(a, b, c):
    return "\n".join([
        str(len(a)),
        " ".join(map(str, a)),
        " ".join(map(str, b)),
        " ".join(map(str, c)),
    ]) + "\n"


class TestCostToFlip(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="4\n0 1 1 1\n1 0 1 0\n4 6 2 9\n", expected="16")

    def test_sample_2(self):
        run_case(self, stdin="5\n1 1 1 1 1\n1 1 1 1 1\n1 1 1 1 1\n", expected="0")

    def test_sample_3(self):
        run_case(
            self,
            stdin="20\n"
            "1 1 1 1 0 0 1 1 0 0 0 1 0 1 0 1 1 0 1 0\n"
            "0 0 0 1 1 1 0 1 1 0 0 0 0 0 0 1 0 1 0 0\n"
            "52 73 97 72 54 15 79 67 13 55 65 22 36 90 84 46 1 2 27 8\n",
            expected="2867",
        )

    # N = 1, by hand.

    def test_single_zero_to_one(self):
        # One flip; afterwards A_1 = 1, so the cost is C_1.
        run_case(self, stdin="1\n0\n1\n7\n", expected="7")

    def test_single_one_to_zero(self):
        # The cost uses A after the flip: A_1 = 0, so the cost is 0.
        run_case(self, stdin="1\n1\n0\n7\n", expected="0")

    def test_single_already_equal_one(self):
        # Zero operations cost 0, and no cost is negative.
        run_case(self, stdin="1\n1\n1\n1000000\n", expected="0")

    def test_single_already_equal_zero(self):
        run_case(self, stdin="1\n0\n0\n1\n", expected="0")

    def test_single_max_cost(self):
        # Largest C_i: one flip to 1 costs C_1 = 10^6.
        run_case(self, stdin="1\n0\n1\n1000000\n", expected="1000000")

    # Tiny cases, expected value from brute_force above.

    def test_brute_keep_one_on(self):
        a, b, c = [1, 0], [1, 1], [5, 3]
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    def test_brute_expensive_one_stays_on(self):
        # Turning A_1 off and back on may beat leaving it on.
        a, b, c = [1, 0, 0, 0], [1, 1, 1, 1], [100, 1, 1, 1]
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    def test_brute_mixed(self):
        a, b, c = [1, 1, 0, 0, 1], [0, 1, 1, 0, 1], [3, 5, 7, 2, 9]
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    def test_brute_all_ones_to_all_zeros(self):
        a, b, c = [1, 1, 1, 1], [0, 0, 0, 0], [4, 1, 3, 2]
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    def test_brute_all_zeros_to_all_ones(self):
        a, b, c = [0, 0, 0, 0], [1, 1, 1, 1], [4, 1, 3, 2]
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    def test_brute_shared_ones_max_cost(self):
        a, b, c = [1, 1, 0, 1], [1, 0, 1, 1], [1000000, 1, 1000000, 1000000]
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    # Largest N = 2 * 10^5 with C_i = 10^6 everywhere.

    def test_max_n_all_ones_to_all_zeros(self):
        # After the t-th operation at least N - t ones remain, so the cost
        # is at least sum_{t=1..N} 10^6 (N - t) = 10^6 N (N - 1) / 2;
        # switching them off one by one attains it.
        n = 200000
        c = 1000000
        run_case(
            self,
            stdin=make_input([1] * n, [0] * n, [c] * n),
            expected=str(c * n * (n - 1) // 2),
        )

    def test_max_n_all_zeros_to_all_ones(self):
        # Order the elements by their last flip (which sets them to 1 for
        # good); the j-th such operation leaves at least j ones, so the cost
        # is at least 10^6 N (N + 1) / 2; switching them on one by one
        # attains it.
        n = 200000
        c = 1000000
        run_case(
            self,
            stdin=make_input([0] * n, [1] * n, [c] * n),
            expected=str(c * n * (n + 1) // 2),
        )

    def test_max_n_already_equal(self):
        n = 200000
        a = [i % 2 for i in range(n)]
        run_case(self, stdin=make_input(a, a, [1000000] * n), expected="0")


if __name__ == "__main__":
    unittest.main()
