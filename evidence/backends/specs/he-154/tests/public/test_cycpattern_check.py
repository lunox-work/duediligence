import unittest

from src.solution import cycpattern_check


class TestCycpatternCheck(unittest.TestCase):
    def test_example_abcd_abd(self):
        self.assertEqual(cycpattern_check("abcd", "abd"), False)

    def test_example_hello_ell(self):
        self.assertEqual(cycpattern_check("hello", "ell"), True)

    def test_example_whassup_psus(self):
        self.assertEqual(cycpattern_check("whassup", "psus"), False)

    def test_example_abab_baa(self):
        self.assertEqual(cycpattern_check("abab", "baa"), True)

    def test_example_efef_eeff(self):
        self.assertEqual(cycpattern_check("efef", "eeff"), False)

    def test_example_himenss_simen(self):
        self.assertEqual(cycpattern_check("himenss", "simen"), True)

    def test_unrotated_match_at_start(self):
        # "abc" is the first three consecutive letters of "abcdef".
        self.assertEqual(cycpattern_check("abcdef", "abc"), True)

    def test_unrotated_match_at_end(self):
        # "def" is the last three consecutive letters of "abcdef".
        self.assertEqual(cycpattern_check("abcdef", "def"), True)

    def test_unrotated_match_is_entire_word(self):
        # A word is a substring of itself, with no rotation needed.
        self.assertEqual(cycpattern_check("abcde", "abcde"), True)

    def test_single_letter_match(self):
        # The two one-letter words are identical.
        self.assertEqual(cycpattern_check("a", "a"), True)

    def test_rotation_by_multiple_positions_matches_inside(self):
        # Moving "ab" from the front of "abcde" to the end gives
        # "cdeab", which occurs between the "xx" and "yy".
        self.assertEqual(cycpattern_check("xxcdeabyy", "abcde"), True)

    def test_rotated_match_is_entire_word(self):
        # Moving the last letter of "abc" to the front gives "cab".
        self.assertEqual(cycpattern_check("cab", "abc"), True)

    def test_rotation_by_length_minus_one_matches(self):
        # Moving the first three letters of "abcd" to the end gives
        # "dabc", the middle four letters of the first word.
        self.assertEqual(cycpattern_check("zzdabczz", "abcd"), True)

    def test_rotation_with_repeated_letters(self):
        # Moving the first three letters of "aabb" to the end gives
        # "baab", which appears between the "xx" and "yy".
        self.assertEqual(cycpattern_check("xxbaabyy", "aabb"), True)

    def test_single_letter_absent(self):
        # A one-letter word has only itself as a rotation; "b" != "a".
        self.assertEqual(cycpattern_check("a", "b"), False)

    def test_second_word_one_letter_longer(self):
        # Every rotation of "aba" has length three, so none fits in "ab".
        self.assertEqual(cycpattern_check("ab", "aba"), False)

    def test_subsequence_without_contiguous_match(self):
        # The length-three substrings are "axb", "xbx", and "bxc";
        # none is one of the rotations "abc", "bca", or "cab".
        self.assertEqual(cycpattern_check("axbxc", "abc"), False)

    def test_first_word_does_not_wrap_around(self):
        # The length-two substrings of "abcd" are "ab", "bc", and "cd";
        # neither rotation of "da" ("da" or "ad") is among them.
        self.assertEqual(cycpattern_check("abcd", "da"), False)
