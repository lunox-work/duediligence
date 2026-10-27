import unittest

from src.solution import parse_music


class TestParseMusicPrivate(unittest.TestCase):
    # Covers the whole-note legend directly, as in test_single_whole_note.
    def test_single_whole(self):
        self.assertEqual(parse_music("o"), [4])

    # Covers the half-note legend directly, as in test_single_half_note.
    def test_single_half(self):
        self.assertEqual(parse_music("o|"), [2])

    # Covers the quarter-note legend directly, as in test_single_quarter_note.
    def test_single_quarter(self):
        self.assertEqual(parse_music(".|"), [1])

    # Extends test_whole_notes: two notes catch a fixed three-element answer.
    def test_two_whole_notes(self):
        self.assertEqual(parse_music("o o"), [4, 4])

    # Extends test_half_notes: repeated notes must retain their multiplicity.
    def test_two_half_notes(self):
        self.assertEqual(parse_music("o| o|"), [2, 2])

    # Extends test_quarter_notes: two notes must not be padded to three.
    def test_two_quarter_notes(self):
        self.assertEqual(parse_music(".| .|"), [1, 1])

    # Extends test_single_whole_note: 'o' and 'o|' must remain distinct.
    def test_whole_then_half(self):
        self.assertEqual(parse_music("o o|"), [4, 2])

    # Extends test_single_whole_note: a whole note may precede a quarter.
    def test_whole_then_quarter(self):
        self.assertEqual(parse_music("o .|"), [4, 1])

    # Extends test_single_half_note: a following whole note is a separate note.
    def test_half_then_whole(self):
        self.assertEqual(parse_music("o| o"), [2, 4])

    # Extends test_single_half_note: sharing '|' does not imply equal durations.
    def test_half_then_quarter(self):
        self.assertEqual(parse_music("o| .|"), [2, 1])

    # Extends test_single_quarter_note: the next note may have four beats.
    def test_quarter_then_whole(self):
        self.assertEqual(parse_music(".| o"), [1, 4])

    # Extends test_single_quarter_note: the next note may have two beats.
    def test_quarter_then_half(self):
        self.assertEqual(parse_music(".| o|"), [1, 2])

    # Extends test_docstring_example: reverse its order, preserving all notes.
    def test_reversed_docstring_sequence(self):
        # Reverse the example's eleven durations by hand.
        self.assertEqual(
            parse_music("o o .| .| .| .| o| o| .| o| o"),
            [4, 4, 1, 1, 1, 1, 2, 2, 1, 2, 4],
        )

    # Extends test_mixed_notes_preserve_order: same counts, different order.
    def test_reordered_balanced_sequence(self):
        # Read the six tokens left to right using the legend.
        self.assertEqual(parse_music("o| o .| o o| .|"), [2, 4, 1, 4, 2, 1])

    # Extends test_docstring_example, test_whole_notes, test_half_notes,
    # test_quarter_notes, and test_mixed_notes_preserve_order: long unequal
    # runs and changing patterns catch truncation and fixed-length shortcuts.
    def test_long_sequence_with_unequal_runs(self):
        notes = (
            ["o|"] * 37
            + ["o"] * 53
            + [".|"] * 71
            + ["o|", "o", ".|"] * 29
            + ["o"] * 2
        )
        # Each run repeats its legend value; each final triplet is 2, 4, 1.
        expected = [2] * 37 + [4] * 53 + [1] * 71 + [2, 4, 1] * 29 + [4] * 2
        self.assertEqual(parse_music(" ".join(notes)), expected)
