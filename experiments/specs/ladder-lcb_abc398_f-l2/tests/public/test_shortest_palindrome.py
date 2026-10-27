# Public cases for "ABCBA": print the shortest palindrome that has S as a
# prefix.
#
# Although the statement accepts any shortest palindrome, there is exactly
# one: a palindrome T of length n + k (0 <= k < n) with prefix S has its last
# k characters fixed as reverse(S[:k]), so T = S + reverse(S[:k]), and T is a
# palindrome exactly when S[k:] is. The shortest answer therefore uses the
# smallest such k, and the exact-match comparison below is sound.
#
# spec.md gives no samples or constraints; the strings used here are short
# runs of uppercase letters, the alphabet the title ABCBA suggests.
import unittest

from sandbox.check import run_case


def brute(s):
    # Smallest k with S[k:] a palindrome, then mirror S[:k] onto the end
    # (see the uniqueness argument above). k = n - 1 always works.
    for k in range(len(s)):
        tail = s[k:]
        if tail == tail[::-1]:
            return s + s[:k][::-1]
    raise AssertionError("unreachable for non-empty s")


class TestShortestPalindrome(unittest.TestCase):
    def test_title_abc(self):
        # The title: ABC needs BA appended; ABC, ABCB, ABCC... none shorter
        # is a palindrome since C != A and ABCB is not one.
        run_case(self, stdin="ABC\n", expected="ABCBA")

    def test_single_character(self):
        # Smallest input: a one-letter string is already a palindrome.
        run_case(self, stdin="Z\n", expected="Z")

    def test_single_character_a(self):
        run_case(self, stdin="A\n", expected="A")

    def test_tree(self):
        # TREE: suffix EE (k = 2) is the first palindromic suffix, so append
        # reverse("TR") = "RT".
        run_case(self, stdin="TREE\n", expected="TREERT")

    def test_two_distinct(self):
        # AB is not a palindrome; suffix B is, so append A.
        run_case(self, stdin="AB\n", expected="ABA")

    def test_two_equal(self):
        run_case(self, stdin="AA\n", expected="AA")

    def test_already_even_palindrome(self):
        # S itself is a palindrome (k = 0): nothing is appended.
        run_case(self, stdin="ABBA\n", expected="ABBA")

    def test_already_odd_palindrome(self):
        run_case(self, stdin="RACECAR\n", expected="RACECAR")

    def test_all_distinct_longest_answer(self):
        # No suffix longer than one letter is a palindrome, so the answer
        # has the maximum length 2n - 1.
        run_case(self, stdin="ABCDE\n", expected="ABCDEDCBA")

    def test_run_then_different_letter(self):
        # AAAB: only the suffix B is palindromic, append reverse("AAA").
        run_case(self, stdin="AAAB\n", expected="AAABAAA")

    def test_different_letter_then_run(self):
        # BAAA: suffix AAA (k = 1) is palindromic, append B.
        run_case(self, stdin="BAAA\n", expected="BAAAB")

    def test_palindromic_suffix_not_maximal_prefix(self):
        # ABAC: suffixes BAC, AC are not palindromes; C is (k = 3).
        run_case(self, stdin="ABAC\n", expected="ABACABA")

    def test_long_middle_palindrome(self):
        # XABACABA: suffix ABACABA (k = 1) is a palindrome, append X.
        run_case(self, stdin="XABACABA\n", expected="XABACABAX")

    def test_longer_run_then_letter(self):
        # Expected computed by brute() above: 1999 A's then B has only the
        # single-letter palindromic suffix, giving length 3999.
        s = "A" * 1999 + "B"
        expected = brute(s)
        self.assertEqual(expected, s + "A" * 1999)
        run_case(self, stdin=s + "\n", expected=expected)

    def test_longer_mixed_string(self):
        # Expected computed by brute() above on a fixed deterministic
        # string of 2000 uppercase letters.
        s = "".join(chr(ord("A") + (i * i + 3 * i) % 26) for i in range(2000))
        run_case(self, stdin=s + "\n", expected=brute(s))


if __name__ == "__main__":
    unittest.main()
