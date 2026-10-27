import random
import unittest

from src.solution import cycpattern_check


def _brute(a, b):
    # Obviously correct reference: build every rotation b[i:] + b[:i] and
    # ask whether any of them is a substring of a.
    return any(b[i:] + b[:i] in a for i in range(len(b)))


class TestCycpatternCheckPrivate(unittest.TestCase):
    # Extends test_example_abcd_abd: the letters of b appear in order in a
    # (a subsequence) but no rotation is contiguous. Rotations of "abc":
    # "abc", "bca", "cab"; windows of "axbxc" are "axb", "xbx", "bxc".
    def test_subsequence_is_not_substring(self):
        self.assertIs(cycpattern_check("axbxc", "abc"), False)

    # Extends test_example_hello_ell: match at the very start of a.
    def test_unrotated_match_at_start(self):
        # "hel" is a[0:3] of "hello".
        self.assertIs(cycpattern_check("hello", "hel"), True)

    # Extends test_example_hello_ell: a rotation (not b itself) at the start.
    def test_rotation_match_at_start(self):
        # Rotations of "lhe": "lhe", "hel", "elh". "hello" contains only
        # "hel", at a[0:3].
        self.assertIs(cycpattern_check("hello", "lhe"), True)

    # Extends test_example_whassup_psus: b with duplicate letters, all of
    # whose letters occur in a, but no rotation does. Rotations of "ssa":
    # "ssa", "sas", "ass"; "whassup" contains "ass" (index 2) -> True.
    def test_duplicate_letters_rotation_present(self):
        self.assertIs(cycpattern_check("whassup", "ssa"), True)

    # Extends test_example_whassup_psus: rotations of "sups": "sups",
    # "upss", "pssu", "ssup". "whassup" contains "ssup" (index 3) -> True.
    def test_whassup_other_rotation_present(self):
        self.assertIs(cycpattern_check("whassup", "sups"), True)

    # Extends test_example_abab_baa: rotation needing more than one shift.
    # Rotations of "abcde": "abcde", "bcdea", "cdeab", "deabc", "eabcd".
    # "xxcdeabyy" contains only "cdeab" (shift by 2).
    def test_rotation_by_two_of_five(self):
        self.assertIs(cycpattern_check("xxcdeabyy", "abcde"), True)

    # Extends test_example_abab_baa: shift by 3 of 5.
    # "qdeabcq" contains only "deabc".
    def test_rotation_by_three_of_five(self):
        self.assertIs(cycpattern_check("qdeabcq", "abcde"), True)

    # Extends test_example_efef_eeff: an anagram window that is not a
    # rotation, inside a longer a. Windows of "xacby": "xac", "acb", "cby";
    # rotations of "abc": "abc", "bca", "cab" -- none match.
    def test_anagram_window_is_not_rotation(self):
        self.assertIs(cycpattern_check("xacby", "abc"), False)

    # Extends test_example_efef_eeff: the reversal of b is in a but no
    # rotation is. Windows of "xcbax": "xcb", "cba", "bax".
    def test_reversal_is_not_rotation(self):
        self.assertIs(cycpattern_check("xcbax", "abc"), False)

    # Extends test_example_efef_eeff: same letter counts, alternating vs
    # grouped. Rotations of "aabb": "aabb", "abba", "bbaa", "baab"; "abab"
    # repeated contains only "abab" and "baba" windows of length 4.
    def test_long_alternating_has_no_grouped_rotation(self):
        self.assertIs(cycpattern_check("ab" * 500, "aabb"), False)

    # Extends test_example_himenss_simen: the rotation equals the whole of a.
    # "cab" is a rotation of "abc".
    def test_rotation_equals_whole_first_word(self):
        self.assertIs(cycpattern_check("cab", "abc"), True)

    # Extends test_unrotated_word_inside: larger sizes, match deep inside.
    def test_long_first_word_unrotated_match(self):
        a = "x" * 1000 + "abcdefghij" + "y" * 1000
        self.assertIs(cycpattern_check(a, "abcdefghij"), True)

    # Extends test_unrotated_word_equals_first_word: single-letter words.
    def test_single_letter_equal(self):
        self.assertIs(cycpattern_check("a", "a"), True)

    # Extends test_unrotated_word_equals_first_word: equal length, different.
    def test_single_letter_different(self):
        self.assertIs(cycpattern_check("a", "b"), False)

    # Extends test_rotation_inside: a must contain the rotation contiguously,
    # not cyclically. Rotations of "abc": "abc", "bca", "cab"; windows of
    # "bcxa" are "bcx", "cxa". (Treating a as cyclic would find "abc".)
    def test_first_word_is_not_cyclic(self):
        self.assertIs(cycpattern_check("bcxa", "abc"), False)

    # Extends test_rotation_inside: b's letters split by an extra letter.
    # Windows of "abxc" are "abx", "bxc"; none is "abc", "bca" or "cab".
    def test_split_rotation_not_found(self):
        self.assertIs(cycpattern_check("abxc", "abc"), False)

    # Extends test_last_rotation_at_end_of_first_word: long b, last rotation
    # (shift by len(b)-1) at the end of a long a.
    def test_long_last_rotation_at_end(self):
        b = "abcdefghijklmnopqrst"
        last = b[-1] + b[:-1]  # "tabcdefghijklmnopqrs", shift by 19
        a = "z" * 500 + last
        self.assertIs(cycpattern_check(a, b), True)

    # Extends test_last_rotation_at_end_of_first_word: long b with a single
    # odd letter; a contains it with the odd letter first, a shift by 30.
    def test_repeated_letters_rotation(self):
        b = "a" * 30 + "b"
        self.assertIs(cycpattern_check("b" + "a" * 30, b), True)

    # Extends test_single_letter_word: single letter absent from a.
    def test_single_letter_word_absent(self):
        self.assertIs(cycpattern_check("abc", "d"), False)

    # Extends test_single_letter_word: single letter at the ends of a.
    def test_single_letter_word_at_ends(self):
        self.assertIs(cycpattern_check("abc", "a"), True)
        self.assertIs(cycpattern_check("abc", "c"), True)

    # Extends test_no_rotation_inside: b's letters all appear in a, but
    # never adjacent. Rotations "xy", "yx"; windows of "xayb" are "xa",
    # "ay", "yb".
    def test_letters_present_but_never_adjacent(self):
        self.assertIs(cycpattern_check("xayb", "xy"), False)

    # Extends test_no_rotation_inside: b with all-equal letters.
    def test_all_same_letters(self):
        self.assertIs(cycpattern_check("aaaa", "aa"), True)
        self.assertIs(cycpattern_check("aabaa", "aaa"), False)

    # Extends test_same_letters_but_not_a_rotation: b has duplicates so it
    # has fewer distinct rotations. Rotations of "abab": "abab", "baba".
    def test_periodic_second_word(self):
        self.assertIs(cycpattern_check("xbabay", "abab"), True)
        self.assertIs(cycpattern_check("xabbay", "abab"), False)

    # Extends test_second_word_longer_than_first: b only one letter longer,
    # and a is a substring of b.
    def test_second_word_one_longer(self):
        self.assertIs(cycpattern_check("aaa", "aaaa"), False)
        self.assertIs(cycpattern_check("bca", "abca"), False)

    # Extends every public test: many random small cases over a two-letter
    # alphabet (lots of duplicates and near misses), checked against _brute.
    def test_random_against_brute_force(self):
        rng = random.Random(154)
        for _ in range(1500):
            a = "".join(rng.choice("ab") for _ in range(rng.randint(1, 9)))
            b = "".join(rng.choice("ab") for _ in range(rng.randint(1, 6)))
            with self.subTest(a=a, b=b):
                self.assertIs(cycpattern_check(a, b), _brute(a, b))

    # Same, three-letter alphabet and longer words.
    def test_random_three_letters_against_brute_force(self):
        rng = random.Random(4154)
        for _ in range(800):
            a = "".join(rng.choice("abc") for _ in range(rng.randint(1, 14)))
            b = "".join(rng.choice("abc") for _ in range(rng.randint(1, 5)))
            with self.subTest(a=a, b=b):
                self.assertIs(cycpattern_check(a, b), _brute(a, b))


if __name__ == "__main__":
    unittest.main()
