import unittest

from src.solution import string_xor


class TestStringXor(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(string_xor('010', '110'), '100')

    def test_single_zero_xor_zero(self):
        # Equal bits give 0: 0 XOR 0 = 0.
        self.assertEqual(string_xor('0', '0'), '0')

    def test_single_zero_xor_one(self):
        # Different bits give 1: 0 XOR 1 = 1.
        self.assertEqual(string_xor('0', '1'), '1')

    def test_single_one_xor_zero(self):
        # Different bits give 1: 1 XOR 0 = 1.
        self.assertEqual(string_xor('1', '0'), '1')

    def test_single_one_xor_one(self):
        # Equal bits give 0: 1 XOR 1 = 0.
        self.assertEqual(string_xor('1', '1'), '0')

    def test_identical_mixed_strings(self):
        # Every corresponding pair is equal, so all five result bits are 0.
        self.assertEqual(string_xor('10101', '10101'), '00000')

    def test_complementary_strings(self):
        # Every corresponding pair differs, so all four result bits are 1.
        self.assertEqual(string_xor('1010', '0101'), '1111')

    def test_zero_left_operand(self):
        # XOR with 0 preserves each bit: 1, 0, 1, 1, 0.
        self.assertEqual(string_xor('00000', '10110'), '10110')

    def test_zero_right_operand(self):
        # XOR with 0 preserves each bit, including the two leading zeros.
        self.assertEqual(string_xor('00101', '00000'), '00101')

    def test_mixed_bits_with_leading_zero_result(self):
        # Pairwise XOR gives 1^1=0, 0^1=1, 1^0=1, 1^0=1, 0^1=1.
        self.assertEqual(string_xor('10110', '11001'), '01111')
