import unittest

from src.solution import get_closest_vowel


class TestGetClosestVowelPrivate(unittest.TestCase):
    # Extends test_example_yogurt: choosing u or the first vowel is insufficient.
    def test_two_candidates_with_different_vowels(self):
        # a has y/g neighbors; e has g/r neighbors and is farther right.
        self.assertEqual(get_closest_vowel("yagert"), "e")

    # Extends test_example_full_uppercase: a different uppercase word and length.
    def test_uppercase_u_in_longer_word(self):
        # U is between R and S.
        self.assertEqual(get_closest_vowel("TRUST"), "U")

    # Extends test_example_quick: a larger, mixed-case vowel cluster.
    def test_three_adjacent_vowels(self):
        # Each of u, E, A touches another vowel.
        self.assertEqual(get_closest_vowel("squEAlch"), "")

    # Extends test_example_ab: another vowel and uppercase endpoint.
    def test_two_letters_starting_with_uppercase_vowel(self):
        # E is initial and therefore excluded.
        self.assertEqual(get_closest_vowel("Ez"), "")

    # Extends test_single_qualifying_vowel_in_longer_word: preserve uppercase E.
    def test_uppercase_e_inside_consonant_clusters(self):
        # E is the only vowel, between r and n.
        self.assertEqual(get_closest_vowel("strEngths"), "E")

    # Extends test_minimum_length_for_a_qualifying_vowel: repeated consonants.
    def test_three_letters_with_identical_consonants(self):
        # U has a z on both sides; the consonants need not be distinct.
        self.assertEqual(get_closest_vowel("zUz"), "U")

    # Extends test_rightmost_of_distinct_qualifying_vowels: four candidates.
    def test_four_distinct_candidates(self):
        # a, E, i, o all qualify; o is last, between f and g.
        self.assertEqual(get_closest_vowel("bacEdifog"), "o")

    # Extends test_rightmost_qualifying_vowel_at_penultimate_position.
    def test_penultimate_uppercase_candidate_after_uppercase_o(self):
        # O has t/p neighbors and I has p/r neighbors; I is rightmost.
        self.assertEqual(get_closest_vowel("tOpIr"), "I")

    # Extends test_skip_later_vowels_that_do_not_qualify: internal trailing run.
    def test_skip_three_later_internal_vowels(self):
        # A is between b/t; each of e, I, O touches another vowel.
        self.assertEqual(get_closest_vowel("bAteIOr"), "A")

    # Extends test_initial_vowel_is_excluded: uppercase U and a longer tail.
    def test_initial_uppercase_u_with_consonant_tail(self):
        # The only vowel U has no left neighbor.
        self.assertEqual(get_closest_vowel("Ustr"), "")

    # Extends test_final_vowel_is_excluded: uppercase E and a longer prefix.
    def test_final_uppercase_e_with_consonant_prefix(self):
        # The only vowel E has no right neighbor.
        self.assertEqual(get_closest_vowel("strE"), "")

    # Extends test_single_vowel_has_no_neighbors: uppercase and another vowel.
    def test_single_uppercase_o(self):
        # A one-letter string has no interior positions.
        self.assertEqual(get_closest_vowel("O"), "")

    # Extends test_word_without_vowels: mixed case, repeated y, and w.
    def test_mixed_case_consonants_only(self):
        # None of these letters is a, e, i, o, or u in either case.
        self.assertEqual(get_closest_vowel("YwRhYtHm"), "")

    # Extends test_single_consonant: uppercase consonant at the alphabet's end.
    def test_single_uppercase_z(self):
        # There is no interior position or vowel.
        self.assertEqual(get_closest_vowel("Z"), "")

    # Extends test_all_vowels: repeated vowels, reverse order, and both cases.
    def test_long_mixed_case_vowels_only(self):
        # Every interior letter has vowel neighbors.
        self.assertEqual(get_closest_vowel("UOIEAaeiouAEIOU"), "")

    # Extends test_vowel_with_vowel_on_left_is_rejected: mixed-case neighbors.
    def test_uppercase_candidate_with_lowercase_vowel_on_left(self):
        # a is initial; E has vowel a on its left despite consonant n on right.
        self.assertEqual(get_closest_vowel("aEnD"), "")

    # Extends test_vowel_with_vowel_on_right_is_rejected: uppercase neighbors.
    def test_uppercase_candidate_with_uppercase_vowel_on_right(self):
        # I has vowel O on its right; O is final.
        self.assertEqual(get_closest_vowel("PrIO"), "")

    # Extends test_uppercase_vowel_preserves_case_among_lowercase_consonants.
    def test_uppercase_e_with_repeated_lowercase_consonants(self):
        # E lies between z and k and must retain its case.
        self.assertEqual(get_closest_vowel("zzEkk"), "E")

    # Extends test_lowercase_vowel_with_uppercase_consonants: lowercase u.
    def test_lowercase_u_in_uppercase_consonant_clusters(self):
        # u lies between R and S and must remain lowercase.
        self.assertEqual(get_closest_vowel("TRuST"), "u")

    # Extends test_adjacent_mixed_case_vowels_are_rejected: different vowels.
    def test_adjacent_uppercase_e_and_lowercase_a(self):
        # E touches a, and a touches E, so neither qualifies.
        self.assertEqual(get_closest_vowel("sEaR"), "")

    # Extends test_o_between_consonants: candidate farther from the left edge.
    def test_lowercase_o_after_consonant_cluster(self):
        # o is between r and b.
        self.assertEqual(get_closest_vowel("throb"), "o")

    # Extends test_i_between_consonants: longer consonant prefix and suffix.
    def test_lowercase_i_with_multiple_consonants_on_each_side(self):
        # i is the only vowel, between h and n.
        self.assertEqual(get_closest_vowel("sphinx"), "i")

    def test_empty_string(self):
        # With no letters there can be no vowel between consonants.
        self.assertEqual(get_closest_vowel(""), "")

    def test_two_consonants(self):
        # No vowel or interior position exists.
        self.assertEqual(get_closest_vowel("zY"), "")

    def test_two_vowels(self):
        # Both letters are endpoints.
        self.assertEqual(get_closest_vowel("aU"), "")

    def test_two_letters_ending_in_vowel(self):
        # u is final and has no right neighbor.
        self.assertEqual(get_closest_vowel("Zu"), "")

    def test_y_as_left_consonant(self):
        # E has consonants y and p as its immediate neighbors.
        self.assertEqual(get_closest_vowel("yEp"), "E")

    def test_y_as_right_consonant(self):
        # o has consonants p and y as its immediate neighbors.
        self.assertEqual(get_closest_vowel("poy"), "o")

    def test_uppercase_y_on_both_sides(self):
        # Both uppercase Ys are consonants surrounding A.
        self.assertEqual(get_closest_vowel("YAY"), "A")

    def test_repeated_vowel_choose_lowercase_on_right(self):
        # Both As qualify, but the rightmost occurrence is lowercase a.
        self.assertEqual(get_closest_vowel("bAbab"), "a")

    def test_repeated_vowel_choose_uppercase_on_right(self):
        # Both As qualify, but the rightmost occurrence is uppercase A.
        self.assertEqual(get_closest_vowel("babAb"), "A")

    def test_eligible_vowel_after_ineligible_cluster(self):
        # a/e touch each other; later o is between c and d.
        self.assertEqual(get_closest_vowel("baecod"), "o")

    def test_eligible_vowel_before_ineligible_cluster(self):
        # E has b/c neighbors; a/U touch each other and cannot replace E.
        self.assertEqual(get_closest_vowel("bEctaUr"), "E")

    def test_both_endpoints_are_vowels(self):
        # A and o are excluded endpoints; s, t, r are consonants.
        self.assertEqual(get_closest_vowel("Astro"), "")

    def test_choose_candidate_before_long_consonant_suffix(self):
        # A and I qualify; I is farther right despite its long consonant suffix.
        self.assertEqual(get_closest_vowel("bAcIdfghjklmnpqrstvwxz"), "I")

    def test_long_word_with_only_one_qualifying_vowel(self):
        # Every repeated prefix/suffix letter is a consonant; A has c/t neighbors.
        word = "br" * 1000 + "cAt" + "str" * 1000
        self.assertEqual(get_closest_vowel(word), "A")

    def test_many_repeated_candidates_then_different_vowel(self):
        # Every a is between bs; the final E also has b/b neighbors and is last.
        word = "ba" * 1000 + "bEb"
        self.assertEqual(get_closest_vowel(word), "E")

    def test_uppercase_i_between_consonants(self):
        # I is the sole vowel and has S/X neighbors.
        self.assertEqual(get_closest_vowel("SIX"), "I")

    def test_uppercase_o_between_consonants(self):
        # O is the sole vowel and has W/R neighbors.
        self.assertEqual(get_closest_vowel("WORN"), "O")

    def test_repeated_adjacent_vowels_do_not_qualify(self):
        # Even the outermost as in the run touch another a.
        self.assertEqual(get_closest_vowel("baaaab"), "")

    def test_distant_consonants_do_not_count_as_neighbors(self):
        # In a,e,b,u,o,i,c: u touches o and i touches o; a/e also fail.
        self.assertEqual(get_closest_vowel("aebuoic"), "")
