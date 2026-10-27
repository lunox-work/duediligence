import unittest

from src.solution import is_palindrome


class TestIsPalindrome(unittest.TestCase):
    def test_example_empty_string(self):
        self.assertEqual(is_palindrome(""), True)

    def test_example_aba(self):
        self.assertEqual(is_palindrome("aba"), True)

    def test_example_repeated_character(self):
        self.assertEqual(is_palindrome("aaaaa"), True)

    def test_example_zbcd(self):
        self.assertEqual(is_palindrome("zbcd"), False)

    def test_even_length_palindrome(self):
        # Reversing "abba" gives "abba": both mirrored pairs match.
        self.assertEqual(is_palindrome("abba"), True)

    def test_single_character(self):
        # A single character reads identically in either direction.
        self.assertEqual(is_palindrome("x"), True)

    def test_two_distinct_characters(self):
        # "ab" reverses to "ba"; length two is the shortest possible mismatch.
        self.assertEqual(is_palindrome("ab"), False)

    def test_matching_endpoints_with_inner_mismatch(self):
        # "abca" reverses to "acba": the endpoints match but b and c do not.
        self.assertEqual(is_palindrome("abca"), False)
