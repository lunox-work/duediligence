import random
import unittest

from src.solution import is_palindrome


def _reference(text):
    # Brute force: a string is a palindrome when every character equals the
    # character at the mirrored position.
    n = len(text)
    for i in range(n):
        if text[i] != text[n - 1 - i]:
            return False
    return True


class TestIsPalindromePrivate(unittest.TestCase):
    # Extends test_example_empty_string: the result is the bool True itself,
    # as the doctest output 'True' shows, not merely something truthy.
    def test_empty_returns_bool_true(self):
        result = is_palindrome('')
        self.assertIsInstance(result, bool)
        self.assertIs(result, True)

    # Extends test_example_zbcd: the result is the bool False itself.
    def test_non_palindrome_returns_bool_false(self):
        result = is_palindrome('zbcd')
        self.assertIsInstance(result, bool)
        self.assertIs(result, False)

    # Extends test_example_aba: other odd-length palindromes with a distinct
    # middle character.
    def test_odd_length_palindrome_racecar(self):
        self.assertIs(is_palindrome('racecar'), True)

    def test_odd_length_palindrome_three_distinct_chars(self):
        self.assertIs(is_palindrome('xyzyx'), True)

    # Extends test_example_aba: a shortcut checking only the first and last
    # characters says True for 'abxba'-like strings with an inner mismatch.
    def test_inner_mismatch_with_matching_ends_odd(self):
        # 'abcda' reversed is 'adcba'; position 1 'b' vs 'd' differ.
        self.assertIs(is_palindrome('abcda'), False)

    def test_inner_mismatch_with_matching_ends_even(self):
        # 'abxyba' reversed is 'abyxba'; positions 2/3 differ.
        self.assertIs(is_palindrome('abxyba'), False)

    # Extends test_example_aaaaa: all-equal strings of other lengths, even and
    # odd, and other characters.
    def test_all_same_character_even_length(self):
        self.assertIs(is_palindrome('bbbbbb'), True)

    def test_all_same_character_two(self):
        self.assertIs(is_palindrome('zz'), True)

    # Extends test_example_aaaaa: one deviating character breaks it unless it
    # sits in the middle.
    def test_all_same_except_one_off_center(self):
        # 'aaaba' reversed is 'abaaa'; differs.
        self.assertIs(is_palindrome('aaaba'), False)

    def test_all_same_except_center(self):
        # 'aabaa' reversed is 'aabaa'.
        self.assertIs(is_palindrome('aabaa'), True)

    # Extends test_example_zbcd: a shortcut that compares character multisets
    # or sorted strings would accept these anagram-of-palindrome strings.
    def test_anagram_of_palindrome_is_not_palindrome(self):
        # 'aabb' reversed is 'bbaa'.
        self.assertIs(is_palindrome('aabb'), False)

    def test_repeated_halves_not_reversed(self):
        # 'abab': first half equals second half, but reversed is 'baba'.
        self.assertIs(is_palindrome('abab'), False)

    def test_repeated_halves_odd(self):
        # 'abcab' reversed is 'bacba'.
        self.assertIs(is_palindrome('abcab'), False)

    # Extends test_even_length_palindrome: longer even palindromes.
    def test_even_length_palindrome_longer(self):
        self.assertIs(is_palindrome('abccba'), True)

    # Extends test_even_length_palindrome: a mismatch exactly at the two
    # middle characters, which an off-by-one loop bound might skip.
    def test_even_mismatch_at_center_pair(self):
        # 'abcdba': reversed 'abdcba'; middle pair 'c','d' differ.
        self.assertIs(is_palindrome('abcdba'), False)

    def test_even_mismatch_at_center_pair_short(self):
        # 'abca' reversed 'acba'; 'b' vs 'c' differ.
        self.assertIs(is_palindrome('abca'), False)

    # Extends test_single_character_is_palindrome: other single characters,
    # including a digit and a non-ASCII character.
    def test_single_digit(self):
        self.assertIs(is_palindrome('7'), True)

    def test_single_non_ascii(self):
        self.assertIs(is_palindrome('é'), True)

    # Extends test_two_different_characters_not_palindrome: other orders and
    # characters.
    def test_two_different_characters_reverse_order(self):
        self.assertIs(is_palindrome('ba'), False)

    def test_two_different_digits(self):
        self.assertIs(is_palindrome('12'), False)

    # Extends test_mismatch_only_at_outer_ends: longer string, mismatch only
    # at the outer pair; a shortcut that skips index 0 would accept it.
    def test_mismatch_only_at_outer_ends_long(self):
        # inner 'bcdedcb' is a palindrome; outer 'x'...'y' differ.
        self.assertIs(is_palindrome('xbcdedcby'), False)

    def test_mismatch_only_at_last_character_even(self):
        # 'abbz' reversed 'zbba'.
        self.assertIs(is_palindrome('abbz'), False)

    # Strings may contain any characters: digits and non-ASCII palindromes.
    def test_digit_palindrome(self):
        self.assertIs(is_palindrome('12321'), True)

    def test_non_ascii_palindrome(self):
        # Three code points: U+65E5, U+672C, U+65E5; reads the same reversed.
        self.assertIs(is_palindrome('日本日'), True)

    def test_non_ascii_non_palindrome(self):
        self.assertIs(is_palindrome('日本'), False)

    # Larger sizes: a long palindrome and the same with a single change.
    def test_long_palindrome(self):
        half = ''.join(chr(ord('a') + (i * 7) % 26) for i in range(50000))
        text = half + 'q' + half[::-1]
        self.assertIs(is_palindrome(text), True)

    def test_long_near_palindrome_center_change(self):
        half = ''.join(chr(ord('a') + (i * 7) % 26) for i in range(50000))
        # Even-length string whose two middle characters differ.
        text = half + 'pq' + half[::-1]
        self.assertIs(is_palindrome(text), False)

    def test_long_near_palindrome_deep_change(self):
        half = ''.join(chr(ord('a') + (i * 7) % 26) for i in range(50000))
        text = list(half + half[::-1])
        # Change one character at index 12345 so it no longer matches its
        # mirror at index len-1-12345.
        text[12345] = 'A'
        self.assertIs(is_palindrome(''.join(text)), False)

    # Random strings over a small alphabet, checked against the brute force.
    def test_random_against_reference(self):
        rng = random.Random(48)
        for _ in range(500):
            n = rng.randint(0, 12)
            text = ''.join(rng.choice('ab') for _ in range(n))
            self.assertIs(is_palindrome(text), _reference(text), text)

    # Random palindromes built by mirroring, and their one-change variants.
    def test_random_constructed_palindromes(self):
        rng = random.Random(4848)
        for _ in range(300):
            half = ''.join(rng.choice('abc') for _ in range(rng.randint(0, 10)))
            middle = rng.choice(['', 'a', 'b', 'c'])
            text = half + middle + half[::-1]
            self.assertIs(is_palindrome(text), True, text)
            if half:
                i = rng.randrange(len(half))
                broken = list(text)
                broken[i] = 'z'
                broken = ''.join(broken)
                # Index i now holds 'z', its mirror still holds a letter
                # from 'abc', so the string is not a palindrome.
                self.assertIs(is_palindrome(broken), False, broken)


if __name__ == '__main__':
    unittest.main()
