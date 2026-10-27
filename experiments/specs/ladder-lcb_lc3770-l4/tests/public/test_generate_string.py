# spec.md gives only the title and the starter signature. These cases
# follow LeetCode 3474 "Lexicographically Smallest Generated String",
# which that title and signature name:
#   word has length n + m - 1 (n = len(str1), m = len(str2)); for each i,
#   str1[i] == 'T' means word[i:i+m] == str2 and 'F' means it differs.
#   Return the lexicographically smallest such word, or "" if none exists.
#   1 <= n <= 10^4, 1 <= m <= 500, str1 is 'T'/'F', str2 is lowercase.
# Small non-sample answers were derived by hand and confirmed by a brute
# force over every lowercase string of length n + m - 1, in lex order.
import unittest

from sandbox.check import run_case


class TestGenerateString(unittest.TestCase):
    # Samples from the problem statement.
    def test_sample_1(self):
        run_case(self, fn="generateString", args=["TFTF", "ab"], expected="ababa")

    def test_sample_2(self):
        run_case(self, fn="generateString", args=["TFTF", "abc"], expected="")

    def test_sample_3(self):
        run_case(self, fn="generateString", args=["F", "d"], expected="a")

    # Smallest inputs: n = m = 1, so word is a single letter.
    def test_single_t(self):
        run_case(self, fn="generateString", args=["T", "a"], expected="a")

    def test_single_f_on_a_forces_b(self):
        # "a" is forbidden, so the next letter is the smallest.
        run_case(self, fn="generateString", args=["F", "a"], expected="b")

    def test_single_t_largest_letter(self):
        run_case(self, fn="generateString", args=["T", "z"], expected="z")

    def test_single_f_largest_letter(self):
        run_case(self, fn="generateString", args=["F", "z"], expected="a")

    # Small hand-derived cases (brute-force confirmed).
    def test_all_f_single_letter(self):
        # Every letter must be something other than 'a'.
        run_case(self, fn="generateString", args=["FFF", "a"], expected="bbb")

    def test_all_f_avoid_aa(self):
        # Length 3 with no "aa": "aaa" and "aab" fail, "aba" works.
        run_case(self, fn="generateString", args=["FF", "aa"], expected="aba")

    def test_overlapping_t_conflict(self):
        # word[1] would have to be both 'b' and 'a'.
        run_case(self, fn="generateString", args=["TT", "ab"], expected="")

    def test_overlapping_t_consistent(self):
        run_case(self, fn="generateString", args=["TT", "aa"], expected="aaa")

    def test_t_then_f(self):
        # word[0:2] == "aa", word[1:3] != "aa", so word[2] != 'a'.
        run_case(self, fn="generateString", args=["TF", "aa"], expected="aab")

    def test_f_then_t(self):
        # word[1:3] == "aa", word[0:2] != "aa", so word[0] != 'a'.
        run_case(self, fn="generateString", args=["FT", "aa"], expected="baa")

    def test_f_then_t_free_prefix(self):
        # word[1:3] == "ab"; word[0:2] == "aa" already differs from "ab".
        run_case(self, fn="generateString", args=["FT", "ab"], expected="aab")

    # Largest sizes: n = 10^4, m = 500.
    def test_max_all_t_largest_letter(self):
        run_case(self, fn="generateString",
                 args=["T" * 10000, "z" * 500], expected="z" * 10499)

    def test_max_all_t_conflict(self):
        # The windows at 0 and 1 need word[1] == 'b' and word[1] == 'a'.
        run_case(self, fn="generateString",
                 args=["T" * 10000, "ab" * 250], expected="")

    def test_max_all_f_no_run_of_500_a(self):
        # Every window of 500 needs a non-'a'. Going left to right, 'a' is
        # always allowed except where it would finish 500 a's in a row; a 'b'
        # there is the smallest choice and never blocks the rest. So 'b' sits
        # at each index i with i % 500 == 499, over 10499 letters.
        expected = "".join("b" if i % 500 == 499 else "a" for i in range(10499))
        run_case(self, fn="generateString",
                 args=["F" * 10000, "a" * 500], expected=expected)


if __name__ == "__main__":
    unittest.main()
