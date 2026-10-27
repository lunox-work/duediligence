import unittest
from collections import deque

from sandbox.check import run_case


def brute_force(a):
    """Breadth-first search over every sequence reachable by the two
    operations; the depth at which the empty sequence is first reached is
    the minimum number of operations. Only used on tiny inputs."""
    start = tuple(a)
    dist = {start: 0}
    queue = deque([start])
    while queue:
        u = queue.popleft()
        if not u:
            return dist[u]
        nexts = []
        for i in range(len(u) - 1):
            v = list(u)
            v[i], v[i + 1] = v[i + 1], v[i]
            nexts.append(tuple(v))
        i = 0
        while i < len(u) and u[i] == u[0]:
            i += 1
            nexts.append(u[i:])
        for v in nexts:
            if v not in dist:
                dist[v] = dist[u] + 1
                queue.append(v)


def single(a):
    return f"1\n{len(a)}\n{' '.join(map(str, a))}\n"


class TestSwapAndErase(unittest.TestCase):
    # The statement gives no samples, so every expected value below is
    # derived by hand (reasoning in the comment) or by brute_force above.

    def test_two_equal(self):
        # One deletion removes the whole prefix of equal values.
        run_case(self, stdin=single([1, 1]), expected="1")

    def test_two_distinct(self):
        # Two distinct values need two deletions; deleting each in turn works.
        run_case(self, stdin=single([1, 2]), expected="2")

    def test_two_distinct_reversed(self):
        # Same argument as [1, 2].
        run_case(self, stdin=single([2, 1]), expected="2")

    def test_two_equal_larger_value(self):
        # Values are only compared for equality; one deletion suffices.
        run_case(self, stdin=single([2, 2]), expected="1")

    def test_all_distinct(self):
        # Each distinct value needs its own deletion, so at least 4;
        # deleting the front element four times achieves 4.
        run_case(self, stdin=single([4, 2, 1, 3]), expected="4")

    def test_all_equal(self):
        # One deletion of the whole sequence.
        run_case(self, stdin=single([3, 3, 3, 3, 3]), expected="1")

    def test_one_two_one(self):
        # Two operations cannot work: two deletions without a swap leave
        # [2, 1] after the first; one swap plus one deletion still leaves two
        # distinct values. Three deletions work.
        run_case(self, stdin=single([1, 2, 1]), expected="3")

    def test_swap_helps(self):
        # Swap positions 3 and 4 -> [1, 1, 1, 2, 2], then two deletions: 3.
        # Fewer is impossible: two distinct values force two deletions, and
        # without any swap the four runs need four deletions.
        run_case(self, stdin=single([1, 1, 2, 1, 2]), expected="3")

    def test_alternating_eleven(self):
        a = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]
        expected = brute_force(a)  # 8
        run_case(self, stdin=single(a), expected=str(expected))

    def test_three_values_repeated(self):
        a = [1, 2, 3, 1, 2, 3]
        expected = brute_force(a)  # 6
        run_case(self, stdin=single(a), expected=str(expected))

    def test_multiple_cases(self):
        # Answers of [1, 1], [1, 2] and [1, 2, 1] as derived above, printed
        # one per line in input order.
        run_case(
            self,
            stdin="3\n2\n1 1\n2\n1 2\n3\n1 2 1\n",
            expected="1\n2\n3",
        )

    def test_large_all_equal(self):
        # 200000 copies of the value 200000: one deletion removes everything.
        n = 200000
        stdin = f"1\n{n}\n{' '.join([str(n)] * n)}\n"
        run_case(self, stdin=stdin, expected="1")


if __name__ == "__main__":
    unittest.main()
