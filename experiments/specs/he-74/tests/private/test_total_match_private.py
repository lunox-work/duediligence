import unittest

from src.solution import total_match


def _chars(lst):
    # Brute-force total: count every character of every string one by one.
    n = 0
    for s in lst:
        for _ in s:
            n += 1
    return n


class TestTotalMatchPrivate(unittest.TestCase):
    # Extends test_example_both_empty: two empty lists are a 0-0 tie, so the
    # first list is returned; contents must be [] whichever is picked.
    def test_both_empty_result_is_empty_list(self):
        self.assertEqual(total_match([], []), [])

    # Extends test_example_both_empty: lists of only empty strings, 0 vs 0,
    # tie -> first. Shortcut "return [] when totals are 0" fails.
    def test_tie_zero_chars_many_empty_strings_first(self):
        self.assertEqual(total_match(['', '', ''], ['']), ['', '', ''])

    # Extends test_example_both_empty: same, arguments swapped.
    def test_tie_zero_chars_many_empty_strings_second_longer(self):
        self.assertEqual(total_match([''], ['', '', '']), [''])

    # Extends test_example_second_has_fewer_chars: same lists swapped, so the
    # smaller list ('hI'+'Hi' = 4 vs 'hi'+'admin' = 7) is now the first.
    def test_example_two_swapped(self):
        self.assertEqual(total_match(['hI', 'Hi'], ['hi', 'admin']), ['hI', 'Hi'])

    # Extends test_example_first_has_fewer_chars: swapped; 'hi'+'admin' = 7
    # vs 2+2+5+7 = 16, smaller list now second.
    def test_example_three_swapped(self):
        self.assertEqual(
            total_match(['hi', 'hi', 'admin', 'project'], ['hi', 'admin']),
            ['hi', 'admin'],
        )

    # Extends test_example_second_has_fewer_chars_more_items: first has more
    # items but fewer chars: 'a'*5 = 5 vs 'abcdefgh' = 8 -> first.
    # Shortcut "fewer items wins" picks the second.
    def test_more_items_fewer_chars_first(self):
        self.assertEqual(
            total_match(['a', 'b', 'c', 'd', 'e'], ['abcdefgh']),
            ['a', 'b', 'c', 'd', 'e'],
        )

    # Extends test_example_single_digit_list: the single-item list has more
    # chars: '12345678' = 8 vs '1'..'5' = 5 -> second.
    # Shortcut "shorter list (by item count) wins" picks the first.
    def test_single_item_list_with_more_chars_loses(self):
        self.assertEqual(
            total_match(['12345678'], ['1', '2', '3', '4', '5']),
            ['1', '2', '3', '4', '5'],
        )

    # Extends test_fewer_chars_typical_first: duplicate characters count
    # individually. 'aaaa' = 4 vs 'abc' = 3 -> second.
    # Shortcut counting distinct chars (1 vs 3) picks the first.
    def test_repeated_chars_counted_each_time(self):
        self.assertEqual(total_match(['aaaa'], ['abc']), ['abc'])

    # Extends test_fewer_chars_typical_second: duplicate strings count each
    # time. 'ab'*3 = 6 vs 'abcd' = 4 -> second.
    # Shortcut deduplicating strings (2 vs 4) picks the first.
    def test_duplicate_strings_counted_each_time(self):
        self.assertEqual(total_match(['ab', 'ab', 'ab'], ['abcd']), ['abcd'])

    # Extends test_fewer_chars_boundary_differ_by_one_second: total is the sum
    # over all strings, not the longest string. Longest: 3 vs 4, but totals
    # 'abc'+'abc'+'abc' = 9 vs 'abcd' = 4 -> second.
    def test_total_not_longest_string(self):
        self.assertEqual(total_match(['abc', 'abc', 'abc'], ['abcd']), ['abcd'])

    # Extends test_fewer_chars_boundary_differ_by_one_first: total is not the
    # first string's length. First strings 1 vs 3, totals 1+9 = 10 vs 3 ->
    # second.
    def test_total_not_first_string_length(self):
        self.assertEqual(total_match(['a', 'bcdefghij'], ['xyz']), ['xyz'])

    # Extends test_fewer_chars_counts_chars_not_items: not lexicographic list
    # comparison. ['z'] > ['aaaa'] lexicographically, but 1 < 4 -> first.
    def test_not_lexicographic(self):
        self.assertEqual(total_match(['z'], ['aaaa']), ['z'])

    # Extends test_fewer_chars_boundary_empty_list_vs_nonempty: the empty list
    # as first argument against non-empty: 0 vs 1 -> first.
    def test_empty_first_vs_nonempty_second(self):
        self.assertEqual(total_match([], ['a']), [])

    # Extends test_fewer_chars_boundary_empty_list_vs_nonempty: empty list vs a
    # list holding a long string: 0 vs 10 -> the empty second.
    def test_nonempty_long_first_vs_empty_second(self):
        self.assertEqual(total_match(['abcdefghij', 'k'], []), [])

    # Extends test_tie_typical_returns_first: tie with item counts reversed.
    # 'a','bcde' = 5 vs 'abc','de' = 5 -> first.
    def test_tie_swapped_returns_first(self):
        self.assertEqual(total_match(['a', 'bcde'], ['abc', 'de']), ['a', 'bcde'])

    # Extends test_tie_typical_different_item_counts: tie where the first list
    # has more items. 'a','b','c','d' = 4 vs 'abcd' = 4 -> first.
    # Shortcut "on tie return the one with fewer items" fails.
    def test_tie_first_has_more_items(self):
        self.assertEqual(
            total_match(['a', 'b', 'c', 'd'], ['abcd']), ['a', 'b', 'c', 'd']
        )

    # Extends test_tie_typical_returns_first: identical contents tie; returns
    # a list equal to both.
    def test_tie_identical_lists(self):
        self.assertEqual(total_match(['xy', 'z'], ['xy', 'z']), ['xy', 'z'])

    # Extends test_tie_typical_returns_first: tie with different strings of
    # equal length; lexicographically larger first is still returned.
    # 'zz' = 2 vs 'aa' = 2 -> first.
    def test_tie_lexicographically_larger_first(self):
        self.assertEqual(total_match(['zz'], ['aa']), ['zz'])

    # Extends test_tie_boundary_zero_chars_first_has_empty_string: empty
    # strings add nothing. ['abc'] = 3 vs ['', 'ab', ''] = 2 -> second.
    # Shortcut counting each item as at least 1 (3 vs 4) picks the first.
    def test_empty_strings_contribute_zero(self):
        self.assertEqual(total_match(['abc'], ['', 'ab', '']), ['', 'ab', ''])

    # Extends test_tie_boundary_zero_chars_first_is_empty_list: many empty
    # strings vs a single char: 0 vs 1 -> first.
    def test_many_empty_strings_beat_one_char(self):
        self.assertEqual(total_match(['', '', '', '', ''], ['a']), ['', '', '', '', ''])

    # Rule: every char counts, including spaces and punctuation.
    # 'a b' = 3, '!!' = 2 -> 5 vs 'abcd' = 4 -> second.
    # Shortcut counting only letters/alnum (2 vs 4) picks the first.
    def test_spaces_and_punctuation_count(self):
        self.assertEqual(total_match(['a b', '!!'], ['abcd']), ['abcd'])

    # Rule: whitespace like newlines/tabs counts. '\n\t ' = 3 vs 'ab' = 2 ->
    # second. Shortcut stripping whitespace (0 vs 2) picks the first.
    def test_whitespace_counts(self):
        self.assertEqual(total_match(['\n\t '], ['ab']), ['ab'])

    # Rule: chars, not bytes. 'éé' is 2 chars (4 UTF-8 bytes) vs 'abc' = 3
    # chars -> first. Byte counting (4 vs 3) picks the second.
    def test_non_ascii_counted_as_chars(self):
        self.assertEqual(total_match(['éé'], ['abc']), ['éé'])

    # Returned list keeps its element order: ['c','b','a'] = 3 vs 'wxyz' = 4.
    def test_result_order_preserved(self):
        self.assertEqual(total_match(['c', 'b', 'a'], ['wxyz']), ['c', 'b', 'a'])

    # Large: 1000 x 'ab' = 2000 vs 999 x 'ab' + 'a' = 1999 -> second, by one.
    # Totals verified with _chars brute force.
    def test_large_differ_by_one_second(self):
        lst1 = ['ab'] * 1000
        lst2 = ['ab'] * 999 + ['a']
        self.assertEqual(_chars(lst1), 2000)
        self.assertEqual(_chars(lst2), 1999)
        self.assertEqual(total_match(lst1, lst2), lst2)

    # Large tie: 500 x 'abcd' = 2000 vs 2000 x 'x' = 2000 -> first.
    def test_large_tie_returns_first(self):
        lst1 = ['abcd'] * 500
        lst2 = ['x'] * 2000
        self.assertEqual(_chars(lst1), _chars(lst2))
        self.assertEqual(total_match(lst1, lst2), lst1)

    # Large: first has many more items but fewer chars:
    # 3000 x 'a' = 3000 vs 3 x ('b' * 1001) = 3003 -> first.
    def test_large_many_items_fewer_chars_first(self):
        lst1 = ['a'] * 3000
        lst2 = ['b' * 1001] * 3
        self.assertEqual(_chars(lst1), 3000)
        self.assertEqual(_chars(lst2), 3003)
        self.assertEqual(total_match(lst1, lst2), lst1)

    # Mixed lengths, computed by brute force: first totals 1+2+...+20 = 210,
    # second is 211 x 'q' in one string -> first by one.
    def test_mixed_lengths_brute_force(self):
        lst1 = ['k' * i for i in range(1, 21)]
        lst2 = ['q' * 211]
        self.assertEqual(_chars(lst1), 210)
        expected = lst1 if _chars(lst1) <= _chars(lst2) else lst2
        self.assertEqual(total_match(lst1, lst2), expected)
        self.assertEqual(total_match(lst1, lst2), lst1)

    # Swap of the previous case: 211 vs 210 -> second.
    def test_mixed_lengths_brute_force_swapped(self):
        lst1 = ['q' * 211]
        lst2 = ['k' * i for i in range(1, 21)]
        self.assertEqual(total_match(lst1, lst2), lst2)


if __name__ == '__main__':
    unittest.main()
