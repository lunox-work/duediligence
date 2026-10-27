import itertools
import random
import unittest

from src.solution import string_xor


def _xor_by_column(a, b):
    # Obviously correct reference: compare the strings column by column,
    # '1' where the bits differ and '0' where they agree.
    return ''.join('1' if x != y else '0' for x, y in zip(a, b))


# Every input is two non-empty, equal-length strings of '0'/'1' whose first
# characters differ (or are single characters), so the result never starts
# with '0' unless it is exactly '0'. Whether leading zeros are kept, and what
# happens for unequal or empty inputs, is left open by the docstring and is
# not tested here.
class TestStringXorPrivate(unittest.TestCase):
    # Extends test_docstring_example: a result that is not a palindrome, so an
    # implementation that builds the result in reverse order fails.
    # By hand: 1^0=1, 1^1=0, 0^1=1, 1^1=0, 0^0=0, 0^0=0 -> '101000'.
    def test_non_palindromic_result(self):
        self.assertEqual(string_xor('110100', '011100'), '101000')

    # Extends test_docstring_example: other three-bit values.
    # By hand: 0^1=1, 1^1=0, 1^0=1 -> '101'.
    def test_three_bits_other_values(self):
        self.assertEqual(string_xor('011', '110'), '101')

    # Extends test_returns_str: the result of a longer input is a str too.
    def test_returns_str_long(self):
        self.assertIsInstance(string_xor('1' * 50, '0' * 50), str)

    # Extends test_returns_str_single_bit: str for an equal-bits input.
    def test_returns_str_single_equal_bits(self):
        self.assertIsInstance(string_xor('1', '1'), str)

    # Extends test_xor_mixed_bits: inputs that are not complements, with both
    # differing and agreeing columns, so "complement of a" or "all ones" fails.
    # By hand: 1^0=1, 0^0=0, 1^1=0, 1^0=1, 0^1=1 -> '10011'.
    def test_mixed_bits_five(self):
        self.assertEqual(string_xor('10110', '00101'), '10011')

    # Extends test_xor_mixed_bits: agreeing ones must give 0 (OR would give 1).
    # By hand: 1^0=1, 1^1=0, 1^1=0, 1^1=0 -> '1000'.
    def test_agreeing_ones_give_zero(self):
        self.assertEqual(string_xor('1111', '0111'), '1000')

    # Extends test_xor_mixed_bits: agreeing zeros must give 0, differing give 1
    # (AND would give 0 everywhere).
    # By hand: 1^0=1, 0^0=0, 0^1=1, 0^0=0 -> '1010'.
    def test_agreeing_zeros_give_zero(self):
        self.assertEqual(string_xor('1000', '0010'), '1010')

    # Extends test_xor_mixed_bits: a is all ones, so the result is the
    # complement of b. By hand: 1^0=1, 1^1=0, 1^0=1, 1^1=0 -> '1010'.
    def test_all_ones_a(self):
        self.assertEqual(string_xor('1111', '0101'), '1010')

    # Extends test_xor_mixed_bits: b is all zeros, so the result equals a.
    def test_xor_with_zeros_is_identity(self):
        self.assertEqual(string_xor('1011001', '0000000'), '1011001')

    # Extends test_single_bits_*: same-length multi-bit inputs that differ only
    # in the first column. By hand: 1^0=1 then 1^1/0^0=0 -> '1000000'.
    def test_differ_only_in_first_column(self):
        self.assertEqual(string_xor('1011010', '0011010'), '1000000')

    # Extends test_single_bits_one_one: equal single bits give '0'.
    # Calls it twice to cover both equal pairs in one method of its own name.
    def test_single_equal_bits_both(self):
        self.assertEqual(string_xor('0', '0'), '0')
        self.assertEqual(string_xor('1', '1'), '0')

    # Extends test_complementary_inputs_give_all_ones: complements that are
    # not alternating patterns. Every column differs -> all ones.
    def test_complementary_non_alternating(self):
        self.assertEqual(string_xor('1100101', '0011010'), '1111111')

    # Extends test_long_complementary_inputs: long inputs where most columns
    # agree. By hand: first column differs, the remaining 199 agree -> '1'
    # followed by 199 zeros.
    def test_long_mostly_agreeing(self):
        a = '1' + '10' * 99 + '1'
        b = '0' + '10' * 99 + '1'
        self.assertEqual(string_xor(a, b), '1' + '0' * 199)

    # Extends test_long_complementary_inputs: 1000 random bits, expected value
    # computed column by column with _xor_by_column. First bits forced to
    # differ so the result starts with '1'.
    def test_long_random(self):
        rng = random.Random(11)
        a = '1' + ''.join(rng.choice('01') for _ in range(999))
        b = '0' + ''.join(rng.choice('01') for _ in range(999))
        self.assertEqual(string_xor(a, b), _xor_by_column(a, b))

    # Extends test_long_complementary_inputs: a pattern with period 3, so
    # shortcuts keyed to the alternating '10'/'01' inputs fail.
    # Columns per period: 1^0=1, 1^1=0, 0^1=1 -> '101' repeated.
    def test_long_period_three(self):
        self.assertEqual(string_xor('110' * 40, '011' * 40), '101' * 40)

    # Extends test_swapping_arguments: commutativity on other, longer inputs;
    # expected value computed column by column with _xor_by_column.
    def test_swapping_arguments_longer(self):
        a, b = '10010111', '01110100'
        expected = _xor_by_column(a, b)  # '11100011'
        self.assertEqual(expected, '11100011')
        self.assertEqual(string_xor(a, b), expected)
        self.assertEqual(string_xor(b, a), expected)

    # Exhaustive: every pair of equal-length strings of length 1..6 whose
    # first bits differ, checked against _xor_by_column. Defeats any lookup
    # table tuned to the visible cases.
    def test_exhaustive_short_inputs(self):
        for n in range(1, 7):
            for tail_a in itertools.product('01', repeat=n - 1):
                for tail_b in itertools.product('01', repeat=n - 1):
                    a = '1' + ''.join(tail_a)
                    b = '0' + ''.join(tail_b)
                    expected = _xor_by_column(a, b)
                    self.assertEqual(string_xor(a, b), expected, (a, b))
                    self.assertEqual(string_xor(b, a), expected, (b, a))

    # Inputs that start with '0' in one argument: the leading '0' of an input
    # is a real bit. By hand: 0^1=1, 1^1=0, 1^0=1, 0^1=1 -> '1011'.
    def test_input_with_leading_zero(self):
        self.assertEqual(string_xor('0110', '1101'), '1011')


if __name__ == '__main__':
    unittest.main()
