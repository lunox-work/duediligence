import unittest

from src.solution import get_closest_vowel


# Hand-derived cases avoid the letter "y", whose vowel status the docstring
# does not settle. "quick" shows that "between two consonants" means the
# immediate neighbours on both sides must be consonants.
class TestGetClosestVowel(unittest.TestCase):
    # Docstring examples

    def test_example_yogurt(self):
        self.assertEqual(get_closest_vowel("yogurt"), "u")

    def test_example_full_uppercase(self):
        self.assertEqual(get_closest_vowel("FULL"), "U")

    def test_example_quick(self):
        self.assertEqual(get_closest_vowel("quick"), "")

    def test_example_ab(self):
        self.assertEqual(get_closest_vowel("ab"), "")

    # Rule: the closest qualifying vowel from the right is returned

    def test_rightmost_of_several_candidates(self):
        # b-i-t-e-m-a-r-k: i, e and a each sit between consonants;
        # the one nearest the right end is "a".
        self.assertEqual(get_closest_vowel("bitemark"), "a")

    def test_only_candidate_is_near_left_end(self):
        # b-i-s-t-r: "i" (between b and s) is the only vowel; scanning from
        # the right reaches it last.
        self.assertEqual(get_closest_vowel("bistr"), "i")

    # Rule: vowels at the beginning and the end do not count

    def test_end_vowel_skipped_for_inner_one(self):
        # b-i-t-a-m-o: final "o" does not count; "a" is between t and m.
        self.assertEqual(get_closest_vowel("bitamo"), "a")

    def test_vowels_only_at_both_ends(self):
        # a-b-a: both vowels are at an end, so none counts.
        self.assertEqual(get_closest_vowel("aba"), "")

    # Rule: case sensitive (the vowel is returned in its own case)

    def test_mixed_case_returns_uppercase_vowel(self):
        # b-A-t: "A" is between consonants b and t; returned as "A".
        self.assertEqual(get_closest_vowel("bAt"), "A")

    def test_uppercase_vowel_at_start_does_not_count(self):
        # E-b-b: "E" is at the beginning, so nothing qualifies.
        self.assertEqual(get_closest_vowel("Ebb"), "")

    # Rule: return "" when no vowel meets the condition

    def test_adjacent_vowels_do_not_qualify(self):
        # b-e-a-t: "e" has vowel "a" on its right, "a" has vowel "e" on its
        # left, so neither is between two consonants.
        self.assertEqual(get_closest_vowel("beat"), "")

    def test_shortest_word_with_a_match(self):
        # b-a-d: three letters is the minimum; "a" is between b and d.
        self.assertEqual(get_closest_vowel("bad"), "a")

    def test_single_letter_vowel(self):
        # "a" is both the beginning and the end, so it does not count.
        self.assertEqual(get_closest_vowel("a"), "")

    def test_all_consonants(self):
        # No vowels at all.
        self.assertEqual(get_closest_vowel("bcdfg"), "")


if __name__ == "__main__":
    unittest.main()
