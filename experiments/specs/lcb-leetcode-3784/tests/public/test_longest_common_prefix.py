import unittest
from itertools import combinations

from sandbox.check import run_case


def lcp(strings):
    """Length of the common prefix of all the given strings."""
    n = 0
    shortest = min(len(s) for s in strings)
    while n < shortest and all(s[n] == strings[0][n] for s in strings):
        n += 1
    return n


def brute(words, k):
    """Straight from the statement: for each i, drop words[i], then take the
    best LCP over every choice of k distinct remaining indices (0 if fewer
    than k remain). Exponential, so used only on tiny inputs."""
    answer = []
    for i in range(len(words)):
        rest = words[:i] + words[i + 1:]
        if len(rest) < k:
            answer.append(0)
        else:
            answer.append(max(lcp(list(c)) for c in combinations(rest, k)))
    return answer


class TestLongestCommonPrefix(unittest.TestCase):
    def test_example_1(self):
        run_case(self, fn="longestCommonPrefix",
                 args=[["jump", "run", "run", "jump", "run"], 2],
                 expected=[3, 4, 4, 3, 4])

    def test_example_2(self):
        run_case(self, fn="longestCommonPrefix",
                 args=[["dog", "racer", "car"], 2],
                 expected=[0, 0, 0])

    def test_single_word(self):
        # Smallest input: removing the only word leaves 0 < k = 1 strings.
        run_case(self, fn="longestCommonPrefix", args=[["a"], 1], expected=[0])

    def test_k_equals_length(self):
        # Every removal leaves n - 1 < k strings, so every answer is 0.
        run_case(self, fn="longestCommonPrefix",
                 args=[["a", "a", "a"], 3], expected=[0, 0, 0])

    def test_k_one_two_words(self):
        # k = 1: a single chosen string's prefix is the whole string.
        # Remove "ab" -> "c" (1); remove "c" -> "ab" (2).
        words, k = ["ab", "c"], 1
        expected = [1, 2]
        self.assertEqual(brute(words, k), expected)
        run_case(self, fn="longestCommonPrefix", args=[words, k], expected=expected)

    def test_k_one_longest_remaining(self):
        # k = 1: answer[i] is the longest length among the other words.
        words, k = ["abc", "de", "fghij"], 1
        expected = [5, 5, 3]
        self.assertEqual(brute(words, k), expected)
        run_case(self, fn="longestCommonPrefix", args=[words, k], expected=expected)

    def test_partial_prefixes(self):
        # By hand: drop "abcd" -> best pair abce/abx = 2; drop "abce" -> 2;
        # drop "abx" -> abcd/abce = 3; drop "b" -> 3. Checked by brute force.
        words, k = ["abcd", "abce", "abx", "b"], 2
        expected = [2, 2, 3, 3]
        self.assertEqual(brute(words, k), expected)
        run_case(self, fn="longestCommonPrefix", args=[words, k], expected=expected)

    def test_k_three(self):
        # By hand: "ab" prefix is shared by 3 of {abc, abd, abe}; "abc" only by
        # abc/abcz. Drop any of abc/abd/abe -> only 2 of them left plus abcz
        # (which has prefix "ab" too) -> 2; drop "x" -> abc/abd/abe/abcz -> 2;
        # drop "abcz" -> abc/abd/abe -> 2. Checked by brute force.
        words, k = ["abc", "abd", "abe", "abcz", "x"], 3
        expected = [2, 2, 2, 2, 2]
        self.assertEqual(brute(words, k), expected)
        run_case(self, fn="longestCommonPrefix", args=[words, k], expected=expected)

    def test_removal_breaks_best_group(self):
        # By hand: "aaa" x2 gives 3 with k = 2 unless one of them is removed,
        # leaving "aaa","ab","b" -> best pair aaa/ab = 1. Checked by brute force.
        words, k = ["aaa", "ab", "aaa", "b"], 2
        expected = [1, 3, 1, 3]
        self.assertEqual(brute(words, k), expected)
        run_case(self, fn="longestCommonPrefix", args=[words, k], expected=expected)

    def test_max_word_length(self):
        # Two words of the maximum length 10^4 plus "b" (sum 20001 <= 10^5).
        # Removing either long word leaves no matching pair -> 0; removing "b"
        # leaves the two identical long words -> 10000.
        long_word = "a" * 10000
        run_case(self, fn="longestCommonPrefix",
                 args=[[long_word, long_word, "b"], 2],
                 expected=[0, 0, 10000])

    def test_max_count_k_two(self):
        # 10^5 copies of "a" (sum of lengths 10^5): any two remaining copies
        # share "a", so every answer is 1.
        n = 100000
        run_case(self, fn="longestCommonPrefix",
                 args=[["a"] * n, 2], expected=[1] * n)

    def test_max_count_k_equals_length(self):
        # k = words.length = 10^5: every removal leaves fewer than k -> all 0.
        n = 100000
        run_case(self, fn="longestCommonPrefix",
                 args=[["a"] * n, n], expected=[0] * n)


if __name__ == "__main__":
    unittest.main()
