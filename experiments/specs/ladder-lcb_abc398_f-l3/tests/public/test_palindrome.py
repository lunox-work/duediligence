"""Public tests for "ABCBA": print a shortest palindrome that begins with S.

The statement gives no samples and no constraints, so every case is a
short string of uppercase letters (the alphabet the title uses).

The shortest such palindrome is unique: one of length L <= 2|S| (S + S
reversed always works) has its first |S| characters fixed by S and every
other character fixed by mirroring, so an exact-match expected value is
sound despite "any of them is accepted". It is S followed by the reverse
of the part of S before S's longest palindromic suffix. Each expected
value below was derived by hand that way and cross-checked with a brute
force that tries S + reverse(S[:k]) for k = 0, 1, ... and keeps the
first palindrome.
"""

import unittest

from sandbox.check import run_case


class TestPalindrome(unittest.TestCase):
    def test_title_example_abc(self):
        # The title: longest palindromic suffix of ABC is "C"; append "BA".
        run_case(self, stdin="ABC\n", expected="ABCBA")

    def test_single_character(self):
        # Smallest input: one character is already a palindrome.
        run_case(self, stdin="A\n", expected="A")

    def test_single_character_z(self):
        run_case(self, stdin="Z\n", expected="Z")

    def test_two_distinct(self):
        # Suffix "B"; append "A".
        run_case(self, stdin="AB\n", expected="ABA")

    def test_two_equal(self):
        # Already a palindrome; nothing appended.
        run_case(self, stdin="AA\n", expected="AA")

    def test_odd_palindrome_unchanged(self):
        run_case(self, stdin="ABA\n", expected="ABA")

    def test_even_palindrome_unchanged(self):
        run_case(self, stdin="ABBA\n", expected="ABBA")

    def test_longer_palindrome_unchanged(self):
        run_case(self, stdin="ABACABA\n", expected="ABACABA")

    def test_all_same_letter(self):
        run_case(self, stdin="AAAAA\n", expected="AAAAA")

    def test_even_palindromic_suffix(self):
        # Suffix "EE"; append reverse of "TR".
        run_case(self, stdin="TREE\n", expected="TREERT")

    def test_suffix_after_one_char(self):
        # Suffix "AA"; append "B".
        run_case(self, stdin="BAA\n", expected="BAAB")

    def test_repeated_prefix(self):
        # Suffix "B" only; append reverse of "AA".
        run_case(self, stdin="AAB\n", expected="AABAA")

    def test_long_repeated_prefix(self):
        # Suffix "B" only; append reverse of "AAA".
        run_case(self, stdin="AAAB\n", expected="AAABAAA")

    def test_overlapping_odd_suffix(self):
        # Suffix "BAB"; append "A".
        run_case(self, stdin="ABAB\n", expected="ABABA")

    def test_odd_suffix_after_one_char(self):
        # Suffix "ABA"; append "A".
        run_case(self, stdin="AABA\n", expected="AABAA")

    def test_last_char_breaks_palindrome(self):
        # Suffix "C" only; append reverse of "ABA".
        run_case(self, stdin="ABAC\n", expected="ABACABA")

    def test_long_palindromic_suffix(self):
        # Suffix "BCDCB"; append "A".
        run_case(self, stdin="ABCDCB\n", expected="ABCDCBA")

    def test_all_distinct(self):
        # No palindromic suffix longer than one character; append "DCBA".
        run_case(self, stdin="ABCDE\n", expected="ABCDEDCBA")


if __name__ == "__main__":
    unittest.main()
