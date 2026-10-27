import unittest

from src.solution import cycpattern_check


class TestCycpatternCheck(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_abcd_abd(self):
        self.assertIs(cycpattern_check("abcd", "abd"), False)

    def test_example_hello_ell(self):
        self.assertIs(cycpattern_check("hello", "ell"), True)

    def test_example_whassup_psus(self):
        self.assertIs(cycpattern_check("whassup", "psus"), False)

    def test_example_abab_baa(self):
        self.assertIs(cycpattern_check("abab", "baa"), True)

    def test_example_efef_eeff(self):
        self.assertIs(cycpattern_check("efef", "eeff"), False)

    def test_example_himenss_simen(self):
        self.assertIs(cycpattern_check("himenss", "simen"), True)

    # Rule: the second word itself (no rotation) being a substring gives True.

    def test_unrotated_word_inside(self):
        # "cde" occurs in "abcdef" at index 2.
        self.assertIs(cycpattern_check("abcdef", "cde"), True)

    def test_unrotated_word_equals_first_word(self):
        # A word is a substring of itself.
        self.assertIs(cycpattern_check("abc", "abc"), True)

    # Rule: a rotation of the second word being a substring gives True.

    def test_rotation_inside(self):
        # Rotations of "abc": "abc", "bca", "cab". "xbcay" contains "bca"
        # (index 1) and none of the others, so only a rotation matches.
        self.assertIs(cycpattern_check("xbcay", "abc"), True)

    def test_last_rotation_at_end_of_first_word(self):
        # Rotations of "abc": "abc", "bca", "cab". "zzcab" ends with "cab",
        # the last rotation; "abc" and "bca" do not occur in it.
        self.assertIs(cycpattern_check("zzcab", "abc"), True)

    def test_single_letter_word(self):
        # The only rotation of "b" is "b" itself, which occurs in "abc".
        self.assertIs(cycpattern_check("abc", "b"), True)

    # Rule: otherwise (no rotation is a substring) the result is False.

    def test_no_rotation_inside(self):
        # Rotations of "xy": "xy", "yx"; neither occurs in "abcd".
        self.assertIs(cycpattern_check("abcd", "xy"), False)

    def test_same_letters_but_not_a_rotation(self):
        # Rotations of "abc": "abc", "bca", "cab". "acb" is a permutation of
        # "abc" but equals none of them, and is only 3 letters long.
        self.assertIs(cycpattern_check("acb", "abc"), False)

    def test_second_word_longer_than_first(self):
        # Every rotation of "abc" has length 3, so none fits in "ab".
        self.assertIs(cycpattern_check("ab", "abc"), False)


if __name__ == "__main__":
    unittest.main()
