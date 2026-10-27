import unittest

from src.solution import total_match


class TestTotalMatchHidden(unittest.TestCase):
    # Extends test_example_both_empty: a zero-total tie can have unequal lists.
    def test_empty_first_ties_multiple_empty_strings(self):
        # Both totals are zero; the first list is [].
        self.assertEqual(total_match([], ["", "", ""]), [])

    # Extends test_example_shorter_second_list: compare full sums, not first items.
    def test_equal_item_counts_shorter_second_after_long_tail(self):
        # First: 1 + 10 = 11; second: 4 + 4 = 8.
        self.assertEqual(
            total_match(["a", "xxxxxxxxxx"], ["mmmm", "nnnn"]),
            ["mmmm", "nnnn"],
        )

    # Extends test_example_shorter_first_list: the first item's length can be larger.
    def test_single_long_string_beats_two_medium_strings(self):
        # First: 10; second: 6 + 6 = 12.
        self.assertEqual(
            total_match(["abcdefghij"], ["xxxxxx", "yyyyyy"]),
            ["abcdefghij"],
        )

    # Extends test_example_more_strings_but_fewer_characters: many repeated items.
    def test_eleven_strings_beat_three_strings(self):
        # First: 4 + 4 + 4 = 12; second: eleven copies of one character = 11.
        self.assertEqual(
            total_match(["aaaa", "bbbb", "cccc"], ["z"] * 11),
            ["z"] * 11,
        )

    # Extends test_example_digit_strings: numeric values do not determine length.
    def test_digit_strings_choose_shorter_second(self):
        # First: four characters; second: 1 + 1 = 2 characters.
        self.assertEqual(total_match(["1000"], ["9", "9"]), ["9", "9"])

    # Extends test_first_shorter_despite_having_more_strings: include zero lengths.
    def test_many_empty_strings_and_short_content_win_first(self):
        # First: twelve zeros + 2 + 1 = 3; second: 4 + 0 = 4.
        first = [""] * 12 + ["ab", "c"]
        self.assertEqual(total_match(first, ["abcd", ""]), first)

    # Extends test_first_empty_second_nonempty: empty strings can surround content.
    def test_empty_first_beats_padded_nonempty_second(self):
        # First: 0; second: 0 + 7 + 0 = 7.
        self.assertEqual(total_match([], ["", "payload", ""]), [])

    # Extends test_second_shorter_despite_having_more_strings: a larger size gap.
    def test_nine_short_strings_beat_one_long_string(self):
        # First: 10; second: nine copies of one character = 9.
        self.assertEqual(total_match(["1234567890"], ["a"] * 9), ["a"] * 9)

    # Extends test_second_empty_first_nonempty: looking only at the first item fails.
    def test_empty_second_beats_content_after_empty_string(self):
        # First: 0 + 3 + 0 = 3; second: 0.
        self.assertEqual(total_match(["", "abc", ""], []), [])

    # Extends test_equal_positive_totals_return_first: first has fewer items.
    def test_positive_tie_first_has_fewer_items(self):
        # Both totals are 6: 6 versus 1 + 2 + 3.
        self.assertEqual(total_match(["longer"], ["a", "bb", "ccc"]), ["longer"])

    # Extends test_equal_zero_totals_return_first: both lists contain empty strings.
    def test_zero_tie_first_has_more_empty_strings(self):
        # Both totals are zero; preserve the first list's two entries.
        self.assertEqual(total_match(["", ""], [""]), ["", ""])

    # Extends test_empty_strings_contribute_zero: the second list now wins.
    def test_empty_strings_in_both_lists_choose_second(self):
        # First: 2 + 0 + 3 + 0 = 5; second: 0 + 0 + 2 + 0 = 2.
        self.assertEqual(
            total_match(["ab", "", "cde", ""], ["", "", "fg", ""]),
            ["", "", "fg", ""],
        )

    # Extends test_spaces_and_punctuation_count_as_characters: embedded characters.
    def test_embedded_space_and_punctuation_are_counted(self):
        # 'a b!' has four characters, versus three in 'xyz'.
        self.assertEqual(total_match(["a b!"], ["xyz"]), ["xyz"])

    # Extends test_spaces_and_punctuation_count_as_characters: other whitespace.
    def test_tabs_newlines_and_carriage_returns_are_counted(self):
        # Tab, newline, carriage return, and space total 4, versus 3.
        self.assertEqual(total_match(["\t\n\r "], ["abc"]), ["abc"])

    # Extends test_example_shorter_first_list: singleton comparison is by length.
    def test_singletons_shorter_first_despite_lexical_order(self):
        # First: 2; second: 3, even though 'zz' sorts after 'aaa'.
        self.assertEqual(total_match(["zz"], ["aaa"]), ["zz"])

    # Extends test_example_shorter_second_list: reverse the singleton length order.
    def test_singletons_shorter_second_despite_lexical_order(self):
        # First: 3; second: 2.
        self.assertEqual(total_match(["aaa"], ["zz"]), ["zz"])

    # Extends test_first_shorter_despite_having_more_strings: retain order/duplicates.
    def test_first_winner_preserves_unsorted_repeated_contents(self):
        # First: 2 + 1 + 2 + 0 = 5; second: 6.
        self.assertEqual(
            total_match(["zz", "a", "zz", ""], ["abcdef"]),
            ["zz", "a", "zz", ""],
        )

    # Extends test_second_shorter_despite_having_more_strings: retain second's order.
    def test_second_winner_preserves_unsorted_repeated_contents(self):
        # First: 12; second: 1 + 1 + 1 + 0 + 2 = 5.
        self.assertEqual(
            total_match(["abcdefghijkl"], ["z", "a", "z", "", "bb"]),
            ["z", "a", "z", "", "bb"],
        )

    # Extends test_example_digit_strings: count repeated strings with multiplicity.
    def test_duplicate_long_strings_can_make_first_lose(self):
        # First: 4 * 3 = 12; second: 8. Deduplicating first would reverse this.
        self.assertEqual(total_match(["aaaa"] * 3, ["bbbbbbbb"]), ["bbbbbbbb"])

    # Extends test_example_shorter_first_list: duplicates in second also count.
    def test_duplicate_strings_can_make_second_lose(self):
        # First: 6; second: 2 * 4 = 8. Deduplicating second would reverse this.
        self.assertEqual(total_match(["cccccc"], ["bb"] * 4), ["cccccc"])

    # Extends test_example_shorter_first_list: maximum length is not the total.
    def test_larger_maximum_length_can_still_win(self):
        # First: 8 + 1 = 9; second: 5 + 5 = 10.
        self.assertEqual(
            total_match(["abcdefgh", "a"], ["xxxxx", "yyyyy"]),
            ["abcdefgh", "a"],
        )

    # Extends test_example_shorter_second_list: minimum length is not the total.
    def test_smallest_individual_string_can_belong_to_loser(self):
        # First: 1 + 15 = 16; second: 4 + 4 = 8.
        self.assertEqual(
            total_match(["a", "b" * 15], ["cccc", "dddd"]),
            ["cccc", "dddd"],
        )

    # Extends test_example_shorter_second_list: long inputs with a one-char gap.
    def test_long_strings_differ_by_one_in_total(self):
        # First: 20000 + 3 = 20003; second: 20002.
        self.assertEqual(
            total_match(["x" * 20000, "yyy"], ["z" * 20002]),
            ["z" * 20002],
        )

    # Extends test_example_shorter_second_list: the decision requires the last item.
    def test_equal_long_prefixes_with_different_final_lengths(self):
        # First: 400 + 3 = 403; second: 400 + 2 = 402.
        self.assertEqual(
            total_match(["a"] * 400 + ["bbb"], ["z"] * 400 + ["cc"]),
            ["z"] * 400 + ["cc"],
        )

    # Extends test_spaces_and_punctuation_count_as_characters: non-ASCII strings.
    def test_non_ascii_letters_count_as_characters(self):
        # Two accented letters and one CJK character total 3, versus 4 ASCII chars.
        self.assertEqual(total_match(["éé", "界"], ["abcd"]), ["éé", "界"])

    # Extends test_equal_positive_totals_return_first: mixed empties and more items.
    def test_positive_tie_with_empty_strings_and_different_item_counts(self):
        # First: 0 + 2 + 0 + 1 = 3; second: 1 + 1 + 1 + 0 + 0 = 3.
        self.assertEqual(
            total_match(["", "pq", "", "r"], ["x", "y", "z", "", ""]),
            ["", "pq", "", "r"],
        )

    # Extends test_example_digit_strings: a minus sign contributes one character.
    def test_negative_looking_string_is_counted_as_text(self):
        # '-100' has four characters; the three '0' strings total three.
        self.assertEqual(total_match(["-100"], ["0", "0", "0"]), ["0", "0", "0"])
