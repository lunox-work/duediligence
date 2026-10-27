import unittest

from src.solution import is_palindrome


class TestIsPalindromeHidden(unittest.TestCase):
    # Extends test_example_empty_string: preserves the explicit empty boundary.
    def test_empty_boundary(self):
        # The docstring explicitly gives True for the empty string.
        self.assertEqual(is_palindrome(""), True)

    # Extends test_example_empty_string and test_single_character: next length,
    # with a character other than the public suite's sole one-character input.
    def test_single_other_letter(self):
        # A one-character string equals its reversal.
        self.assertEqual(is_palindrome("q"), True)

    # Extends test_single_character: a non-ASCII character is still one character.
    def test_single_greek_letter(self):
        # Reversal leaves this single Greek letter unchanged.
        self.assertEqual(is_palindrome("λ"), True)

    # Extends test_example_aba: five characters and three distinct letters.
    def test_five_letter_palindrome(self):
        # Mirrored pairs are r/r and a/a, with d at the center.
        self.assertEqual(is_palindrome("radar"), True)

    # Extends test_example_aba: several distinct mirrored pairs around a center.
    def test_nine_letter_palindrome(self):
        # Mirrored pairs are a/a, b/b, c/c, d/d; e is the center.
        self.assertEqual(is_palindrome("abcdedcba"), True)

    # Extends test_example_aba: odd length alone cannot imply a palindrome.
    def test_odd_inner_mismatch(self):
        # Outer a/a and b/b match, but the third pair is x/d.
        self.assertEqual(is_palindrome("abxcdba"), False)

    # Extends test_example_aba: non-ASCII letters with the same mirror rule.
    def test_greek_palindrome(self):
        # The pairs are alpha/alpha and beta/beta, centered on gamma.
        self.assertEqual(is_palindrome("αβγβα"), True)

    # Extends test_example_aba: uppercase and lowercase letters in mirrored pairs.
    def test_mixed_case_symmetric_string(self):
        # The mirrored pairs are A/A and b/b, centered on C.
        self.assertEqual(is_palindrome("AbCbA"), True)

    # Extends test_example_aba: punctuation can also form a symmetric string.
    def test_symmetric_punctuation(self):
        # The mirrored pairs are !/! and ?/?, centered on a period.
        self.assertEqual(is_palindrome("!?.?!"), True)

    # Extends test_example_aba: mirrored whitespace surrounding a word palindrome.
    def test_symmetric_tabs_and_newlines(self):
        # Newlines and tabs mirror each other, as do l/l and e/e around v.
        self.assertEqual(is_palindrome("\n\tlevel\t\n"), True)

    # Extends test_even_length_palindrome: digit characters with five distinct pairs.
    def test_digit_string_palindrome(self):
        # Mirrored pairs are 1/1, 2/2, 3/3, 4/4, and 5/5.
        self.assertEqual(is_palindrome("1234554321"), True)

    # Extends test_example_repeated_character: a different letter and much longer.
    def test_long_uniform_odd_string(self):
        # Every position and its mirror contain z, including the center.
        self.assertEqual(is_palindrome("z" * 1001), True)

    # Extends test_example_repeated_character and test_even_length_palindrome:
    # a uniform even-length input cannot be rejected for lacking a center.
    def test_long_uniform_even_string(self):
        # Every mirrored pair contains m twice.
        self.assertEqual(is_palindrome("m" * 1024), True)

    # Extends test_example_repeated_character: the shortest repeated string.
    def test_two_equal_characters(self):
        # Reversing qq gives qq.
        self.assertEqual(is_palindrome("qq"), True)

    # Extends test_example_repeated_character: repeated runs may surround a center.
    def test_equal_runs_around_distinct_center(self):
        # The 127 copies of b on either side mirror each other; c is central.
        self.assertEqual(is_palindrome("b" * 127 + "c" + "b" * 127), True)

    # Extends test_example_repeated_character: almost uniform is insufficient.
    def test_unequal_runs_around_distinct_character(self):
        # After 127 matching b/b pairs, the remaining middle pair is b/c.
        self.assertEqual(is_palindrome("b" * 128 + "c" + "b" * 127), False)

    # Extends test_example_zbcd: ten distinct characters instead of four.
    def test_longer_distinct_letters(self):
        # The first and last characters, q and p, already disagree.
        self.assertEqual(is_palindrome("qwertyuiop"), False)

    # Extends test_example_zbcd: a familiar palindrome with an appended letter.
    def test_palindrome_with_extra_suffix(self):
        # The first character is r and the last is s.
        self.assertEqual(is_palindrome("racecars"), False)

    # Extends test_example_zbcd: repeating a block does not reverse the block.
    def test_repeated_nonpalindromic_block(self):
        # abcabc begins with a and ends with c.
        self.assertEqual(is_palindrome("abcabc"), False)

    # Extends test_even_length_palindrome: three different mirrored pairs.
    def test_six_letter_even_palindrome(self):
        # Mirrored pairs are a/a, b/b, and c/c.
        self.assertEqual(is_palindrome("abccba"), True)

    # Extends test_even_length_palindrome: distinct pairs and repeated inner d.
    def test_even_word_palindrome(self):
        # Mirrored pairs are r/r, e/e, and d/d.
        self.assertEqual(is_palindrome("redder"), True)

    # Extends test_even_length_palindrome: varied characters over thousands of pairs.
    def test_long_varied_even_palindrome(self):
        # A string followed by its reversal necessarily has equal mirrored pairs.
        half = "abcdefghijklmnop" * 128
        self.assertEqual(is_palindrome(half + half[::-1]), True)

    # Extends test_example_aba: the long odd-length counterpart with a new center.
    def test_long_varied_odd_palindrome(self):
        # The center q mirrors itself, and every half character mirrors its copy.
        half = "abcdefghijklmnop" * 128
        self.assertEqual(is_palindrome(half + "q" + half[::-1]), True)

    # Extends test_two_distinct_characters: different letters and descending order.
    def test_two_letters_descending(self):
        # za reverses to az.
        self.assertEqual(is_palindrome("za"), False)

    # Extends test_two_distinct_characters: two distinct non-ASCII letters.
    def test_two_greek_letters(self):
        # Alpha and beta are different; reversal swaps them.
        self.assertEqual(is_palindrome("αβ"), False)

    # Extends test_matching_endpoints_with_inner_mismatch: four matching outer pairs.
    def test_deep_even_middle_mismatch(self):
        # Removing matching a/a, b/b, c/c, d/d leaves the unequal pair x/y.
        self.assertEqual(is_palindrome("abcdxydcba"), False)

    # Extends test_matching_endpoints_with_inner_mismatch: an odd-length mismatch.
    def test_deep_odd_inner_mismatch(self):
        # Outer a/a, b/b, c/c match; d/f disagree around the central e.
        self.assertEqual(is_palindrome("abcdefcba"), False)

    # Extends test_matching_endpoints_with_inner_mismatch: one bad pair among many.
    def test_long_sparse_middle_mismatch(self):
        # The 2048 outer a/a pairs match, but the middle pair b/c disagrees.
        self.assertEqual(is_palindrome("a" * 2048 + "bc" + "a" * 2048), False)

    # Extends test_matching_endpoints_with_inner_mismatch: balanced counts are
    # insufficient, even when both endpoints and the middle pair match.
    def test_balanced_counts_wrong_order(self):
        # In accbbbba, endpoints a/a match, but the next pair is c/b.
        # Each letter occurs an even number of times (a:2, b:4, c:2).
        self.assertEqual(is_palindrome("accbbbba"), False)
