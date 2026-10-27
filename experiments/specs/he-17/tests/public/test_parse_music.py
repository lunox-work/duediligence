import unittest

from src.solution import parse_music


class TestParseMusic(unittest.TestCase):
    # Docstring example.
    def test_docstring_example(self):
        self.assertEqual(
            parse_music('o o| .| o| o| .| .| .| .| o o'),
            [4, 2, 1, 2, 2, 1, 1, 1, 1, 4, 4],
        )

    # Rule: 'o' is a whole note, four beats.
    def test_whole_notes_typical(self):
        # Three 'o' tokens, each 4 beats by the legend.
        self.assertEqual(parse_music('o o o'), [4, 4, 4])

    def test_whole_note_single(self):
        # Boundary: one note only, no separators; 'o' -> 4.
        self.assertEqual(parse_music('o'), [4])

    # Rule: 'o|' is a half note, two beats.
    def test_half_notes_typical(self):
        # Three 'o|' tokens, each 2 beats by the legend.
        self.assertEqual(parse_music('o| o| o|'), [2, 2, 2])

    def test_half_note_single(self):
        # Boundary: one note only; 'o|' -> 2, not 4 for its leading 'o'.
        self.assertEqual(parse_music('o|'), [2])

    # Rule: '.|' is a quarter note, one beat.
    def test_quarter_notes_typical(self):
        # Three '.|' tokens, each 1 beat by the legend.
        self.assertEqual(parse_music('.| .| .|'), [1, 1, 1])

    def test_quarter_note_single(self):
        # Boundary: one note only; '.|' -> 1.
        self.assertEqual(parse_music('.|'), [1])

    # Rule: one integer per note, in the order the notes appear.
    def test_mixed_order_typical(self):
        # Tokens '.|', 'o|', 'o' map to 1, 2, 4 in that order.
        self.assertEqual(parse_music('.| o| o'), [1, 2, 4])

    def test_whole_then_half_adjacent(self):
        # Boundary: 'o' directly followed by 'o|' must stay two notes,
        # 4 then 2, not be merged or misread.
        self.assertEqual(parse_music('o o|'), [4, 2])

    def test_half_then_whole_adjacent(self):
        # Boundary: 'o|' directly followed by 'o' gives 2 then 4.
        self.assertEqual(parse_music('o| o'), [2, 4])


if __name__ == '__main__':
    unittest.main()
