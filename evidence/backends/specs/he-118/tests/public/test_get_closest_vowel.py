import unittest

from src.solution import get_closest_vowel


class TestGetClosestVowel(unittest.TestCase):
    def test_example_yogurt(self):
        self.assertEqual(get_closest_vowel("yogurt"), "u")

    def test_example_full_uppercase(self):
        self.assertEqual(get_closest_vowel("FULL"), "U")

    def test_example_quick(self):
        self.assertEqual(get_closest_vowel("quick"), "")

    def test_example_ab(self):
        self.assertEqual(get_closest_vowel("ab"), "")

    def test_single_qualifying_vowel_in_longer_word(self):
        # The only vowel, e, has consonants r and n immediately beside it.
        self.assertEqual(get_closest_vowel("strength"), "e")

    def test_minimum_length_for_a_qualifying_vowel(self):
        # Three letters suffice: a is between c and t.
        self.assertEqual(get_closest_vowel("cat"), "a")

    def test_rightmost_of_distinct_qualifying_vowels(self):
        # Both a (l,n) and e (n,t) qualify; e is farther right.
        self.assertEqual(get_closest_vowel("planet"), "e")

    def test_rightmost_qualifying_vowel_at_penultimate_position(self):
        # Both a (b,s) and i (s,s) qualify; penultimate i is rightmost.
        self.assertEqual(get_closest_vowel("basis"), "i")

    def test_skip_later_vowels_that_do_not_qualify(self):
        # Final o is excluded, i touches o, and a lies between r and d.
        self.assertEqual(get_closest_vowel("radio"), "a")

    def test_initial_vowel_is_excluded(self):
        # The only vowel, a, is the first letter and cannot qualify.
        self.assertEqual(get_closest_vowel("ask"), "")

    def test_final_vowel_is_excluded(self):
        # The only vowel, a, is the last letter and cannot qualify.
        self.assertEqual(get_closest_vowel("spa"), "")

    def test_single_vowel_has_no_neighbors(self):
        # A one-letter vowel is at both endpoints, with no consonant neighbors.
        self.assertEqual(get_closest_vowel("a"), "")

    def test_word_without_vowels(self):
        # Every letter of rhythm is a consonant, including y.
        self.assertEqual(get_closest_vowel("rhythm"), "")

    def test_single_consonant(self):
        # A single consonant supplies no vowel candidate.
        self.assertEqual(get_closest_vowel("b"), "")

    def test_all_vowels(self):
        # There are no consonants to flank any of the five vowels.
        self.assertEqual(get_closest_vowel("aeiou"), "")

    def test_vowel_with_vowel_on_left_is_rejected(self):
        # Initial a is excluded; u has vowel a on its left and consonant n on its right.
        self.assertEqual(get_closest_vowel("aunt"), "")

    def test_vowel_with_vowel_on_right_is_rejected(self):
        # Final o is excluded; u has consonant d on its left and vowel o on its right.
        self.assertEqual(get_closest_vowel("duo"), "")

    def test_uppercase_vowel_preserves_case_among_lowercase_consonants(self):
        # Uppercase A is between consonants b and t, so its case is retained.
        self.assertEqual(get_closest_vowel("bAt"), "A")

    def test_lowercase_vowel_with_uppercase_consonants(self):
        # Uppercase B and T are consonants flanking lowercase a.
        self.assertEqual(get_closest_vowel("BaT"), "a")

    def test_adjacent_mixed_case_vowels_are_rejected(self):
        # A touches vowel e, and e touches vowel A; neither has two consonant neighbors.
        self.assertEqual(get_closest_vowel("bAeT"), "")

    def test_o_between_consonants(self):
        # The only vowel, o, lies between consonants l and c.
        self.assertEqual(get_closest_vowel("clock"), "o")

    def test_i_between_consonants(self):
        # The only vowel, i, lies between consonants m and n.
        self.assertEqual(get_closest_vowel("mint"), "i")
