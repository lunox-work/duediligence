import unittest

from src.solution import is_palindrome


class TestIsPalindrome(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_empty_string(self):
        self.assertIs(is_palindrome(''), True)

    def test_example_aba(self):
        self.assertIs(is_palindrome('aba'), True)

    def test_example_aaaaa(self):
        self.assertIs(is_palindrome('aaaaa'), True)

    def test_example_zbcd(self):
        self.assertIs(is_palindrome('zbcd'), False)

    # Rule: True when the string reads the same forwards and backwards.

    def test_even_length_palindrome(self):
        # Typical case: 'abba' reversed is 'abba', so it is a palindrome.
        self.assertIs(is_palindrome('abba'), True)

    def test_single_character_is_palindrome(self):
        # Boundary: a one-character string equals its own reverse.
        self.assertIs(is_palindrome('x'), True)

    # Rule: False when the string differs from its reverse.

    def test_two_different_characters_not_palindrome(self):
        # Typical case: 'ab' reversed is 'ba', which differs.
        self.assertIs(is_palindrome('ab'), False)

    def test_mismatch_only_at_outer_ends(self):
        # Boundary: 'abcbz' matches its reverse 'zbcba' everywhere except
        # the first and last characters ('a' vs 'z'), so it is not one.
        self.assertIs(is_palindrome('abcbz'), False)


if __name__ == '__main__':
    unittest.main()
