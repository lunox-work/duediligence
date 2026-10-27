import unittest

from sandbox.check import run_case

# Note: the shortest palindrome with prefix S is unique. If it has length
# n + k (k <= n), each of its last k characters mirrors a position inside S,
# so it must equal S + reverse(S[:k]). Hence exact output comparison is sound.


class TestABCBA(unittest.TestCase):
    # --- samples from the statement ---

    def test_sample_1(self):
        run_case(self, stdin="ABC", expected="ABCBA")

    def test_sample_2(self):
        run_case(self, stdin="Z", expected="Z")

    def test_sample_3(self):
        run_case(self, stdin="TREE", expected="TREERT")

    # --- small cases derived by hand ---

    def test_single_letter_a(self):
        # Smallest input; a single letter is already a palindrome.
        run_case(self, stdin="A", expected="A")

    def test_already_palindrome(self):
        # "RACECAR" is a palindrome, so nothing needs to be appended.
        run_case(self, stdin="RACECAR", expected="RACECAR")

    def test_two_distinct_letters(self):
        # "AB" is not a palindrome; appending "A" gives "ABA".
        run_case(self, stdin="AB", expected="ABA")

    def test_two_equal_letters(self):
        # "AA" is already a palindrome.
        run_case(self, stdin="AA", expected="AA")

    def test_longest_palindromic_suffix_is_one_char(self):
        # "AAB": longest palindromic suffix is "B", so append reverse("AA").
        run_case(self, stdin="AAB", expected="AABAA")

    def test_long_palindromic_suffix(self):
        # "XABACABA": suffix "ABACABA" is a palindrome, append "X".
        run_case(self, stdin="XABACABA", expected="XABACABAX")

    # --- maximum-length cases (|S| = 500000), expected built in the test ---

    def test_max_length_all_same(self):
        # All one letter: already a palindrome.
        s = "Z" * 500000
        run_case(self, stdin=s, expected=s)

    def test_max_length_last_differs(self):
        # "A"*499999 + "B": longest palindromic suffix is "B" (any longer
        # suffix starts with A and ends with B), so append "A"*499999.
        s = "A" * 499999 + "B"
        run_case(self, stdin=s, expected=s + "A" * 499999)

    def test_max_length_alternating(self):
        # "AB"*250000: S itself starts with A and ends with B, so it is not a
        # palindrome; S[1:] = "B" + "AB"*249999 is alternating, starts and ends
        # with B, so it is a palindrome. Append reverse(S[:1]) = "A".
        s = "AB" * 250000
        run_case(self, stdin=s, expected=s + "A")


if __name__ == "__main__":
    unittest.main()
