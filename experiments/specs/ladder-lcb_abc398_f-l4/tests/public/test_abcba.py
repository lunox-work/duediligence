"""Public tests for "ABCBA".

spec.md as shipped keeps only the title and the I/O format. The problem
statement, samples and constraints below are those of the original task
(AtCoder ABC398 F "ABCBA"):

    Find one shortest palindrome that has S as its prefix.
    1 <= |S| <= 500000; S consists of uppercase English letters.

The answer is unique, so an exact match is safe despite "any of them is
accepted": a palindrome T of length L (|S| <= L <= 2|S|) with prefix S is
fully determined by S, since its last L - |S| characters mirror its first
ones, which lie inside S. So only one candidate exists per length, and
the shortest length is unique.
"""

import unittest

from sandbox.check import run_case


def shortest_palindrome(s):
    # Brute force by the definition, for tiny inputs: try appending the
    # reversed first k characters for k = 0, 1, ... (by the note above,
    # these are the only candidates) and return the first palindrome.
    for k in range(len(s) + 1):
        t = s + s[:k][::-1]
        if t == t[::-1]:
            return t


class TestABCBA(unittest.TestCase):
    # Samples from the original statement.
    def test_sample_1(self):
        run_case(self, stdin="ABC\n", expected="ABCBA\n")

    def test_sample_2(self):
        run_case(self, stdin="Z\n", expected="Z\n")

    def test_sample_3(self):
        run_case(self, stdin="TREE\n", expected="TREERT\n")

    # Small cases; each expectation is derived by hand and checked
    # against the brute force above.
    def test_two_distinct_letters(self):
        # "AB" is not a palindrome; appending "A" gives "ABA".
        expected = "ABA"
        self.assertEqual(shortest_palindrome("AB"), expected)
        run_case(self, stdin="AB\n", expected=expected + "\n")

    def test_already_palindrome_even(self):
        # S is a palindrome itself, so nothing needs appending.
        expected = "ABBA"
        self.assertEqual(shortest_palindrome("ABBA"), expected)
        run_case(self, stdin="ABBA\n", expected=expected + "\n")

    def test_longest_palindromic_suffix_reused(self):
        # The suffix "ABA" of "XABA" is a palindrome and the whole string
        # is not, so only "X" is mirrored: "XABAX".
        expected = "XABAX"
        self.assertEqual(shortest_palindrome("XABA"), expected)
        run_case(self, stdin="XABA\n", expected=expected + "\n")

    def test_no_palindromic_suffix_longer_than_one(self):
        # Every suffix longer than one letter starts with a letter that
        # differs from its last letter, so S[:-1] is mirrored in full.
        expected = "ABCDCBA"
        self.assertEqual(shortest_palindrome("ABCD"), expected)
        run_case(self, stdin="ABCD\n", expected=expected + "\n")

    # Largest inputs (|S| = 500000).
    def test_max_length_all_same(self):
        # A string of one repeated letter is already a palindrome.
        s = "A" * 500000
        run_case(self, stdin=s + "\n", expected=s + "\n")

    def test_max_length_one_different_last_letter(self):
        # S = "A"*499999 + "B": any suffix longer than "B" starts with "A"
        # and ends with "B", so the longest palindromic suffix is "B" and
        # all 499999 "A"s are mirrored after it.
        s = "A" * 499999 + "B"
        run_case(self, stdin=s + "\n", expected=s + "A" * 499999 + "\n")


if __name__ == "__main__":
    unittest.main()
