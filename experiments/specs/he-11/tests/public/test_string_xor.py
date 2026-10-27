import unittest

from src.solution import string_xor


# Inputs are always two equal-length strings of '0'/'1'. Expected values are
# chosen so the result never has a leading '0' (except the one-character '0'),
# so they hold whether or not leading zeros are kept.
class TestStringXor(unittest.TestCase):
    # Docstring example.
    def test_docstring_example(self):
        self.assertEqual(string_xor('010', '110'), '100')

    # Rule: the result is a string.
    def test_returns_str(self):
        self.assertIsInstance(string_xor('010', '110'), str)

    def test_returns_str_single_bit(self):
        self.assertIsInstance(string_xor('0', '1'), str)

    # Rule: bitwise XOR, typical case.
    # By hand, column by column: 1^0=1, 1^1=0, 0^0=0, 0^1=1 -> '1001'.
    def test_xor_mixed_bits(self):
        self.assertEqual(string_xor('1100', '0101'), '1001')

    # Boundary: single-bit inputs, the full XOR truth table.
    def test_single_bits_zero_zero(self):
        self.assertEqual(string_xor('0', '0'), '0')

    def test_single_bits_zero_one(self):
        self.assertEqual(string_xor('0', '1'), '1')

    def test_single_bits_one_zero(self):
        self.assertEqual(string_xor('1', '0'), '1')

    def test_single_bits_one_one(self):
        self.assertEqual(string_xor('1', '1'), '0')

    # Rule: XOR is 1 where the bits differ. Typical: complementary inputs.
    # By hand: every column differs, so every result bit is 1.
    def test_complementary_inputs_give_all_ones(self):
        self.assertEqual(string_xor('1010', '0101'), '1111')

    # Boundary: long complementary inputs (100 bits), every column differs.
    def test_long_complementary_inputs(self):
        self.assertEqual(string_xor('10' * 50, '01' * 50), '1' * 100)

    # XOR is commutative, so swapping the arguments gives the same result.
    # By hand: 1^0=1, 0^1=1, 1^1=0 -> '110' both ways.
    def test_swapping_arguments(self):
        self.assertEqual(string_xor('101', '011'), '110')
        self.assertEqual(string_xor('011', '101'), '110')


if __name__ == '__main__':
    unittest.main()
