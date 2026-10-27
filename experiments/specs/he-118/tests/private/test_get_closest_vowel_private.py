import random
import unittest

from src.solution import get_closest_vowel


# Vowels are a, e, i, o, u in either case. Like the public suite, these cases
# avoid "y"/"Y", whose vowel status the docstring does not settle. "Between two
# consonants" means both immediate neighbours are consonants (see "quick").
VOWELS = "aeiouAEIOU"


def reference(word):
    # Obviously-correct scan: walk inner positions from the right and return
    # the first vowel whose immediate neighbours are both non-vowels (every
    # letter used here other than a vowel is a consonant, since y is excluded).
    for i in range(len(word) - 2, 0, -1):
        if (word[i] in VOWELS and word[i - 1] not in VOWELS
                and word[i + 1] not in VOWELS):
            return word[i]
    return ""


class TestGetClosestVowelPrivate(unittest.TestCase):
    # Empty / tiny inputs

    def test_empty_word(self):
        # No letters, so no vowel can qualify.
        self.assertEqual(get_closest_vowel(""), "")

    def test_single_consonant(self):
        self.assertEqual(get_closest_vowel("b"), "")

    def test_single_uppercase_vowel(self):
        # "E" is both first and last letter.
        self.assertEqual(get_closest_vowel("E"), "")

    # Extends test_example_ab: other two-letter words never have an inner letter.
    def test_two_letters_consonant_then_vowel(self):
        self.assertEqual(get_closest_vowel("ba"), "")

    # Extends test_example_ab.
    def test_two_vowels(self):
        self.assertEqual(get_closest_vowel("Oa"), "")

    # Every vowel, both cases, in the minimal qualifying shape

    # Extends test_shortest_word_with_a_match: each of the ten vowels.
    def test_each_lowercase_vowel_between_consonants(self):
        for v in "aeiou":
            with self.subTest(v=v):
                self.assertEqual(get_closest_vowel("z" + v + "x"), v)

    # Extends test_mixed_case_returns_uppercase_vowel: each uppercase vowel.
    def test_each_uppercase_vowel_between_consonants(self):
        for v in "AEIOU":
            with self.subTest(v=v):
                self.assertEqual(get_closest_vowel("Z" + v + "X"), v)

    # Extends test_example_full_uppercase: a lowercase vowel among uppercase
    # consonants is returned lowercase (catches always-upper/lower output).
    def test_lowercase_vowel_among_uppercase_consonants(self):
        self.assertEqual(get_closest_vowel("BaT"), "a")

    # Extends test_mixed_case_returns_uppercase_vowel: rightmost of two
    # uppercase candidates. b-E-t-I-k: E (b,t) and I (t,k); rightmost is "I".
    def test_rightmost_uppercase_candidate(self):
        self.assertEqual(get_closest_vowel("bEtIk"), "I")

    # Closest from the right

    # Extends test_rightmost_of_several_candidates: distinct vowels so a
    # left-to-right scan is caught. b-o-t-a-n-i-c: o, a, i all qualify; "i".
    def test_rightmost_with_distinct_vowels(self):
        self.assertEqual(get_closest_vowel("botanic"), "i")

    # Extends test_rightmost_of_several_candidates: repeated identical vowels.
    def test_repeated_same_vowel(self):
        # b-a-b-a-b-a-b: every "a" qualifies; answer is "a".
        self.assertEqual(get_closest_vowel("bababab"), "a")

    # Extends test_only_candidate_is_near_left_end: only qualifying vowel is at
    # index 1 of a longer word with non-qualifying vowels to its right.
    def test_only_candidate_at_index_one_with_vowel_cluster_right(self):
        # s-o-t-e-a-k: a (left e) and e (right a) fail; o is between s and t.
        self.assertEqual(get_closest_vowel("sotEak"), "o")

    # Neighbour checks (both sides required)

    # Extends test_adjacent_vowels_do_not_qualify: a shortcut checking only
    # one side picks the wrong vowel. b-i-t-o-a-t: a has vowel o on its left;
    # o has vowel a on its right; i is between b and t -> "i".
    # Right-only check would give "a"; left-only check would give "o".
    def test_one_sided_neighbour_check_fails(self):
        self.assertEqual(get_closest_vowel("bitoat"), "i")

    # Extends test_example_quick: last inner vowel exists but sits next to
    # another vowel. b-o-u-n-c-e: e is the end; u has o on its left; o has u
    # on its right -> nothing qualifies.
    def test_inner_vowels_all_adjacent_to_vowels(self):
        self.assertEqual(get_closest_vowel("bounce"), "")

    # Extends test_adjacent_vowels_do_not_qualify: longer vowel run.
    def test_triple_vowel_run(self):
        # q-u-e-u-e-d: every vowel is next to another vowel.
        self.assertEqual(get_closest_vowel("queued"), "")

    # Extends test_adjacent_vowels_do_not_qualify: after the vowel pair, an
    # earlier qualifying vowel is still found. r-a-d-i-o-s: o (left i), i
    # (right o) fail; a is between r and d.
    def test_skips_vowel_pair_then_finds_earlier(self):
        self.assertEqual(get_closest_vowel("radios"), "a")

    # Beginning and end vowels

    # Extends test_vowels_only_at_both_ends: first letter vowel whose
    # wrap-around neighbour (last letter) and right neighbour are consonants.
    # a-b-t: an implementation reading word[i-1] at i=0 would wrongly return
    # "a".
    def test_start_vowel_not_counted_despite_wraparound(self):
        self.assertEqual(get_closest_vowel("abt"), "")

    # Extends test_uppercase_vowel_at_start_does_not_count.
    def test_uppercase_start_vowel_with_distinct_consonants(self):
        self.assertEqual(get_closest_vowel("Ust"), "")

    # Extends test_end_vowel_skipped_for_inner_one: uppercase end vowel.
    # b-O-k-E: E is the end; O is between b and k.
    def test_uppercase_end_vowel_skipped(self):
        self.assertEqual(get_closest_vowel("bOkE"), "O")

    # Extends test_end_vowel_skipped_for_inner_one: end vowel preceded by a
    # consonant, with no other candidate. c-l-o-u-d-e: e end; u (left o),
    # o (right u) fail.
    def test_end_vowel_only_after_consonant(self):
        self.assertEqual(get_closest_vowel("cloude"), "")

    def test_vowel_at_end_after_consonants(self):
        # s-t-r-a: "a" is the last letter.
        self.assertEqual(get_closest_vowel("stra"), "")

    def test_vowels_at_both_ends_and_inner_candidate(self):
        # a-b-o-d-e: a and e are ends; o is between b and d.
        self.assertEqual(get_closest_vowel("abode"), "o")

    # Extends test_all_consonants: uppercase and longer.
    def test_all_uppercase_consonants(self):
        self.assertEqual(get_closest_vowel("STRNGTHS"), "")

    # Larger inputs

    # Extends test_only_candidate_is_near_left_end at a larger size.
    def test_long_word_single_candidate_in_middle(self):
        word = "b" * 1000 + "o" + "c" * 1000
        self.assertEqual(get_closest_vowel(word), "o")

    def test_long_word_candidate_near_left_end(self):
        # m-E then 2000 consonants: "E" is between m and the first k.
        word = "mE" + "k" * 2000
        self.assertEqual(get_closest_vowel(word), "E")

    def test_long_word_of_vowel_pairs(self):
        # "baab" repeated: every vowel is next to another vowel -> "".
        self.assertEqual(get_closest_vowel("baab" * 300), "")

    def test_long_word_rightmost_differs_from_others(self):
        # Many "bad" blocks, then "bix": the last candidate is "i".
        word = "bad" * 500 + "bix"
        self.assertEqual(get_closest_vowel(word), "i")

    # Randomised check against the reference scan above (fixed seed, no y/Y).
    def test_random_words_against_reference(self):
        rng = random.Random(118)
        letters = "abcdefghijklmnopqrstuvwxzABCDEFGHIJKLMNOPQRSTUVWXZ"
        for _ in range(500):
            word = "".join(rng.choice(letters)
                           for _ in range(rng.randint(0, 12)))
            with self.subTest(word=word):
                self.assertEqual(get_closest_vowel(word), reference(word))


if __name__ == "__main__":
    unittest.main()
