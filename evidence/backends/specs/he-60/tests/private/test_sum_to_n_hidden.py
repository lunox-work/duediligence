import unittest

from src.solution import sum_to_n


class TestSumToNHidden(unittest.TestCase):
    # Extends test_example_one_single_term_boundary: returning n fails here.
    def test_three_terms(self):
        # By hand: 1 + 2 + 3 = 6.
        self.assertEqual(sum_to_n(3), 6)

    # Extends test_two_term_sum: summing only the endpoints fails here.
    def test_four_terms(self):
        # By hand: 1 + 2 + 3 + 4 = 10.
        self.assertEqual(sum_to_n(4), 10)

    # Extends test_example_five: a cached answer for five misses the next term.
    def test_six_terms(self):
        # By hand: 1 + 2 + 3 + 4 + 5 + 6 = 21.
        self.assertEqual(sum_to_n(6), 21)

    # Extends test_sum_all_integers_through_seven: include a new even endpoint.
    def test_eight_terms(self):
        # By hand: (1 + 8) + (2 + 7) + (3 + 6) + (4 + 5) = 36.
        self.assertEqual(sum_to_n(8), 36)

    # Extends test_example_ten: an odd endpoint exposes premature n // 2.
    def test_eleven_terms(self):
        # By hand: five endpoint pairs of 12, plus the middle term 6.
        self.assertEqual(sum_to_n(11), 66)

    # Extends test_example_thirty: do not round an input up to a known example.
    def test_twenty_nine_terms(self):
        # By hand: fourteen endpoint pairs of 30, plus the middle term 15.
        self.assertEqual(sum_to_n(29), 435)

    # Extends test_example_one_hundred: inputs are not capped at 100.
    def test_one_hundred_one_terms(self):
        # By hand: fifty endpoint pairs of 102, plus the middle term 51.
        self.assertEqual(sum_to_n(101), 5151)

    # Extends test_sum_all_integers_through_seven with a different odd input.
    def test_nine_terms(self):
        # By hand: four endpoint pairs of 10, plus the middle term 5.
        self.assertEqual(sum_to_n(9), 45)

    # Extends test_example_ten beyond another decimal boundary.
    def test_nineteen_terms(self):
        # By hand: nine endpoint pairs of 20, plus the middle term 10.
        self.assertEqual(sum_to_n(19), 190)

    # Extends test_example_thirty: the term after thirty must be included.
    def test_thirty_one_terms(self):
        # By hand: fifteen endpoint pairs of 32, plus the middle term 16.
        self.assertEqual(sum_to_n(31), 496)

    # Extends test_example_one_hundred on the other side of its endpoint.
    def test_ninety_nine_terms(self):
        # By hand: forty-nine endpoint pairs of 100, plus middle term 50.
        self.assertEqual(sum_to_n(99), 4950)

    # Extends test_example_one_hundred: exercise a larger even input.
    def test_two_hundred_fifty_six_terms(self):
        # Brute force: visit and add every integer from 1 through n once.
        n = 256
        expected = sum(range(1, n + 1))
        self.assertEqual(sum_to_n(n), expected)

    # Extends test_example_thirty: odd inputs need their unpaired middle term.
    def test_nine_hundred_ninety_nine_terms(self):
        # Brute force: visit and add every integer from 1 through n once.
        n = 999
        expected = sum(range(1, n + 1))
        self.assertEqual(sum_to_n(n), expected)

    # Extends test_two_term_sum: all interior terms matter in a longer range.
    def test_four_thousand_ninety_six_terms(self):
        # Brute force: visit and add every integer from 1 through n once.
        n = 4096
        expected = sum(range(1, n + 1))
        self.assertEqual(sum_to_n(n), expected)

    # Extends test_example_one_hundred: a larger input must not be truncated.
    def test_ten_thousand_terms(self):
        # Brute force: visit and add every integer from 1 through n once.
        n = 10000
        expected = sum(range(1, n + 1))
        self.assertEqual(sum_to_n(n), expected)

    # Extends test_example_one_hundred: the result can exceed 32-bit bounds.
    def test_one_hundred_thousand_one_terms(self):
        # Brute force: visit and add every integer from 1 through n once.
        n = 100001
        expected = sum(range(1, n + 1))
        self.assertEqual(sum_to_n(n), expected)

    # Extends test_example_five: calls in arbitrary order must remain correct.
    def test_repeated_inputs_in_nonmonotonic_order(self):
        # Brute force computes each independent sum, including repeated inputs.
        for n in (23, 12, 23, 3, 40, 12):
            with self.subTest(n=n):
                self.assertEqual(sum_to_n(n), sum(range(1, n + 1)))
