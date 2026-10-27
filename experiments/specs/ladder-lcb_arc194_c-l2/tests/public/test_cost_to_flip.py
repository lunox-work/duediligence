import heapq
import unittest

from sandbox.check import run_case


def brute_force(a, b, c):
    """Dijkstra over all 2^N states of A: an edge flips one A_i and costs
    sum(A_k * C_k) of the A after the flip, exactly as the statement
    defines one operation. Only used for tiny N."""
    start, target = tuple(a), tuple(b)
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == target:
            return d
        if d > dist[u]:
            continue
        for i in range(len(u)):
            v = list(u)
            v[i] ^= 1
            v = tuple(v)
            nd = d + sum(x * w for x, w in zip(v, c))
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))


def make_input(a, b, c):
    return "\n".join([str(len(a)), " ".join(map(str, a)), " ".join(map(str, b)), " ".join(map(str, c))]) + "\n"


class TestCostToFlip(unittest.TestCase):
    def check_brute(self, a, b, c):
        run_case(self, stdin=make_input(a, b, c), expected=str(brute_force(a, b, c)))

    # N = 1, hand-derived.

    def test_single_equal_zero(self):
        # Already identical: zero operations, cost 0.
        run_case(self, stdin="1\n0\n0\n5\n", expected="0")

    def test_single_equal_one(self):
        run_case(self, stdin="1\n1\n1\n5\n", expected="0")

    def test_single_zero_to_one(self):
        # One flip is required; afterwards A = (1), so the cost is C_1 = 7.
        run_case(self, stdin="1\n0\n1\n7\n", expected="7")

    def test_single_one_to_zero(self):
        # The cost uses A after the flip: A = (0), so the cost is 0.
        run_case(self, stdin="1\n1\n0\n7\n", expected="0")

    def test_single_zero_to_one_large_cost(self):
        # C_1 = 10^6, the original contest's bound on C_i.
        run_case(self, stdin="1\n0\n1\n1000000\n", expected="1000000")

    # Small N, expected value from the brute force above.

    def test_four_elements_mixed(self):
        # Brute force gives 16.
        self.check_brute([0, 1, 1, 1], [1, 0, 1, 0], [4, 6, 2, 9])

    def test_already_equal_five(self):
        # A = B: zero operations, cost 0.
        run_case(self, stdin="5\n1 0 1 0 1\n1 0 1 0 1\n3 1 4 1 5\n", expected="0")

    def test_turn_off_expensive_matching_one(self):
        # A_1 = B_1 = 1 with a large C_1: switching it off first and back
        # on last (0 + 1 + 2 + 102 = 105) beats leaving it on (101 + 102).
        # Brute force gives 105.
        self.check_brute([1, 0, 0], [1, 1, 1], [100, 1, 1])

    def test_all_ones_to_zeros(self):
        # Flip the cheaper one last: first flip leaves A_1 on (3), second
        # costs 0. Brute force gives 3.
        self.check_brute([1, 1], [0, 0], [3, 5])

    def test_all_zeros_to_ones_distinct_costs(self):
        # Turning on in ascending cost order: 1 + 3 + 7 + 12 = 23.
        # Brute force gives 23.
        self.check_brute([0, 0, 0, 0], [1, 1, 1, 1], [5, 1, 4, 2])

    def test_six_elements_mixed(self):
        self.check_brute([1, 1, 0, 1, 0, 0], [0, 1, 1, 1, 1, 0], [7, 30, 2, 9, 5, 11])

    def test_eight_elements_large_costs(self):
        self.check_brute(
            [1, 0, 1, 1, 0, 1, 0, 1],
            [0, 1, 1, 0, 1, 1, 1, 0],
            [1000000, 1, 999999, 3, 500000, 1000000, 2, 7],
        )

    # Largest case under the original contest's bounds (N <= 2*10^5, C_i <= 10^6).

    def test_max_all_zeros_to_ones(self):
        # A all 0, B all 1, every C_i = c. Each element's last flip turns it
        # on and it stays on, so the j-th of these last flips costs at least
        # j*c; flipping each once in any order achieves exactly that.
        # Answer: c * N(N+1)/2 = 20000100000000000.
        n, c = 200000, 1000000
        stdin = f"{n}\n{' '.join(['0'] * n)}\n{' '.join(['1'] * n)}\n{' '.join([str(c)] * n)}\n"
        run_case(self, stdin=stdin, expected=str(c * n * (n + 1) // 2))


if __name__ == "__main__":
    unittest.main()
