import unittest
from functools import lru_cache

from sandbox.check import run_case

# spec.md gives no samples and no constraints, so every case keeps to
# small inputs: N >= 2 and small positive integers.


@lru_cache(maxsize=None)
def brute(seq):
    """Try every order of removing two adjacent numbers until at most one
    is left; return the best total of absolute differences. Exhaustive,
    so obviously correct; only used on tiny inputs."""
    if len(seq) <= 1:
        return 0
    best = 0
    for i in range(len(seq) - 1):
        rest = seq[:i] + seq[i + 2:]
        best = max(best, abs(seq[i] - seq[i + 1]) + brute(rest))
    return best


def stdin_for(values):
    return f"{len(values)}\n{' '.join(map(str, values))}\n"


class TestAdjacentDelete(unittest.TestCase):
    def check_brute(self, values):
        run_case(self, stdin=stdin_for(values), expected=str(brute(tuple(values))))

    def test_two_numbers(self):
        # Only one move: |3 - 8| = 5.
        run_case(self, stdin="2\n3 8\n", expected="5")

    def test_two_equal_numbers(self):
        # Only one move: |4 - 4| = 0.
        run_case(self, stdin="2\n4 4\n", expected="0")

    def test_two_numbers_descending(self):
        # Only one move: |9 - 2| = 7; the difference is absolute.
        run_case(self, stdin="2\n9 2\n", expected="7")

    def test_three_numbers_one_left(self):
        # Odd N: one number stays. Remove (1,5) for 4 or (5,2) for 3; best 4.
        run_case(self, stdin="3\n1 5 2\n", expected="4")

    def test_three_numbers_middle_cannot_remain(self):
        # Removing either adjacent pair leaves an end number: (10,1) or (1,10),
        # both 9. Leaving the middle 1 would need removing (10,10), which are
        # not adjacent.
        run_case(self, stdin="3\n10 1 10\n", expected="9")

    def test_four_numbers_nested_pairing(self):
        # Removing (2,5) for 3 makes 1 and 3 adjacent, then (1,3) for 2: 5.
        # The other orders give (1,2)+(5,3) = 3. Brute force agrees.
        run_case(self, stdin="4\n1 2 5 3\n", expected="5")
        self.assertEqual(brute((1, 2, 5, 3)), 5)

    def test_all_equal(self):
        # Every difference is 0.
        run_case(self, stdin="5\n1 1 1 1 1\n", expected="0")

    def test_seven_numbers_brute(self):
        # Expected from the exhaustive brute force above.
        self.check_brute([3, 1, 4, 1, 5, 9, 2])

    def test_six_numbers_brute(self):
        # Expected from the exhaustive brute force above.
        self.check_brute([5, 1, 1, 5, 2, 8])

    def test_eight_numbers_brute(self):
        # Expected from the exhaustive brute force above.
        self.check_brute([7, 3, 9, 2, 2, 6, 1, 8])

    def test_five_numbers_brute(self):
        # Expected from the exhaustive brute force above.
        self.check_brute([2, 9, 4, 4, 1])


if __name__ == "__main__":
    unittest.main()
