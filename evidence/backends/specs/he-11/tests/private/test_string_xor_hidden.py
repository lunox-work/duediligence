import itertools
import unittest

from src.solution import string_xor


class TestStringXorHidden(unittest.TestCase):
    # Extends test_docstring_example: different values, length, and bit order.
    def test_six_bit_mixed_operands(self):
        # Corresponding unequal bits give 1: 101011 XOR 011101 = 110110.
        self.assertEqual(string_xor("101011", "011101"), "110110")

    # Extends test_single_zero_xor_zero: repeated zero pairs, beyond one bit.
    def test_many_zero_pairs(self):
        result = string_xor("0" * 73, "0" * 73)
        # Every pair is 00. Accept any nonempty all-zero representation,
        # since the docstring does not specify leading-zero formatting.
        self.assertIsInstance(result, str)
        self.assertEqual(set(result), {"0"})

    # Extends test_single_zero_xor_one: 01 alongside all other bit pairs.
    def test_zero_one_in_mixed_context(self):
        # The pairs are 01, 00, 11, 10, giving 1001.
        self.assertEqual(string_xor("0011", "1010"), "1001")

    # Extends test_single_one_xor_zero: 10 alongside equal bit pairs.
    def test_one_zero_in_mixed_context(self):
        # The pairs are 10, 11, 01, 00, giving 1010.
        self.assertEqual(string_xor("1100", "0110"), "1010")

    # Extends test_single_one_xor_one: a long run must still cancel to zero.
    def test_many_one_pairs(self):
        result = string_xor("1" * 131, "1" * 131)
        # Each 11 pair contributes zero; no output width is assumed.
        self.assertIsInstance(result, str)
        self.assertEqual(set(result), {"0"})

    # Extends test_identical_mixed_strings: long, irregular repeated inputs.
    def test_long_identical_mixed_operands(self):
        operand = "0010111001011" * 37
        result = string_xor(operand, operand)
        # Every bit cancels itself. This checks zero without requiring padding.
        self.assertIsInstance(result, str)
        self.assertEqual(set(result), {"0"})

    # Extends test_complementary_strings: odd length and irregular runs.
    def test_irregular_complements(self):
        operand = "0001110100110" * 5 + "01"
        complement = "".join("1" if bit == "0" else "0" for bit in operand)
        # Every corresponding pair differs, so every output bit is one.
        self.assertEqual(string_xor(operand, complement), "1" * len(operand))

    # Extends test_zero_left_operand: a larger operand with long zero runs.
    def test_long_zero_left_identity(self):
        operand = "1000000011010010" * 19 + "100"
        # Each 0 XOR bit is that bit; the result starts with 1.
        self.assertEqual(string_xor("0" * len(operand), operand), operand)

    # Extends test_zero_right_operand: reverse identity at a larger size.
    def test_long_zero_right_identity(self):
        operand = "10110000000001101" * 23
        # Each bit XOR 0 is that bit; the result starts with 1.
        self.assertEqual(string_xor(operand, "0" * len(operand)), operand)

    # Extends test_mixed_bits_with_leading_zero_result: mixed interior zeros.
    def test_mixed_result_with_equal_initial_bits(self):
        result = string_xor("11001010", "10100111")
        # Pairwise XOR is 01101101, whose value is 64+32+8+4+1 = 109.
        # Check the value and binary alphabet, leaving padding unspecified.
        self.assertIsInstance(result, str)
        self.assertEqual(set(result) - {"0", "1"}, set())
        self.assertEqual(int(result, 2), 109)

    # Extends test_complementary_strings: ones invert a nonuniform operand.
    def test_all_ones_inverts_each_bit(self):
        # 1 XOR 0 = 1 and 1 XOR 1 = 0 at each position.
        self.assertEqual(string_xor("111111111", "001101001"), "110010110")

    # Extends test_docstring_example: exchanging operands keeps mixed results.
    def test_mixed_operands_in_both_orders(self):
        # Both orders have pairwise result 110110, including interior zeros.
        self.assertEqual(string_xor("101011", "011101"), "110110")
        self.assertEqual(string_xor("011101", "101011"), "110110")

    # Extends test_mixed_bits_with_leading_zero_result: preserve bit positions.
    def test_only_first_and_last_bits_differ(self):
        # The first and last pairs differ; all 127 interior pairs are 00.
        self.assertEqual(
            string_xor("1" + "0" * 128, "0" * 128 + "1"),
            "1" + "0" * 127 + "1",
        )

    # Extends test_identical_mixed_strings: one changed bit in a long input.
    def test_long_operands_differ_only_at_first_bit(self):
        operand = "00101101" * 257
        changed = "1" + operand[1:]
        # Exactly the first pair differs; the remaining 2055 pairs cancel.
        self.assertEqual(
            string_xor(operand, changed), "1" + "0" * (len(operand) - 1)
        )

    # Extends test_mixed_bits_with_leading_zero_result: a single low bit differs.
    def test_long_operands_differ_only_at_last_bit(self):
        operand = "10100110" * 128
        changed = operand[:-1] + "1"
        result = string_xor(operand, changed)
        # Only the least significant bit differs, so the numeric result is 1.
        self.assertIsInstance(result, str)
        self.assertEqual(set(result) - {"0", "1"}, set())
        self.assertEqual(int(result, 2), 1)

    # Extends test_docstring_example: equal one-counts need not cancel.
    def test_equal_population_different_positions(self):
        # The pairs give 1,0,1,0,0,1,0,1; both inputs contain four ones.
        self.assertEqual(string_xor("11110000", "01010101"), "10100101")

    # Extends all four test_single_* cases: exhaust the contexts around them.
    def test_all_five_bit_pairs_with_differing_first_bits(self):
        truth_table = {("0", "0"): "0", ("0", "1"): "1",
                       ("1", "0"): "1", ("1", "1"): "0"}
        tails = ["".join(bits) for bits in itertools.product("01", repeat=4)]
        # Brute force all 512 pairs with opposite first bits. The four-bit
        # tails include every ordered bit pair in every position. Each result
        # starts with 1, so no leading-zero representation is prescribed.
        for first in "01":
            opposite = "1" if first == "0" else "0"
            for left_tail in tails:
                for right_tail in tails:
                    left = first + left_tail
                    right = opposite + right_tail
                    expected = "".join(truth_table[pair] for pair in zip(left, right))
                    self.assertEqual(string_xor(left, right), expected, (left, right))
