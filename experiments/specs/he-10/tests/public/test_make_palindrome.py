import unittest

from src.solution import make_palindrome


class TestMakePalindrome(unittest.TestCase):
    # Docstring examples.

    def test_example_empty(self):
        self.assertEqual(make_palindrome(''), '')

    def test_example_cat(self):
        self.assertEqual(make_palindrome('cat'), 'catac')

    def test_example_cata(self):
        self.assertEqual(make_palindrome('cata'), 'catac')

    # Rule: result is the shortest palindrome that begins with the string.

    def test_shortest_palindrome_typical(self):
        # Longest palindromic suffix of 'abc' is 'c'; append reverse of 'ab'.
        # 'abc' + 'ba' = 'abcba'.
        self.assertEqual(make_palindrome('abc'), 'abcba')

    def test_shortest_palindrome_single_char(self):
        # A single character is already a palindrome; nothing is appended.
        self.assertEqual(make_palindrome('x'), 'x')

    # Rule: find the longest palindromic postfix of the string.

    def test_longest_palindromic_postfix_typical(self):
        # Suffixes of 'abb': 'abb' (no), 'bb' (yes). Prefix before it is 'a'.
        # 'abb' + 'a' = 'abba'.
        self.assertEqual(make_palindrome('abb'), 'abba')

    def test_longest_palindromic_postfix_is_whole_string(self):
        # 'racecar' is itself a palindrome, so the prefix is empty and the
        # string is returned unchanged.
        self.assertEqual(make_palindrome('racecar'), 'racecar')

    # Rule: append the reverse of the prefix before the palindromic suffix.

    def test_append_reversed_prefix_typical(self):
        # Suffixes of 'abcdd': 'abcdd', 'bcdd', 'cdd' (no), 'dd' (yes).
        # Prefix 'abc' reversed is 'cba'. 'abcdd' + 'cba' = 'abcddcba'.
        self.assertEqual(make_palindrome('abcdd'), 'abcddcba')

    def test_append_reversed_prefix_only_last_char_palindromic(self):
        # Suffixes of 'ab': 'ab' (no), 'b' (yes). Prefix 'a' reversed is 'a'.
        # 'ab' + 'a' = 'aba'.
        self.assertEqual(make_palindrome('ab'), 'aba')


if __name__ == '__main__':
    unittest.main()
