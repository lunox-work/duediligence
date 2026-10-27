import unittest

from src.solution import sort_numbers


class TestSortNumbers(unittest.TestCase):
    # Docstring example.
    def test_docstring_example(self):
        self.assertEqual(sort_numbers('three one five'), 'one three five')

    # Rule: the valid choices are 'zero' through 'nine'.
    # Typical: all ten numerals, shuffled; sorted by value they read zero..nine.
    def test_all_ten_numerals_shuffled(self):
        self.assertEqual(
            sort_numbers('six two nine zero four eight one seven three five'),
            'zero one two three four five six seven eight nine',
        )

    # Boundary: only the two extremes of the range, given largest first.
    def test_extremes_zero_and_nine(self):
        self.assertEqual(sort_numbers('nine zero'), 'zero nine')

    # Rule: sort from smallest to largest (by numeric value).
    # Typical: values 2, 8, 5 sort to 2, 5, 8. Alphabetical order would give
    # 'eight five two', so this pins numeric ordering.
    def test_sorts_by_value_not_alphabetically(self):
        self.assertEqual(sort_numbers('two eight five'), 'two five eight')

    # Typical: input in descending order (9, 7, 4, 1) comes out ascending.
    def test_descending_input(self):
        self.assertEqual(sort_numbers('nine seven four one'), 'one four seven nine')

    # Boundary: input already ascending is returned unchanged.
    def test_already_sorted_input(self):
        self.assertEqual(sort_numbers('zero three six'), 'zero three six')

    # Boundary: repeated numerals are all kept; sorting the multiset
    # {1, 0, 1} gives 0, 1, 1.
    def test_duplicates_are_kept(self):
        self.assertEqual(sort_numbers('one zero one'), 'zero one one')

    # Rule: input and output are space-delimited strings.
    # Typical: two numerals joined by a single space.
    def test_output_space_delimited(self):
        self.assertEqual(sort_numbers('eight three'), 'three eight')

    # Boundary: a single numeral has no delimiter, so it comes back as is.
    def test_single_numeral(self):
        self.assertEqual(sort_numbers('seven'), 'seven')


if __name__ == '__main__':
    unittest.main()
