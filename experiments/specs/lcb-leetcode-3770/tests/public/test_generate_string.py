import unittest

from sandbox.check import run_case

FN = "generateString"


class TestGenerateString(unittest.TestCase):
    # Samples from the statement.

    def test_example_1(self):
        run_case(self, fn=FN, args=["TFTF", "ab"], expected="ababa")

    def test_example_2(self):
        run_case(self, fn=FN, args=["TFTF", "abc"], expected="")

    def test_example_3(self):
        run_case(self, fn=FN, args=["F", "d"], expected="a")

    # Small cases. Each expected value was derived by hand and confirmed by
    # exhaustive search over every string of length n + m - 1 on 'a'..'z'.

    def test_single_t_single_char(self):
        # word must equal str2.
        run_case(self, fn=FN, args=["T", "a"], expected="a")

    def test_single_t_largest_char(self):
        # word must equal str2; 'z' is the largest allowed character.
        run_case(self, fn=FN, args=["T", "z"], expected="z")

    def test_single_f_equal_to_a(self):
        # word != "a", so the smallest is "b".
        run_case(self, fn=FN, args=["F", "a"], expected="b")

    def test_single_f_largest_char(self):
        # word != "z", so "a" works.
        run_case(self, fn=FN, args=["F", "z"], expected="a")

    def test_all_f_m1_str2_a(self):
        # No character may be 'a'.
        run_case(self, fn=FN, args=["FFFF", "a"], expected="bbbb")

    def test_overlapping_t_conflict(self):
        # word[0..1] == "ab" and word[1..2] == "ab" need word[1] == 'b' and 'a'.
        run_case(self, fn=FN, args=["TT", "ab"], expected="")

    def test_overlapping_t_consistent(self):
        run_case(self, fn=FN, args=["TT", "aa"], expected="aaa")

    def test_f_window_fully_fixed_by_t(self):
        # The T windows at 0 and 2 force "aaaa", so window 1 equals "aa".
        run_case(self, fn=FN, args=["TFT", "aa"], expected="")

    def test_all_f_all_a_word_ok(self):
        # "aaaa" contains no "ab".
        run_case(self, fn=FN, args=["FFF", "ab"], expected="aaaa")

    def test_f_after_t_forces_last_char(self):
        # word[0..1] == "aa", word[1..2] != "aa" forces word[2] != 'a'.
        run_case(self, fn=FN, args=["TF", "aa"], expected="aab")

    def test_f_before_t_forces_first_char(self):
        # word[1..2] == "aa", word[0..1] != "aa" forces word[0] != 'a'.
        run_case(self, fn=FN, args=["FT", "aa"], expected="baa")

    def test_f_after_t_already_different(self):
        # word[0..1] == "ab"; word[1] == 'b' already makes window 1 differ.
        run_case(self, fn=FN, args=["TF", "ab"], expected="aba")

    def test_f_before_t_already_different(self):
        # word[1..2] == "ab"; word[1] == 'a' already makes window 0 differ.
        run_case(self, fn=FN, args=["FT", "ab"], expected="aab")

    def test_t_windows_overlap_in_one_char(self):
        # T at 0 and 2 give "ababa"; window 1 is "bab" != "aba".
        run_case(self, fn=FN, args=["TFT", "aba"], expected="ababa")

    def test_all_f_needs_periodic_breaks(self):
        # No window of length 2 may be "aa": greedy smallest gives "abab".
        run_case(self, fn=FN, args=["FFF", "aa"], expected="abab")

    # Largest sizes: n = 10^4, m = 500.

    def test_max_all_t_constant_str2(self):
        # Every window must be all 'a', so the whole word is 'a'.
        run_case(self, fn=FN, args=["T" * 10**4, "a" * 500], expected="a" * 10499)

    def test_max_all_t_shift_conflict(self):
        # T at 0 and 1 need str2[j + 1] == str2[j] for all j, false for "abab...".
        run_case(self, fn=FN, args=["T" * 10**4, "ab" * 250], expected="")

    def test_max_all_f_str2_z(self):
        # All-'a' word contains no window equal to "zzz...".
        run_case(self, fn=FN, args=["F" * 10**4, "z" * 500], expected="a" * 10499)

    def test_max_all_f_str2_all_a(self):
        # Every length-500 window needs a non-'a'. Choosing the smallest
        # feasible character left to right puts 'a' everywhere except where a
        # window would become all 'a', i.e. 'b' at every index i with
        # i % 500 == 499 (same pattern as "FFF", "aa" -> "abab" above).
        expected = "".join("b" if i % 500 == 499 else "a" for i in range(10499))
        run_case(self, fn=FN, args=["F" * 10**4, "a" * 500], expected=expected)


if __name__ == "__main__":
    unittest.main()
