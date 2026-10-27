import unittest

from sandbox.check import run_case

# The answer is unique even though the statement allows "any" solution: the
# shortest palindrome P with prefix S has length n + k with k < n, so every
# character past S mirrors one inside S, forcing P = S + reverse(S[:k]).


def brute(s):
    # Obviously correct for tiny inputs: try appending reverse(S[:k]) for
    # k = 0, 1, 2, ... and return the first palindrome.
    for k in range(len(s) + 1):
        p = s + s[:k][::-1]
        if p == p[::-1]:
            return p


class TestShortestPalindrome(unittest.TestCase):
    # The spec lists no sample cases; the next three are the original
    # problem's examples, each checked by hand (and equal to brute()).
    def test_abc(self):
        run_case(self, stdin="ABC\n", expected="ABCBA")

    def test_single_z(self):
        run_case(self, stdin="Z\n", expected="Z")

    def test_tree(self):
        # Longest palindromic suffix is "EE", so append reverse("TR").
        run_case(self, stdin="TREE\n", expected="TREERT")

    def test_smallest_input_single_a(self):
        run_case(self, stdin="A\n", expected="A")

    def test_two_distinct_letters(self):
        run_case(self, stdin="AB\n", expected="ABA")

    def test_two_equal_letters(self):
        run_case(self, stdin="ZZ\n", expected="ZZ")

    def test_already_palindrome_odd(self):
        run_case(self, stdin="RACECAR\n", expected="RACECAR")

    def test_already_palindrome_even(self):
        run_case(self, stdin="ABBA\n", expected="ABBA")

    def test_odd_palindromic_suffix(self):
        # Longest palindromic suffix is "BAB", so append "A".
        run_case(self, stdin="ABAB\n", expected="ABABA")

    def test_brute_force_small_strings(self):
        # Expected values computed by brute() above.
        for s in ["AAB", "ABCA", "ABACABA", "AABAAC", "XYZZY", "BANANA", "QWERTY", "ABCDCBAX"]:
            with self.subTest(s=s):
                run_case(self, stdin=s + "\n", expected=brute(s))

    def test_max_length_all_same(self):
        # 500000 copies of one letter is already a palindrome.
        s = "A" * 500000
        run_case(self, stdin=s + "\n", expected=s)

    def test_max_length_worst_case_append(self):
        # Every suffix of length >= 2 starts with 'A' and ends with 'B', so the
        # longest palindromic suffix is "B": append all 499999 'A's.
        s = "A" * 499999 + "B"
        run_case(self, stdin=s + "\n", expected=s + "A" * 499999)

    def test_max_length_append_one(self):
        # S[1:] is all 'A' (a palindrome), S itself is not: append "B".
        s = "B" + "A" * 499999
        run_case(self, stdin=s + "\n", expected=s + "B")

    def test_max_length_alternating(self):
        # S = (AB)*250000 is not a palindrome; S[1:] = B(AB)*249999 is, so
        # append reverse("A").
        s = "AB" * 250000
        run_case(self, stdin=s + "\n", expected=s + "A")


if __name__ == "__main__":
    unittest.main()
