import unittest

from src.solution import cycpattern_check


class TestCycpatternCheckPrivate(unittest.TestCase):
    # Extends test_example_abcd_abd: separated letters remain a non-match.
    def test_longer_word_with_only_a_subsequence(self):
        # Windows have consecutive alphabet letters; no rotation of lno does.
        self.assertEqual(cycpattern_check("lmnopqrst", "lno"), False)

    # Extends test_example_hello_ell: an interior match of a different length.
    def test_four_letter_interior_match(self):
        # strawberry = st + rawb + erry.
        self.assertEqual(cycpattern_check("strawberry", "rawb"), True)

    # Extends test_example_whassup_psus: even a full anagram may not rotate.
    def test_interior_anagram_with_wrong_order(self):
        # abdc is not abcd, bcda, cdab, or dabc; other windows contain x/z.
        self.assertEqual(cycpattern_check("xxabdczz", "abcd"), False)

    # Extends test_example_abab_baa: a rotated repeated-letter pattern fits.
    def test_rotation_matches_a_shorter_alternating_window(self):
        # yxx rotated twice is xyx, the first three letters of xyxy.
        self.assertEqual(cycpattern_check("xyxy", "yxx"), True)

    # Extends test_example_efef_eeff: duplicates in a longer first word.
    def test_equal_letter_counts_do_not_imply_rotation(self):
        # Windows: aabb, abba, bbaa, baab, aabb; neither abab nor baba.
        self.assertEqual(cycpattern_check("aabbaabb", "abab"), False)

    # Extends test_example_himenss_simen: a six-letter rotation in the middle.
    def test_six_letter_rotation_inside_padding(self):
        # xytuvw rotated by two is tuvwxy.
        self.assertEqual(cycpattern_check("zztuvwxyqq", "xytuvw"), True)

    # Extends test_unrotated_match_at_start: a longer prefix in new letters.
    def test_five_letter_prefix(self):
        # klmno is the first five letters.
        self.assertEqual(cycpattern_check("klmnopqrst", "klmno"), True)

    # Extends test_unrotated_match_at_end: the final legal window is checked.
    def test_five_letter_suffix(self):
        # pqrst is the last five letters.
        self.assertEqual(cycpattern_check("klmnopqrst", "pqrst"), True)

    # Extends test_unrotated_match_is_entire_word: equality with duplicates.
    def test_entire_repeated_letter_word(self):
        # Zero rotation is always allowed, including with repeated letters.
        self.assertEqual(cycpattern_check("mississippi", "mississippi"), True)

    # Extends test_single_letter_match: avoid a special case for the letter a.
    def test_identical_single_z(self):
        self.assertEqual(cycpattern_check("z", "z"), True)

    # Extends test_rotation_by_multiple_positions_matches_inside.
    def test_nine_letter_pattern_rotated_by_three(self):
        # abcdefghi rotated by three is defghiabc.
        self.assertEqual(cycpattern_check("zzdefghiabcqq", "abcdefghi"), True)

    # Extends test_rotated_match_is_entire_word: a non-endpoint rotation.
    def test_eight_letter_entire_word_rotation(self):
        # abcdefgh rotated by four is efghabcd.
        self.assertEqual(cycpattern_check("efghabcd", "abcdefgh"), True)

    # Extends test_rotation_by_length_minus_one_matches: larger rotation bound.
    def test_eight_letter_last_rotation(self):
        # abcdefgh rotated by seven is habcdefg.
        self.assertEqual(cycpattern_check("qqhabcdefgzz", "abcdefgh"), True)

    # Extends test_rotation_with_repeated_letters: three distinct letters.
    def test_rotation_preserves_three_letter_multiplicities(self):
        # aaabbcc rotated by six is caaabbc.
        self.assertEqual(cycpattern_check("xxcaaabbczz", "aaabbcc"), True)

    # Extends test_single_letter_absent: search a longer first word.
    def test_single_letter_absent_from_long_word(self):
        # No character is z.
        self.assertEqual(cycpattern_check("mississippi", "z"), False)

    # Extends test_second_word_one_letter_longer: forbid repeated use of a.
    def test_second_word_three_times_as_long(self):
        # Every rotation still has length nine, exceeding length three.
        self.assertEqual(cycpattern_check("abc", "abcabcabc"), False)

    # Extends test_subsequence_without_contiguous_match: different alphabet.
    def test_subsequence_separated_by_other_letters(self):
        # Each length-three window contains x, which no pqr rotation has.
        self.assertEqual(cycpattern_check("pxqxr", "pqr"), False)

    # Extends test_first_word_does_not_wrap_around: a longer boundary crossing.
    def test_four_letter_pattern_cannot_wrap_first_word(self):
        # Windows qwer, wert, erty all contain e/r, absent from tyqw.
        self.assertEqual(cycpattern_check("qwerty", "tyqw"), False)

    # Extends test_single_letter_match: unequal input lengths still match.
    def test_single_letter_at_last_position(self):
        self.assertEqual(cycpattern_check("abcdefghz", "z"), True)

    # Extends test_rotation_with_repeated_letters: all rotations coincide.
    def test_all_identical_letters_match(self):
        # aaa occurs at each of the three possible starting positions.
        self.assertEqual(cycpattern_check("aaaaa", "aaa"), True)

    # Extends test_example_efef_eeff: enough letters in total is insufficient.
    def test_identical_letters_need_a_contiguous_run(self):
        # The longest run of a is three; the only rotation is aaaa.
        self.assertEqual(cycpattern_check("aaabaa", "aaaa"), False)

    # Extends test_rotated_match_is_entire_word: same-length anagram rejection.
    def test_same_length_noncyclic_permutation(self):
        # abcd, bcda, cdab, dabc do not include acbd.
        self.assertEqual(cycpattern_check("acbd", "abcd"), False)

    # Extends test_rotation_with_repeated_letters: do not split at first a only.
    def test_repeated_initial_letter_requires_later_split(self):
        # aabac rotated by one is abaca, between the zz guards.
        self.assertEqual(cycpattern_check("zzabacazz", "aabac"), True)

    # Extends test_rotation_by_multiple_positions_matches_inside.
    def test_failed_prefix_candidate_before_rotated_match(self):
        # The initial abx fails, but cab later is a rotation of abc.
        self.assertEqual(cycpattern_check("abxzzcabyy", "abc"), True)

    # Extends test_unrotated_match_at_end: the suffix itself needs rotation.
    def test_rotated_match_at_final_start_position(self):
        # abcdef rotated by two is the suffix cdefab.
        self.assertEqual(cycpattern_check("zzzzcdefab", "abcdef"), True)

    # Extends test_unrotated_match_at_start: the prefix itself needs rotation.
    def test_rotated_match_at_first_start_position(self):
        # abcdef rotated by two is the prefix cdefab.
        self.assertEqual(cycpattern_check("cdefabzzzz", "abcdef"), True)

    # Extends test_example_efef_eeff: equal sets with unequal multiplicities.
    def test_equal_character_sets_with_wrong_counts(self):
        # Whole-word comparison: three a's cannot equal any two-a rotation.
        self.assertEqual(cycpattern_check("aaabbb", "aabbbb"), False)

    # Extends test_second_word_one_letter_longer: fitting length is insufficient.
    def test_only_a_proper_part_of_rotation_matches(self):
        # Both six-letter windows contain z, absent from every rotation.
        self.assertEqual(cycpattern_check("zzdefab", "abcdef"), False)

    # Extends test_rotation_by_multiple_positions_matches_inside: longer input.
    def test_alphabet_length_rotation(self):
        # Moving the first 17 letters to the end gives rst...zabc...q.
        self.assertEqual(
            cycpattern_check(
                "zzrstuvwxyzabcdefghijklmnopqqq", "abcdefghijklmnopqrstuvwxyz"
            ),
            True,
        )

    # Extends test_example_whassup_psus: all letters present exactly once.
    def test_long_anagram_is_not_a_rotation(self):
        # In every alphabet rotation a is followed by b; here it precedes c.
        self.assertEqual(
            cycpattern_check("bacdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyz"),
            False,
        )

    # Extends test_rotated_match_is_entire_word: smallest nontrivial rotation.
    def test_two_letter_rotation(self):
        self.assertEqual(cycpattern_check("ba", "ab"), True)

    # Extends test_single_letter_absent: two-letter non-match of equal lengths.
    def test_two_letter_missing_character(self):
        # Neither ab nor ba equals ac.
        self.assertEqual(cycpattern_check("ac", "ab"), False)

    # Extends test_rotation_by_multiple_positions_matches_inside: Unicode letters.
    def test_accented_letters_in_rotated_word(self):
        # naïvecafé rotated by two is ïvecaféna; accents are ordinary letters.
        self.assertEqual(cycpattern_check("zzïvecafénaqq", "naïvecafé"), True)

    # Extends test_example_abcd_abd: substring equality preserves letter case.
    def test_uppercase_pattern_does_not_match_lowercase_word(self):
        # All rotations contain uppercase letters, absent from the first word.
        self.assertEqual(cycpattern_check("abcdef", "ABC"), False)

    # Extends test_unrotated_match_at_end: many rejected starting positions.
    def test_match_after_many_identical_prefix_characters(self):
        # abcdefghijk rotated by five is fghijkabcde, placed at the end.
        self.assertEqual(
            cycpattern_check("z" * 4096 + "fghijkabcde", "abcdefghijk"), True
        )

    # Extends test_rotation_with_repeated_letters: periodic equal-length words.
    def test_periodic_word_rotates_to_other_phase(self):
        # One left rotation of abababab is babababa.
        self.assertEqual(cycpattern_check("babababa", "abababab"), True)
