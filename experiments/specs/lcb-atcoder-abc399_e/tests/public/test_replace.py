import string
import unittest

from sandbox.check import run_case

ALPHA = string.ascii_lowercase


def stdin_for(s, t):
    return f"{len(s)}\n{s}\n{t}\n"


class TestReplace(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="6\nafbfda\nbkckbb\n", expected="4")

    def test_sample_2(self):
        run_case(self, stdin="4\nabac\nabac\n", expected="0")

    def test_sample_3(self):
        run_case(self, stdin="4\nabac\nabrc\n", expected="-1")

    def test_sample_4(self):
        run_case(self, stdin="4\nabac\nbcba\n", expected="4")

    # Smallest inputs, N = 1.

    def test_single_char_equal(self):
        # S == T: zero operations.
        run_case(self, stdin="1\na\na\n", expected="0")

    def test_single_char_different(self):
        # One operation (x=a, y=b) suffices and at least one is needed.
        run_case(self, stdin="1\na\nb\n", expected="1")

    # Small cases. Each expected value was derived by hand and confirmed by a
    # breadth-first search over all reachable strings (every x present in S,
    # every y in a..z), which is exhaustive for these lengths.

    def test_same_letter_needs_two_targets(self):
        # Equal letters in S always stay equal, but T needs a and b there.
        run_case(self, stdin="2\naa\nab\n", expected="-1")

    def test_swap_two_letters(self):
        # a->b, b->a needs a spare letter: a->c, b->a, c->b.
        run_case(self, stdin="2\nab\nba\n", expected="3")

    def test_chain(self):
        # a->b, b->c: do b->c first, then a->b.
        run_case(self, stdin="2\nab\nbc\n", expected="2")

    def test_three_cycle(self):
        # a->b->c->a is a cycle of 3 letters: 3 operations plus 1 for a spare.
        run_case(self, stdin="3\nabc\nbca\n", expected="4")

    def test_cycle_with_incoming_letter(self):
        # a<->b swap, and c->a. b and c both need a, so merge b into c
        # (b->c), then a->b, then c->a. Each of a, b, c must be an x at least
        # once, so 3 is optimal; the cycle costs no extra here.
        run_case(self, stdin="3\nabc\nbaa\n", expected="3")

    def test_all_to_one_new_letter(self):
        # Each of a, b, c must be replaced at least once; a->d, b->d, c->d.
        run_case(self, stdin="3\nabc\nddd\n", expected="3")

    def test_two_swaps(self):
        # Two independent 2-cycles (a<->b, c<->d): 2+1 each.
        run_case(self, stdin="4\nabcd\nbadc\n", expected="6")

    # Edges involving the whole alphabet.

    def test_full_alphabet_identical(self):
        run_case(self, stdin=stdin_for(ALPHA, ALPHA), expected="0")

    def test_full_alphabet_rotation_impossible(self):
        # S and T each contain all 26 letters and differ. Any operation's y is
        # present in S, so it merges two letters of S forever, after which S
        # can never have 26 distinct letters as T does. Hence -1.
        run_case(self, stdin=stdin_for(ALPHA[1:] + "a", ALPHA), expected="-1")

    def test_25_cycle_with_one_spare(self):
        # a->b->...->y->a, 'z' unused. Each of the 25 letters must be an x at
        # least once. The first operation on a cycle letter cannot use a
        # present letter as y (it would merge letters needing different
        # targets), so it moves x to z, and z then needs one more operation:
        # at least 26. Using z as the spare achieves 26.
        s = ALPHA[:25]
        t = ALPHA[1:25] + "a"
        run_case(self, stdin=stdin_for(s, t), expected="26")

    # Largest N.

    def test_max_n_identical(self):
        n = 200000
        run_case(self, stdin=stdin_for("a" * n, "a" * n), expected="0")

    def test_max_n_swap(self):
        # Same mapping as "ab" -> "ba": answer 3.
        n = 200000
        run_case(self, stdin=stdin_for("ab" * (n // 2), "ba" * (n // 2)), expected="3")

    def test_max_n_all_to_z(self):
        # S cycles through all 26 letters, T is all z. Each of a..y must be an
        # x at least once (25), and x->z for each of them achieves it.
        n = 200000
        s = (ALPHA * (n // 26 + 1))[:n]
        run_case(self, stdin=stdin_for(s, "z" * n), expected="25")

    def test_max_n_impossible(self):
        # S all 'a' but T has both 'a' and 'b'.
        n = 200000
        run_case(self, stdin=stdin_for("a" * n, "a" * (n - 1) + "b"), expected="-1")


if __name__ == "__main__":
    unittest.main()
