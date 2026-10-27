# spec.md gives only the input format and the output rule: print Aoki if
# the first player wins, otherwise Takahashi. It states no game rules, no
# constraints and no samples, so no input's winner can be derived from it.
# What does follow necessarily is that the output is exactly one of those
# two words; these cases assert only that, on the smallest inputs the
# format allows.
import unittest

from sandbox.check import run_case

ANSWERS = ("Aoki", "Takahashi")


class TestOutputContract(unittest.TestCase):
    def assert_answer_is_a_player(self, stdin):
        # Passes if the program's output matches either player's name
        # under the acceptance checker; fails with the checker's reason.
        reasons = []
        for answer in ANSWERS:
            try:
                run_case(self, stdin=stdin, expected=answer)
                return
            except self.failureException as error:
                reasons.append(f"vs {answer}: {error}")
        self.fail("output is neither Aoki nor Takahashi; " + " | ".join(reasons))

    def test_single_vertex_no_edges(self):
        self.assert_answer_is_a_player("1 0\n")

    def test_two_vertices_no_edges(self):
        self.assert_answer_is_a_player("2 0\n")

    def test_two_vertices_one_edge(self):
        self.assert_answer_is_a_player("2 1\n1 2\n")


if __name__ == "__main__":
    unittest.main()
