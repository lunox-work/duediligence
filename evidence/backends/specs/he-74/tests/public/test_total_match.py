import unittest

from src.solution import total_match


class TestTotalMatch(unittest.TestCase):
    def test_example_both_empty(self):
        self.assertEqual(total_match([], []), [])

    def test_example_shorter_second_list(self):
        self.assertEqual(
            total_match(['hi', 'admin'], ['hI', 'Hi']),
            ['hI', 'Hi'],
        )

    def test_example_shorter_first_list(self):
        self.assertEqual(
            total_match(['hi', 'admin'], ['hi', 'hi', 'admin', 'project']),
            ['hi', 'admin'],
        )

    def test_example_more_strings_but_fewer_characters(self):
        self.assertEqual(
            total_match(['hi', 'admin'], ['hI', 'hi', 'hi']),
            ['hI', 'hi', 'hi'],
        )

    def test_example_digit_strings(self):
        self.assertEqual(total_match(['4'], ['1', '2', '3', '4', '5']), ['4'])

    def test_first_shorter_despite_having_more_strings(self):
        # The first total is 1 + 1 + 1 = 3; the second total is 4.
        self.assertEqual(total_match(['a', 'b', 'c'], ['long']), ['a', 'b', 'c'])

    def test_first_empty_second_nonempty(self):
        # Zero characters is less than the second list's one character.
        self.assertEqual(total_match([], ['a']), [])

    def test_second_shorter_despite_having_more_strings(self):
        # The second total is 1 + 1 + 1 = 3; the first total is 4.
        self.assertEqual(total_match(['long'], ['a', 'b', 'c']), ['a', 'b', 'c'])

    def test_second_empty_first_nonempty(self):
        # Zero characters is less than the first list's one character.
        self.assertEqual(total_match(['a'], []), [])

    def test_equal_positive_totals_return_first(self):
        # Both totals are 3 (2 + 1 and 3), so the first list wins the tie.
        self.assertEqual(total_match(['ab', 'c'], ['xyz']), ['ab', 'c'])

    def test_equal_zero_totals_return_first(self):
        # An empty string and an empty list each contribute zero characters.
        self.assertEqual(total_match([''], []), [''])

    def test_empty_strings_contribute_zero(self):
        # Totals are 0 + 2 + 0 = 2 and 1 + 0 + 2 = 3.
        self.assertEqual(
            total_match(['', 'ab', ''], ['c', '', 'de']),
            ['', 'ab', ''],
        )

    def test_spaces_and_punctuation_count_as_characters(self):
        # A space and an exclamation mark total 2 characters, versus 1 for 'x'.
        self.assertEqual(total_match([' ', '!'], ['x']), ['x'])
