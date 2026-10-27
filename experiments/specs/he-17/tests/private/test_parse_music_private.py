import random
import unittest

from src.solution import parse_music

# Legend from the docstring; used to build expected values for generated
# inputs: the expected list is the beat count of each token, in order.
BEATS = {'o': 4, 'o|': 2, '.|': 1}


def _expected(tokens):
    return [BEATS[t] for t in tokens]


class TestParseMusicPrivate(unittest.TestCase):
    # Empty string: no notes, so the list of per-note beats is empty.
    def test_empty_string(self):
        self.assertEqual(parse_music(''), [])

    # Extends test_docstring_example: same tokens, reversed order.
    # Reversed [4, 2, 1, 2, 2, 1, 1, 1, 1, 4, 4] by hand.
    def test_docstring_example_reversed(self):
        self.assertEqual(
            parse_music('o o .| .| .| .| o| o| .| o| o'),
            [4, 4, 1, 1, 1, 1, 2, 2, 1, 2, 4],
        )

    # Extends test_docstring_example: a hardcoded answer for the example
    # string, or a result built from token counts, fails here.
    def test_docstring_example_rotated(self):
        # Example tokens rotated left by three, mapped by hand.
        self.assertEqual(
            parse_music('o| o| .| .| .| .| o o o o| .|'),
            [2, 2, 1, 1, 1, 1, 4, 4, 4, 2, 1],
        )

    # Extends test_whole_notes_typical: many whole notes.
    def test_whole_notes_many(self):
        self.assertEqual(parse_music(' '.join(['o'] * 50)), [4] * 50)

    # Extends test_whole_note_single: two whole notes, the smallest case
    # with a separator between whole notes.
    def test_whole_notes_two(self):
        self.assertEqual(parse_music('o o'), [4, 4])

    # Extends test_half_notes_typical: many half notes; an implementation
    # that counts 'o' characters as whole notes gets 4s here.
    def test_half_notes_many(self):
        self.assertEqual(parse_music(' '.join(['o|'] * 40)), [2] * 40)

    # Extends test_half_note_single: half note among quarter notes; an
    # implementation that maps any token ending in '|' to the same value
    # fails here.
    def test_half_note_between_quarters(self):
        self.assertEqual(parse_music('.| o| .|'), [1, 2, 1])

    # Extends test_quarter_notes_typical: many quarter notes.
    def test_quarter_notes_many(self):
        self.assertEqual(parse_music(' '.join(['.|'] * 40)), [1] * 40)

    # Extends test_quarter_note_single: quarter notes between whole notes;
    # one beat each, not merged with the neighbouring 'o'.
    def test_quarter_notes_between_wholes(self):
        self.assertEqual(parse_music('o .| .| o'), [4, 1, 1, 4])

    # Extends test_mixed_order_typical: the other orders of the three note
    # kinds; a sorted or grouped result fails at least one.
    def test_mixed_order_descending(self):
        self.assertEqual(parse_music('o o| .|'), [4, 2, 1])

    def test_mixed_order_middle_first(self):
        self.assertEqual(parse_music('o| .| o'), [2, 1, 4])

    def test_mixed_order_whole_quarter_half(self):
        self.assertEqual(parse_music('o .| o|'), [4, 1, 2])

    # Extends test_mixed_order_typical: a long random sequence. Expected is
    # built by mapping each generated token through the legend.
    def test_mixed_long_random(self):
        rng = random.Random(17)
        tokens = [rng.choice(['o', 'o|', '.|']) for _ in range(1000)]
        self.assertEqual(parse_music(' '.join(tokens)), _expected(tokens))

    # Extends test_mixed_order_typical: every sequence of length 3 over the
    # three note kinds (27 inputs), expected mapped through the legend.
    def test_all_length_three_sequences(self):
        kinds = ['o', 'o|', '.|']
        for a in kinds:
            for b in kinds:
                for c in kinds:
                    tokens = [a, b, c]
                    self.assertEqual(
                        parse_music(' '.join(tokens)), _expected(tokens)
                    )

    # Extends test_whole_then_half_adjacent: alternating runs of whole and
    # half notes.
    def test_whole_half_alternating(self):
        self.assertEqual(
            parse_music('o o| o o| o o|'), [4, 2, 4, 2, 4, 2]
        )

    # Extends test_whole_then_half_adjacent: several wholes then several
    # halves.
    def test_wholes_then_halves(self):
        self.assertEqual(
            parse_music('o o o o| o| o|'), [4, 4, 4, 2, 2, 2]
        )

    # Extends test_half_then_whole_adjacent: halves then wholes, ending on
    # a whole note.
    def test_halves_then_wholes(self):
        self.assertEqual(
            parse_music('o| o| o o o'), [2, 2, 4, 4, 4]
        )

    # Extends test_half_then_whole_adjacent: half, whole, quarter, whole;
    # the result length equals the token count (4), not the 'o' count (3).
    def test_half_whole_quarter_whole(self):
        self.assertEqual(parse_music('o| o .| o'), [2, 4, 1, 4])

    # Return type: the docstring promises a list of integers.
    def test_returns_list(self):
        result = parse_music('o o| .|')
        self.assertIsInstance(result, list)
        self.assertEqual(result, [4, 2, 1])


if __name__ == '__main__':
    unittest.main()
