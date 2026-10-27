import unittest

from src.solution import sort_numbers


class TestSortNumbersHidden(unittest.TestCase):
    # Extends public test_docstring_example: the same values in another order.
    def test_example_values_in_another_order(self):
        # Numerically, 1 < 3 < 5, regardless of their original positions.
        self.assertEqual(sort_numbers("five three one"), "one three five")

    # Extends public test_docstring_example: a triple absent from the example.
    def test_different_three_values(self):
        # The input represents 9, 2, 4; ascending order is 2, 4, 9.
        self.assertEqual(sort_numbers("nine two four"), "two four nine")

    # Extends public test_all_valid_words_in_reverse_order: reversal cannot sort this.
    def test_all_words_shuffled(self):
        # Each digit occurs once, so the answer is exactly 0 through 9.
        self.assertEqual(
            sort_numbers("four zero seven two nine one six eight three five"),
            "zero one two three four five six seven eight nine",
        )

    # Extends public test_already_sorted_values: includes every valid word.
    def test_all_words_already_sorted(self):
        # The entire valid range is already in numeric order.
        ordered = "zero one two three four five six seven eight nine"
        self.assertEqual(sort_numbers(ordered), ordered)

    # Extends public test_all_valid_words_in_reverse_order and
    # test_repeated_values_are_preserved: 715 entries with unequal multiplicities.
    def test_long_input_with_every_word_and_unequal_counts(self):
        words = (
            "zero", "one", "two", "three", "four",
            "five", "six", "seven", "eight", "nine",
        )
        counts = tuple(13 * (value + 1) for value in range(10))
        visit_order = (9, 0, 8, 1, 7, 2, 6, 3, 5, 4)
        tokens = [
            words[value]
            for occurrence in range(max(counts))
            for value in visit_order
            if occurrence < counts[value]
        ]
        # Construction emits each word counts[value] times. Enumerating numeric
        # values from 0 to 9 and repeating those counts gives the exact answer.
        expected = " ".join(
            word
            for value, word in enumerate(words)
            for _ in range(counts[value])
        )
        self.assertEqual(sort_numbers(" ".join(tokens)), expected)

    # Extends public test_numeric_order_for_mixed_words: a different subset/order.
    def test_mixed_subset_including_one_and_three(self):
        # The values are 6, 3, 8, 1, 4; sorted they are 1, 3, 4, 6, 8.
        self.assertEqual(
            sort_numbers("six three eight one four"),
            "one three four six eight",
        )

    # Extends public test_numeric_order_for_mixed_words: an ascending two-word
    # input on which alphabetic sorting would incorrectly put seven first.
    def test_six_before_seven(self):
        # 6 < 7 even though "seven" precedes "six" alphabetically.
        self.assertEqual(sort_numbers("six seven"), "six seven")

    # Extends public test_numeric_order_for_mixed_words: another two-word input
    # whose numeric order disagrees with alphabetic order.
    def test_three_after_two(self):
        # 2 < 3, so this descending pair must be reversed.
        self.assertEqual(sort_numbers("three two"), "two three")

    # Extends public test_repeated_values_are_preserved: duplicates at both ends
    # of the allowed range, with different counts for the two values.
    def test_repeated_endpoints(self):
        # There are three zeroes and four nines; every zero precedes every nine.
        self.assertEqual(
            sort_numbers("nine zero nine zero zero nine nine"),
            "zero zero zero nine nine nine nine",
        )

    # Extends public test_repeated_values_are_preserved: repeated values absent
    # from its input, with a singleton between the repeated groups.
    def test_uneven_repetitions_in_mixed_order(self):
        # Counts are two twos, one six, two sevens, and three eights.
        self.assertEqual(
            sort_numbers("eight two seven eight six two seven eight"),
            "two two six seven seven eight eight eight",
        )

    # Extends public test_all_values_equal: a different value and a larger count.
    def test_thirty_seven_equal_values(self):
        # All 37 occurrences have the same numeric value and must be retained.
        repeated = " ".join(["seven"] * 37)
        self.assertEqual(sort_numbers(repeated), repeated)

    # Extends public test_already_sorted_values: repeated runs and both endpoints.
    def test_already_sorted_with_duplicate_runs(self):
        # 0, 0, 2, 2, 4, 7, 7, 9, 9 is nondecreasing and retains all duplicates.
        ordered = "zero zero two two four seven seven nine nine"
        self.assertEqual(sort_numbers(ordered), ordered)

    # Extends public test_single_zero: another allowed one-element input.
    def test_single_one(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("one"), "one")

    # Extends public test_single_zero: another allowed one-element input.
    def test_single_two(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("two"), "two")

    # Extends public test_single_zero: another allowed one-element input.
    def test_single_three(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("three"), "three")

    # Extends public test_single_zero: another allowed one-element input.
    def test_single_four(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("four"), "four")

    # Extends public test_single_nine: another allowed one-element input.
    def test_single_five(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("five"), "five")

    # Extends public test_single_nine: another allowed one-element input.
    def test_single_six(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("six"), "six")

    # Extends public test_single_nine: another allowed one-element input.
    def test_single_seven(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("seven"), "seven")

    # Extends public test_single_nine: another allowed one-element input.
    def test_single_eight(self):
        # A single value has only one possible sorted order.
        self.assertEqual(sort_numbers("eight"), "eight")
