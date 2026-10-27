import unittest

from src.solution import total_match


class TestTotalMatch(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_both_empty(self):
        self.assertEqual(total_match([], []), [])

    def test_example_second_has_fewer_chars(self):
        self.assertEqual(total_match(['hi', 'admin'], ['hI', 'Hi']), ['hI', 'Hi'])

    def test_example_first_has_fewer_chars(self):
        self.assertEqual(
            total_match(['hi', 'admin'], ['hi', 'hi', 'admin', 'project']),
            ['hi', 'admin'],
        )

    def test_example_second_has_fewer_chars_more_items(self):
        self.assertEqual(
            total_match(['hi', 'admin'], ['hI', 'hi', 'hi']), ['hI', 'hi', 'hi']
        )

    def test_example_single_digit_list(self):
        self.assertEqual(total_match(['4'], ['1', '2', '3', '4', '5']), ['4'])

    # Rule: return the list whose total character count is smaller.

    def test_fewer_chars_typical_first(self):
        # 'a' + 'bc' = 3 chars vs 'defg' + 'hij' = 7 chars; first is smaller.
        self.assertEqual(total_match(['a', 'bc'], ['defg', 'hij']), ['a', 'bc'])

    def test_fewer_chars_typical_second(self):
        # 'hello' + 'world' = 10 chars vs 'x' = 1 char; second is smaller.
        self.assertEqual(total_match(['hello', 'world'], ['x']), ['x'])

    def test_fewer_chars_boundary_differ_by_one_second(self):
        # 'abcd' = 4 chars vs 'ab' + 'c' = 3 chars; second is smaller by one.
        self.assertEqual(total_match(['abcd'], ['ab', 'c']), ['ab', 'c'])

    def test_fewer_chars_boundary_differ_by_one_first(self):
        # 'abc' = 3 chars vs 'ab' + 'cd' = 4 chars; first is smaller by one.
        self.assertEqual(total_match(['abc'], ['ab', 'cd']), ['abc'])

    def test_fewer_chars_counts_chars_not_items(self):
        # 'abcdef' = 6 chars (1 item) vs 'a','b','c' = 3 chars (3 items);
        # the second has more items but fewer chars, so it is returned.
        self.assertEqual(total_match(['abcdef'], ['a', 'b', 'c']), ['a', 'b', 'c'])

    def test_fewer_chars_boundary_empty_list_vs_nonempty(self):
        # [] has 0 chars vs 'a' = 1 char; the empty second list is smaller.
        self.assertEqual(total_match(['a'], []), [])

    # Rule: equal totals return the first list.

    def test_tie_typical_returns_first(self):
        # 'abc' + 'de' = 5 chars vs 'a' + 'bcde' = 5 chars; tie -> first.
        self.assertEqual(total_match(['abc', 'de'], ['a', 'bcde']), ['abc', 'de'])

    def test_tie_typical_different_item_counts(self):
        # 'abcd' = 4 chars vs 'a','b','c','d' = 4 chars; tie -> first.
        self.assertEqual(total_match(['abcd'], ['a', 'b', 'c', 'd']), ['abcd'])

    def test_tie_boundary_zero_chars_first_has_empty_string(self):
        # [''] has 0 chars vs [] has 0 chars; tie -> first, which is [''].
        self.assertEqual(total_match([''], []), [''])

    def test_tie_boundary_zero_chars_first_is_empty_list(self):
        # [] has 0 chars vs [''] has 0 chars; tie -> first, which is [].
        self.assertEqual(total_match([], ['']), [])


if __name__ == '__main__':
    unittest.main()
