# spec.md gives only the title and starter code. The cases follow the
# LeetCode problem of the same title (3485): for each i, remove words[i]
# and return the longest common prefix length among any k strings at
# distinct indices of what remains; 0 if fewer than k strings remain.
# Constraints: 1 <= k <= len(words) <= 1e5, 1 <= len(words[i]) <= 1e4,
# lowercase letters, total length <= 1e5.
import unittest
from itertools import combinations

from sandbox.check import run_case


def brute(words, k):
    """Try every k-subset of the remaining words; only for tiny inputs."""
    def lcp(group):
        n = 0
        while all(n < len(w) for w in group) and len({w[n] for w in group}) == 1:
            n += 1
        return n

    out = []
    for i in range(len(words)):
        rest = words[:i] + words[i + 1:]
        out.append(max((lcp(g) for g in combinations(rest, k)), default=0))
    return out


class TestLongestCommonPrefix(unittest.TestCase):
    def test_example_1(self):
        run_case(self, fn="longestCommonPrefix",
                 args=[["jump", "run", "run", "jump", "run"], 2],
                 expected=[3, 4, 4, 3, 4])

    def test_example_2(self):
        run_case(self, fn="longestCommonPrefix",
                 args=[["dog", "racer", "car"], 2], expected=[0, 0, 0])

    def test_single_word(self):
        # Removing the only word leaves 0 < k = 1 strings.
        run_case(self, fn="longestCommonPrefix", args=[["a"], 1], expected=[0])

    def test_k_equals_length(self):
        # Every removal leaves n - 1 < k strings.
        run_case(self, fn="longestCommonPrefix",
                 args=[["abc", "abc", "abc"], 3], expected=[0, 0, 0])

    def test_k_one_is_longest_other_word(self):
        # With k = 1 a single word is its own prefix: the longest remaining word.
        run_case(self, fn="longestCommonPrefix",
                 args=[["a", "bb", "ccc"], 1], expected=[3, 3, 2])

    def test_mixed_k2(self):
        words = ["abc", "abd", "ab", "xyz", "abc"]
        run_case(self, fn="longestCommonPrefix", args=[words, 2],
                 expected=brute(words, 2))  # [2, 3, 3, 3, 2]

    def test_mixed_k3(self):
        words = ["abc", "abd", "ab", "xyz", "abc"]
        run_case(self, fn="longestCommonPrefix", args=[words, 3],
                 expected=brute(words, 3))  # [2, 2, 2, 2, 2]

    def test_max_length_words(self):
        # Three identical words of maximal length 1e4; any two share all of it.
        w = "a" * 10000
        run_case(self, fn="longestCommonPrefix", args=[[w, w, w], 2],
                 expected=[10000] * 3)

    def test_max_count_k2(self):
        # 1e5 copies of "a": any two remaining share prefix "a".
        run_case(self, fn="longestCommonPrefix", args=[["a"] * 100000, 2],
                 expected=[1] * 100000)

    def test_max_count_k_equals_n(self):
        # k = n = 1e5: each removal leaves too few strings.
        run_case(self, fn="longestCommonPrefix",
                 args=[["a"] * 100000, 100000], expected=[0] * 100000)


if __name__ == "__main__":
    unittest.main()
