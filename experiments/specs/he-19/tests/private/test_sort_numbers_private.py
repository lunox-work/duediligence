import itertools
import random
import unittest

from src.solution import sort_numbers

# Numerals listed in value order: WORDS[v] is the word for v.
WORDS = ['zero', 'one', 'two', 'three', 'four',
         'five', 'six', 'seven', 'eight', 'nine']


def counting_sort(words):
    # Brute force: for each value 0..9 in increasing order, emit that word
    # as many times as it occurs in the input. Obviously ascending by value
    # and keeps every occurrence.
    out = []
    for w in WORDS:
        out.extend([w] * words.count(w))
    return ' '.join(out)


class TestSortNumbersPrivate(unittest.TestCase):
    # Extends test_docstring_example: every order of {3, 1, 5} gives 1, 3, 5.
    def test_all_permutations_of_docstring_example(self):
        for perm in itertools.permutations(['three', 'one', 'five']):
            with self.subTest(perm=perm):
                self.assertEqual(sort_numbers(' '.join(perm)), 'one three five')

    # Extends test_all_ten_numerals_shuffled: all ten in exact reverse order.
    def test_all_ten_numerals_reversed(self):
        self.assertEqual(
            sort_numbers('nine eight seven six five four three two one zero'),
            'zero one two three four five six seven eight nine',
        )

    # Extends test_all_ten_numerals_shuffled: other shuffles of all ten
    # (fixed seed); sorted by value they always read zero..nine.
    def test_all_ten_numerals_other_shuffles(self):
        rng = random.Random(19)
        expected = ' '.join(WORDS)
        for _ in range(20):
            words = WORDS[:]
            rng.shuffle(words)
            with self.subTest(words=words):
                self.assertEqual(sort_numbers(' '.join(words)), expected)

    # Extends test_extremes_zero_and_nine: extremes already in order.
    def test_extremes_already_ascending(self):
        self.assertEqual(sort_numbers('zero nine'), 'zero nine')

    # Extends test_extremes_zero_and_nine: repeated extremes, interleaved.
    def test_extremes_repeated(self):
        self.assertEqual(sort_numbers('nine zero nine zero'), 'zero zero nine nine')

    # Extends test_sorts_by_value_not_alphabetically: 4, 3, 2 is already
    # alphabetical ('four' < 'three' < 'two'), so an alphabetical sort would
    # return it unchanged; by value it is 2, 3, 4.
    def test_alphabetical_order_differs_from_value(self):
        self.assertEqual(sort_numbers('four three two'), 'two three four')

    # Extends test_sorts_by_value_not_alphabetically: a sort by word length
    # (stable) would leave 'six five four' as is; by value it is 4, 5, 6.
    def test_not_sorted_by_word_length(self):
        self.assertEqual(sort_numbers('six five four'), 'four five six')

    # Extends test_sorts_by_value_not_alphabetically: every pair of distinct
    # numerals given largest first comes out smallest first. Pins the value
    # of each of the ten words relative to every other.
    def test_every_pair_largest_first(self):
        for i, j in itertools.combinations(range(10), 2):
            with self.subTest(i=i, j=j):
                self.assertEqual(sort_numbers(WORDS[j] + ' ' + WORDS[i]),
                                 WORDS[i] + ' ' + WORDS[j])

    # Extends test_descending_input: a longer descending run (8, 6, 5, 3, 2, 0).
    def test_longer_descending_input(self):
        self.assertEqual(sort_numbers('eight six five three two zero'),
                         'zero two three five six eight')

    # Extends test_descending_input: descending with duplicates (7, 7, 3, 3, 1).
    def test_descending_input_with_duplicates(self):
        self.assertEqual(sort_numbers('seven seven three three one'),
                         'one three three seven seven')

    # Extends test_already_sorted_input: all ten, already ascending.
    def test_already_sorted_all_ten(self):
        s = 'zero one two three four five six seven eight nine'
        self.assertEqual(sort_numbers(s), s)

    # Extends test_already_sorted_input: ascending with repeats is unchanged.
    def test_already_sorted_with_duplicates(self):
        s = 'two two four four four eight'
        self.assertEqual(sort_numbers(s), s)

    # Extends test_duplicates_are_kept: the same numeral many times; a
    # set-based shortcut would collapse it to one.
    def test_all_same_numeral(self):
        self.assertEqual(sort_numbers('five five five five five'),
                         'five five five five five')

    # Extends test_duplicates_are_kept: several values each repeated, out of
    # order. Multiset {9,9,4,0,4,9,0} sorted is 0,0,4,4,9,9,9.
    def test_multiple_values_duplicated(self):
        self.assertEqual(sort_numbers('nine nine four zero four nine zero'),
                         'zero zero four four nine nine nine')

    # Extends test_duplicates_are_kept: each of the ten numerals twice,
    # interleaved in reverse; each comes out as an adjacent pair.
    def test_each_numeral_twice(self):
        words = WORDS[::-1] + WORDS[::-1]
        expected = ' '.join(w + ' ' + w for w in WORDS)
        self.assertEqual(sort_numbers(' '.join(words)), expected)

    # Extends test_output_space_delimited: output for many numerals is joined
    # by single spaces with no leading or trailing space; expected is built
    # by the counting-sort brute force.
    def test_output_single_spaces_many_numerals(self):
        s = 'three eight one one six zero nine two'
        result = sort_numbers(s)
        self.assertEqual(result, counting_sort(s.split(' ')))
        self.assertEqual(result, 'zero one one two three six eight nine')

    # Extends test_single_numeral: each of the ten numerals alone comes back
    # as is.
    def test_each_single_numeral(self):
        for w in WORDS:
            with self.subTest(w=w):
                self.assertEqual(sort_numbers(w), w)

    # Rule: sorting a space-delimited string of zero numerals gives the empty
    # string (nothing to sort, nothing to join).
    def test_empty_string(self):
        self.assertEqual(sort_numbers(''), '')

    # Larger sizes: random inputs of many numerals (fixed seed), checked
    # against the counting-sort brute force.
    def test_random_inputs_against_brute_force(self):
        rng = random.Random(1919)
        for n in (2, 3, 5, 11, 50, 200):
            for _ in range(10):
                words = [rng.choice(WORDS) for _ in range(n)]
                with self.subTest(words=words):
                    self.assertEqual(sort_numbers(' '.join(words)),
                                     counting_sort(words))

    # Larger size: 5000 numerals, checked against the counting-sort brute force.
    def test_large_input(self):
        rng = random.Random(5000)
        words = [rng.choice(WORDS) for _ in range(5000)]
        self.assertEqual(sort_numbers(' '.join(words)), counting_sort(words))


if __name__ == '__main__':
    unittest.main()
