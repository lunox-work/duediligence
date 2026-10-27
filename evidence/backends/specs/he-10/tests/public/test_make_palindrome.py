import unittest

from src.solution import make_palindrome


class TestMakePalindrome(unittest.TestCase):
    def test_docstring_empty_string(self):
        self.assertEqual(make_palindrome(""), "")

    def test_docstring_cat(self):
        self.assertEqual(make_palindrome("cat"), "catac")

    def test_docstring_cata(self):
        self.assertEqual(make_palindrome("cata"), "catac")

    def test_single_character_needs_no_append(self):
        # The whole one-character string is a palindrome; its prefix is empty.
        self.assertEqual(make_palindrome("x"), "x")

    def test_whole_odd_length_palindrome_needs_no_append(self):
        # The longest palindromic suffix is all of "racecar"; append nothing.
        self.assertEqual(make_palindrome("racecar"), "racecar")

    def test_whole_even_length_palindrome_needs_no_append(self):
        # The longest palindromic suffix is all of "abba"; append nothing.
        self.assertEqual(make_palindrome("abba"), "abba")

    def test_even_length_palindromic_suffix(self):
        # "cc" is the longest palindromic suffix; reverse prefix "ab" to "ba".
        self.assertEqual(make_palindrome("abcc"), "abccba")

    def test_longest_of_multiple_palindromic_suffixes(self):
        # Suffixes "a", "aba", and "ababa" qualify. Use "ababa", then append
        # the reverse of the remaining prefix "xy", namely "yx".
        self.assertEqual(make_palindrome("xyababa"), "xyababayx")

    def test_only_final_character_is_palindromic_suffix(self):
        # Only suffix "d" qualifies; reversing prefix "abc" gives "cba".
        self.assertEqual(make_palindrome("abcd"), "abcdcba")

    def test_uppercase_and_lowercase_are_distinct(self):
        # Under exact string reversal "Aa" is not a palindrome. Suffix "a"
        # qualifies, so append the reverse of prefix "A".
        self.assertEqual(make_palindrome("Aa"), "AaA")

    def test_spaces_are_preserved_in_reversed_prefix(self):
        # Only suffix "b" qualifies; reversing prefix "a " gives " a".
        self.assertEqual(make_palindrome("a b"), "a b a")

    def test_non_ascii_characters(self):
        # Only suffix "猫" qualifies; reverse prefix "é" and append it.
        self.assertEqual(make_palindrome("é猫"), "é猫é")


if __name__ == "__main__":
    unittest.main()
