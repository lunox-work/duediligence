import unittest

from src.solution import parse_music


class TestParseMusic(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(
            parse_music("o o| .| o| o| .| .| .| .| o o"),
            [4, 2, 1, 2, 2, 1, 1, 1, 1, 4, 4],
        )

    def test_whole_notes(self):
        # Each of the three 'o' notes contributes four beats.
        self.assertEqual(parse_music("o o o"), [4, 4, 4])

    def test_single_whole_note(self):
        # A one-note string needs no separator; 'o' contributes four beats.
        self.assertEqual(parse_music("o"), [4])

    def test_half_notes(self):
        # Each of the three 'o|' notes contributes two beats.
        self.assertEqual(parse_music("o| o| o|"), [2, 2, 2])

    def test_single_half_note(self):
        # A one-note string needs no separator; 'o|' contributes two beats.
        self.assertEqual(parse_music("o|"), [2])

    def test_quarter_notes(self):
        # Each of the three '.|' notes contributes one beat.
        self.assertEqual(parse_music(".| .| .|"), [1, 1, 1])

    def test_single_quarter_note(self):
        # A one-note string needs no separator; '.|' contributes one beat.
        self.assertEqual(parse_music(".|"), [1])

    def test_mixed_notes_preserve_order(self):
        # Applying the legend in input order gives 1, 2, 4, 1, 4, 2.
        self.assertEqual(parse_music(".| o| o .| o o|"), [1, 2, 4, 1, 4, 2])
