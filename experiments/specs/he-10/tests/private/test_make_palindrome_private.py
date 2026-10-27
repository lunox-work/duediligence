import random
import unittest

from src.solution import make_palindrome


def brute_force(string):
    # The shortest palindrome beginning with `string` is string + t for the
    # smallest possible t. For a result of length len(string) + k with
    # k <= len(string), its last k characters mirror the first k, so t must be
    # string[:k] reversed. Try k = 0, 1, 2, ... and return the first palindrome
    # (k = len(string) always works, so the loop always returns).
    for k in range(len(string) + 1):
        candidate = string + string[:k][::-1]
        if candidate == candidate[::-1]:
            return candidate


class TestMakePalindromePrivate(unittest.TestCase):
    # Extends test_example_empty: the result is a str, not just falsy.

    def test_empty_returns_empty_str(self):
        result = make_palindrome('')
        self.assertIsInstance(result, str)
        self.assertEqual(result, '')

    # Extends test_shortest_palindrome_single_char: other single characters,
    # including a digit, a space and a non-ASCII letter.

    def test_single_chars_unchanged(self):
        for ch in ['a', 'Z', '7', ' ', 'é']:
            self.assertEqual(make_palindrome(ch), ch)

    # Extends test_append_reversed_prefix_only_last_char_palindromic: two equal
    # characters are already a palindrome, nothing is appended.

    def test_two_equal_chars_unchanged(self):
        self.assertEqual(make_palindrome('aa'), 'aa')

    # Extends test_append_reversed_prefix_only_last_char_palindromic: the
    # comparison is case-sensitive, so 'aA' is not a palindrome. Longest
    # palindromic suffix is 'A'; append 'a'.

    def test_case_sensitive(self):
        self.assertEqual(make_palindrome('aA'), 'aAa')
        self.assertEqual(make_palindrome('Ab'), 'AbA')

    # Extends test_example_cat: whitespace and punctuation are ordinary
    # characters. 'ab ' -> longest palindromic suffix ' ', append 'ba'.

    def test_whitespace_not_stripped(self):
        self.assertEqual(make_palindrome('ab '), 'ab ba')

    # 'a,' -> longest palindromic suffix ',', append 'a'.

    def test_punctuation_kept(self):
        self.assertEqual(make_palindrome('a,'), 'a,a')

    # Extends test_longest_palindromic_postfix_is_whole_string: even-length
    # palindrome is returned unchanged.

    def test_even_length_palindrome_unchanged(self):
        self.assertEqual(make_palindrome('abba'), 'abba')

    # Extends test_longest_palindromic_postfix_is_whole_string: a long
    # palindrome (a 1001-char one) is returned unchanged.

    def test_long_palindrome_unchanged(self):
        s = 'ab' * 250 + 'c' + 'ba' * 250
        self.assertEqual(make_palindrome(s), s)

    # Extends test_example_cata: a long palindromic suffix 'abacaba' (7 chars)
    # after one leading 'x'; only 'x' needs appending. An implementation that
    # only checks short suffixes, or just mirrors s[:-1], fails here.

    def test_long_palindromic_suffix(self):
        self.assertEqual(make_palindrome('xabacaba'), 'xabacabax')

    # Extends test_longest_palindromic_postfix_typical: 'abaxyx' has
    # palindromic suffixes 'x' and 'xyx'; the longest is 'xyx' ('axyx',
    # 'baxyx', 'abaxyx' are not). Prefix 'aba' reversed is 'aba'.
    # Picking the shortest palindromic suffix would give 'abaxyxyxaba'.

    def test_picks_longest_not_shortest_palindromic_suffix(self):
        self.assertEqual(make_palindrome('abaxyx'), 'abaxyxaba')

    # Extends test_shortest_palindrome_typical: 'aab' has palindromic prefix
    # 'aa' but its only palindromic suffix is 'b'. Prefix 'aa' reversed is 'aa'.
    # An implementation using palindromic prefixes would get it wrong.

    def test_palindromic_prefix_is_irrelevant(self):
        self.assertEqual(make_palindrome('aab'), 'aabaa')

    # Extends test_append_reversed_prefix_typical: 'aacecaaa'. Suffixes from
    # longest: 'aacecaaa' (rev 'aaacecaa', no), 'acecaaa' (no), 'cecaaa' (no),
    # 'ecaaa' (no), 'caaa' (no), 'aaa' (yes). Prefix 'aacec' reversed is
    # 'cecaa'. Result 'aacecaaa' + 'cecaa'.

    def test_trailing_run_with_near_palindrome(self):
        self.assertEqual(make_palindrome('aacecaaa'), 'aacecaaacecaa')

    # Extends test_append_reversed_prefix_typical: trailing run of three equal
    # characters. 'abccc' -> longest palindromic suffix 'ccc', prefix 'ab'
    # reversed 'ba'.

    def test_trailing_run_of_three(self):
        self.assertEqual(make_palindrome('abccc'), 'abcccba')

    # Extends test_append_reversed_prefix_typical: no palindromic suffix longer
    # than one char; the whole prefix except the last char is mirrored.
    # 'abcdef' -> append 'edcba'.

    def test_all_distinct_chars(self):
        self.assertEqual(make_palindrome('abcdef'), 'abcdefedcba')

    # Extends test_example_cat: non-ASCII characters are handled per code
    # point. 'añ' -> suffix 'ñ', append 'a'.

    def test_non_ascii(self):
        self.assertEqual(make_palindrome('añ'), 'aña')

    # Extends test_shortest_palindrome_typical: a large input. 'a'*1000 + 'b'
    # has longest palindromic suffix 'b'; prefix 'a'*1000 reversed is itself.

    def test_large_input_single_char_suffix(self):
        s = 'a' * 1000 + 'b'
        self.assertEqual(make_palindrome(s), s + 'a' * 1000)

    # Extends test_longest_palindromic_postfix_typical: a large input.
    # s = 'c' + 'b' + 'a'*999 + 'b'. The whole string is not a palindrome
    # (starts with 'c', ends with 'b'); the suffix 'b' + 'a'*999 + 'b' is, so
    # the prefix is 'c' and 'c' is appended.

    def test_large_input_long_suffix(self):
        s = 'c' + 'b' + 'a' * 999 + 'b'
        self.assertEqual(make_palindrome(s), s + 'c')

    # Extends test_example_cata and test_shortest_palindrome_typical:
    # exhaustive check of every string of length 0..6 over {'a', 'b'}
    # against the brute force defined above.

    def test_exhaustive_small_binary_strings(self):
        import itertools
        for n in range(7):
            for chars in itertools.product('ab', repeat=n):
                s = ''.join(chars)
                self.assertEqual(make_palindrome(s), brute_force(s), s)

    # Extends test_append_reversed_prefix_typical: random strings over a
    # small alphabet (seeded), checked against the brute force above.

    def test_random_strings_match_brute_force(self):
        rng = random.Random(12345)
        for _ in range(300):
            n = rng.randint(0, 30)
            s = ''.join(rng.choice('abc') for _ in range(n))
            self.assertEqual(make_palindrome(s), brute_force(s), s)

    # Properties stated by the docstring: the result is a palindrome and
    # begins with the supplied string, and nothing shorter does (brute force).

    def test_result_properties(self):
        for s in ['hello', 'banana', 'abcba', 'abab', 'xyzzy', 'Madam']:
            result = make_palindrome(s)
            self.assertTrue(result.startswith(s), s)
            self.assertEqual(result, result[::-1], s)
            self.assertEqual(len(result), len(brute_force(s)), s)


if __name__ == '__main__':
    unittest.main()
