# The statement in spec.md gives no sample cases, so every expected value
# below is either derived by hand (explained in the comment) or computed by
# `brute_force`, an exhaustive search over every reachable string.
#
# Facts used by the hand-derived large cases, both following directly from
# the definition of the operation:
#   * A contiguous valid substring is a run of consecutive sibling subtrees
#     of the bracket tree; the operation replaces it by its mirror image.
#     Mirroring never changes the tree considered as an unordered tree, so
#     every reachable string has the same unordered tree as S.
#   * For adjacent siblings A, B: reversing AB gives rev(B) rev(A); then
#     reversing rev(B) and rev(A) separately gives B A. So any two adjacent
#     siblings can be swapped, and the root's children can be put in any order.
# "()" and "(())" are their own mirror images and have no reorderable
# structure, so when S's root-level blocks are all "()" or "(())", the
# reachable strings are exactly the distinct orderings of those blocks.
import math
import unittest

from sandbox.check import run_case

MOD = 998244353


def is_valid(t):
    depth = 0
    for c in t:
        depth += 1 if c == "(" else -1
        if depth < 0:
            return False
    return depth == 0


def flip_reverse(t):
    return "".join(")" if c == "(" else "(" for c in reversed(t))


def brute_force(s):
    """Breadth-first search applying every allowed operation to every string
    found so far; returns the number of distinct strings reachable from s."""
    seen = {s}
    frontier = [s]
    n = len(s)
    while frontier:
        nxt = []
        for t in frontier:
            for l in range(n):
                for r in range(l + 2, n + 1, 2):
                    sub = t[l:r]
                    if is_valid(sub):
                        u = t[:l] + flip_reverse(sub) + t[r:]
                        if u not in seen:
                            seen.add(u)
                            nxt.append(u)
        frontier = nxt
    return len(seen) % MOD


def case(tc, s, expected):
    run_case(tc, stdin=f"{len(s)}\n{s}\n", expected=str(expected))


class TestReverseBrackets(unittest.TestCase):
    # Smallest input: the operation on "()" yields "()" again, so 1.
    def test_smallest_n2(self):
        case(self, "()", 1)

    # Brute force: reversing "(())" or its inner "()" leaves it unchanged.
    def test_nested_n4(self):
        case(self, "(())", brute_force("(())"))

    # Brute force: every valid substring of "()()" is "()" or "()()", both
    # unchanged by the operation.
    def test_two_pairs_n4(self):
        case(self, "()()", brute_force("()()"))

    # Brute force (by hand: "(())()" and "()(())", so 2).
    def test_block_swap_n6(self):
        self.assertEqual(brute_force("(())()"), 2)
        case(self, "(())()", 2)

    # The operation is a mirror image, not a plain reversal: the inner pair
    # "(())()" can become "()(())" inside the outer brackets. Brute force.
    def test_inner_swap_n8(self):
        case(self, "((())())", brute_force("((())())"))

    # Deeper asymmetric subtree that must be mirrored as a whole. Brute force.
    def test_asymmetric_subtree_n8(self):
        case(self, "(()())()", brute_force("(()())()"))

    # Three distinct root-level blocks. Brute force.
    def test_three_distinct_blocks_n10(self):
        case(self, "((()))(())", brute_force("((()))(())"))

    # Mixed nesting where mirrored subtrees differ. Brute force.
    def test_mirror_differs_n10(self):
        case(self, "((())()())", brute_force("((())()())"))

    # Repeated identical blocks give fewer distinct strings. Brute force.
    def test_repeated_blocks_n10(self):
        case(self, "(())(())()", brute_force("(())(())()"))

    # Several levels of reorderable children. Brute force.
    def test_multi_level_n12(self):
        case(self, "(()(()))(())", brute_force("(()(()))(())"))

    # Largest N, all "()" blocks: every valid substring is "()"*k, which the
    # operation leaves unchanged, so only S itself is reachable.
    def test_max_n_flat(self):
        case(self, "()" * 2500, 1)

    # Largest N, fully nested: every valid substring is "("*k + ")"*k,
    # which the operation leaves unchanged, so only S itself is reachable.
    def test_max_n_deep(self):
        case(self, "(" * 2500 + ")" * 2500, 1)

    # Largest N, one "(())" among 2498 "()" blocks at the root: by the facts
    # in the header, the reachable strings are the 2499 positions of "(())".
    def test_max_n_one_odd_block(self):
        case(self, "(())" + "()" * 2498, 2499)

    # Largest N, 625 "(())" and 1250 "()" root blocks (2*1250 + 4*625 =
    # 5000): by the header, the answer is the number of orderings,
    # C(1875, 625), taken modulo 998244353.
    def test_max_n_needs_modulo(self):
        s = "(())" * 625 + "()" * 1250
        case(self, s, math.comb(1875, 625) % MOD)


if __name__ == "__main__":
    unittest.main()
