# Public tests for "Variety Split Hard" (spec.md).
#
# The statement gives no samples and no explicit constraints. The only
# bound it implies is N >= 3 (it needs 1 <= i < j <= N-1). Every case
# keeps 1 <= A_k <= N.
import unittest

from sandbox.check import run_case


def brute(a):
    """Try every split (i, j) with 1 <= i < j <= N-1 and count distinct
    values in each part directly. Obviously correct, fine for tiny N."""
    n = len(a)
    best = 0
    for i in range(1, n - 1):
        for j in range(i + 1, n):
            best = max(best, len(set(a[:i])) + len(set(a[i:j])) + len(set(a[j:])))
    return best


def stdin_of(a):
    return f"{len(a)}\n{' '.join(map(str, a))}\n"


class TestVarietySplit(unittest.TestCase):
    # By hand: N=3 allows only i=1, j=2, so every part is one element
    # with one distinct value; the answer is 3.
    def test_smallest_n_all_equal(self):
        run_case(self, stdin="3\n1 1 1\n", expected="3")

    # By hand: same single split as above.
    def test_smallest_n_all_distinct(self):
        run_case(self, stdin="3\n1 2 3\n", expected="3")

    # By hand: every part is non-empty, so each contributes exactly 1.
    def test_all_equal(self):
        run_case(self, stdin="4\n1 1 1 1\n", expected="3")

    # By hand: all values distinct, so each part counts its own length
    # and the sum is N for any split.
    def test_all_distinct(self):
        run_case(self, stdin="5\n1 2 3 4 5\n", expected="5")

    # By hand: [1 2][1 2][1 2] gives 2+2+2 = 6, and the sum can never
    # exceed N = 6.
    def test_repeating_block_reaches_n(self):
        run_case(self, stdin="6\n1 2 1 2 1 2\n", expected="6")

    # By hand: [3 1][4 1][5] gives 2+2+1 = 5. Upper bound: 3, 4, 5 occur
    # once each and so count at most once; 1 occurs twice and counts at
    # most twice; total <= 5. Brute force agrees.
    def test_one_repeated_value(self):
        a = [3, 1, 4, 1, 5]
        self.assertEqual(brute(a), 5)
        run_case(self, stdin=stdin_of(a), expected="5")

    # By hand: 1 occurs three times and can be counted in every part;
    # 2 occurs once. [1][1][2 1] gives 1+1+2 = 4, the maximum possible.
    def test_value_counted_in_all_three_parts(self):
        a = [1, 1, 2, 1]
        self.assertEqual(brute(a), 4)
        run_case(self, stdin=stdin_of(a), expected="4")

    # Expected from brute() above.
    def test_brute_mixed_10(self):
        a = [2, 5, 6, 4, 4, 1, 1, 3, 1, 4]
        run_case(self, stdin=stdin_of(a), expected=str(brute(a)))

    # Expected from brute() above.
    def test_brute_mixed_8(self):
        a = [1, 2, 3, 1, 2, 3, 4, 4]
        run_case(self, stdin=stdin_of(a), expected=str(brute(a)))

    # Expected from brute() above: the repeated values sit only at the
    # ends, so the middle part has to be chosen carefully.
    def test_brute_repeats_at_ends(self):
        a = [5, 5, 1, 2, 3, 4, 6, 6]
        run_case(self, stdin=stdin_of(a), expected=str(brute(a)))

    # Expected from brute() above.
    def test_brute_two_values_alternating_odd(self):
        a = [1, 2, 1, 2, 1, 2, 1]
        run_case(self, stdin=stdin_of(a), expected=str(brute(a)))


if __name__ == "__main__":
    unittest.main()
