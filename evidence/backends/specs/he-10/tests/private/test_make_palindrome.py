import unittest

from src.solution import make_palindrome


class TestMakePalindromePrivate(unittest.TestCase):
    def test_empty_string(self):
        # Extends test_docstring_empty_string: retain the exact empty boundary.
        # There is no prefix or suffix to append.
        self.assertEqual(make_palindrome(""), "")

    # Extends test_docstring_empty_string with nonempty whitespace, which must
    # not be treated as empty by stripping before the palindrome check.
    def test_whitespace_only_palindrome(self):
        # Three spaces already equal their reversal.
        self.assertEqual(make_palindrome("   "), "   ")

    # Extends test_single_character_needs_no_append with an embedded-control
    # character as the entire input; it is still a one-character palindrome.
    def test_single_nul_character(self):
        self.assertEqual(make_palindrome("\x00"), "\x00")

    # Extends test_single_character_needs_no_append beyond ASCII and the BMP.
    def test_single_emoji(self):
        # This escape denotes exactly one Python string character.
        self.assertEqual(make_palindrome("\U0001f680"), "\U0001f680")

    # Extends test_whole_odd_length_palindrome_needs_no_append with a longer
    # palindrome whose internal letters are not all distinct.
    def test_longer_whole_odd_palindrome(self):
        # r-o-t-a-v-a-t-o-r reads identically in both directions.
        self.assertEqual(make_palindrome("rotavator"), "rotavator")

    # Extends test_whole_even_length_palindrome_needs_no_append beyond length 4.
    def test_longer_whole_even_palindrome(self):
        # r-e-d-d-e-r reads identically in both directions.
        self.assertEqual(make_palindrome("redder"), "redder")

    def test_many_identical_characters(self):
        # All 64 characters match their mirrors; append nothing.
        self.assertEqual(make_palindrome("z" * 64), "z" * 64)

    # Extends test_docstring_cat at the shortest nonpalindromic input length.
    def test_two_distinct_characters(self):
        # Only suffix "q" is palindromic; reverse prefix "p".
        self.assertEqual(make_palindrome("pq"), "pqp")

    # Extends test_docstring_cat with matching endpoints that do not make the
    # whole string a palindrome; checking just the endpoints is insufficient.
    def test_matching_endpoints_with_nonpalindromic_middle(self):
        # Only suffix "a" qualifies; reverse prefix "abcd" to "dcba".
        self.assertEqual(make_palindrome("abcda"), "abcdadcba")

    # Extends test_docstring_cata with a longer suffix and two appended letters.
    def test_long_odd_suffix_with_two_character_prefix(self):
        # "abacaba" is the longest palindromic suffix; reverse "42" to "24".
        self.assertEqual(make_palindrome("42abacaba"), "42abacaba24")

    def test_odd_suffix_with_longer_prefix(self):
        # "aba" is the longest palindromic suffix; reverse "wxyz" to "zyxw".
        self.assertEqual(make_palindrome("wxyzaba"), "wxyzabazyxw")

    # Extends test_even_length_palindromic_suffix with a six-character suffix
    # and a prefix whose reversal changes its order.
    def test_six_character_even_suffix(self):
        # "abccba" is the longest palindromic suffix; reverse "dog" to "god".
        self.assertEqual(make_palindrome("dogabccba"), "dogabccbagod")

    # Extends test_longest_of_multiple_palindromic_suffixes with the nested
    # suffixes "a", "aba", and "abacaba".
    def test_longest_of_nested_odd_suffixes(self):
        # Choose "abacaba", leaving prefix "uv" to reverse.
        self.assertEqual(make_palindrome("uvabacaba"), "uvabacabavu")

    # Extends test_longest_of_multiple_palindromic_suffixes with competing
    # even suffixes, including "abccba" and "abccbaabccba".
    def test_longest_of_nested_even_suffixes(self):
        # The 12-character palindrome leaves only prefix "uv" to reverse.
        self.assertEqual(make_palindrome("uvabccbaabccba"), "uvabccbaabccbavu")

    def test_suffix_occupies_almost_entire_input(self):
        # All 31 b's form the longest suffix; just the initial "a" is appended.
        self.assertEqual(make_palindrome("a" + "b" * 31), "a" + "b" * 31 + "a")

    # Extends test_only_final_character_is_palindromic_suffix with a long
    # palindromic prefix that must not be used in place of a suffix.
    def test_palindromic_prefix_is_not_a_suffix(self):
        # Only "p" is a palindromic suffix; reverse "levelu" to "ulevel".
        self.assertEqual(make_palindrome("levelup"), "levelupulevel")

    def test_internal_palindrome_is_not_a_suffix(self):
        # "racecar" is internal; the unique final "s" is the only palindromic
        # suffix, so reverse all of prefix "qracecar" to "racecarq".
        self.assertEqual(make_palindrome("qracecars"), "qracecarsracecarq")

    def test_duplicate_letters_in_prefix(self):
        # Only "b" is a palindromic suffix; both prefix a's must be appended.
        self.assertEqual(make_palindrome("aab"), "aabaa")

    def test_alternating_repeated_pattern(self):
        # "babab" is the longest palindromic suffix; append the initial "a".
        self.assertEqual(make_palindrome("ababab"), "abababa")

    # Extends test_uppercase_and_lowercase_are_distinct with three characters;
    # case folding would incorrectly treat the entire input as a palindrome.
    def test_case_sensitive_three_character_input(self):
        # Only suffix "A" qualifies; reverse prefix "aB" to "Ba".
        self.assertEqual(make_palindrome("aBA"), "aBABa")

    # Extends test_spaces_are_preserved_in_reversed_prefix with leading and
    # internal whitespace of different kinds.
    def test_tab_and_newline_in_prefix(self):
        # Only suffix "b" qualifies; reverse prefix "\ta\n" to "\na\t".
        self.assertEqual(make_palindrome("\ta\nb"), "\ta\nb\na\t")

    # Extends test_spaces_are_preserved_in_reversed_prefix with a whitespace
    # suffix that is itself the longest palindrome.
    def test_two_trailing_spaces_form_even_suffix(self):
        # Suffix "  " qualifies; reverse prefix "go" to "og".
        self.assertEqual(make_palindrome("go  "), "go  og")

    def test_punctuation_is_reversed_as_characters(self):
        # Only suffix "!" qualifies; reverse prefix "a,b" to "b,a".
        self.assertEqual(make_palindrome("a,b!"), "a,b!b,a")

    def test_digits_with_even_suffix(self):
        # Suffix "00" is the longest palindrome; reverse "12" to "21".
        self.assertEqual(make_palindrome("1200"), "120021")

    def test_minus_sign_is_an_ordinary_character(self):
        # This is a string, not a number. Suffix "2" leaves prefix "-1".
        self.assertEqual(make_palindrome("-12"), "-121-")

    # Extends test_non_ascii_characters with a repeated non-ASCII suffix.
    def test_non_ascii_even_suffix(self):
        # Suffix "犬犬" qualifies; reverse the one-character prefix "猫".
        self.assertEqual(make_palindrome("猫犬犬"), "猫犬犬猫")

    # Extends test_non_ascii_characters with supplementary-plane characters
    # around an ASCII character; reverse Python characters, not encoded bytes.
    def test_multiple_emoji_with_distinct_endpoints(self):
        # Only the final emoji qualifies; reverse prefix "🚀a" to "a🚀".
        self.assertEqual(make_palindrome("🚀a🙂"), "🚀a🙂a🚀")

    def test_combining_mark_is_a_separate_string_character(self):
        # Exact reversal treats U+0301 as a character. Its one-character
        # suffix leaves prefix "e"; append "e" without Unicode normalization.
        self.assertEqual(make_palindrome("e\u0301"), "e\u0301e")

    def test_embedded_nul_is_preserved(self):
        # Only "b" qualifies; reverse prefix "a\x00" to "\x00a".
        self.assertEqual(make_palindrome("a\x00b"), "a\x00b\x00a")

    # Extends test_only_final_character_is_palindromic_suffix with 257 input
    # characters, a repeated prefix, and no fixed small limit on the append.
    def test_long_repeated_prefix_before_unique_final_character(self):
        # "c" occurs only at the end, so no longer suffix can be a palindrome.
        # All 256 prefix characters must therefore be reversed and appended.
        prefix = "ab" * 128
        self.assertEqual(make_palindrome(prefix + "c"), prefix + "c" + "ba" * 128)
