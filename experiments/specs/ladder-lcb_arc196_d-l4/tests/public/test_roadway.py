import unittest

from sandbox.check import run_case


class TestRoadway(unittest.TestCase):
    # spec.md gives only the input and output formats. It has no problem
    # statement (what a road's "strength" is, what a person's
    # "requirement" is), no constraints and no samples, so no input has
    # an expected Yes/No that follows from it. Cases go here, one method
    # each, once spec.md carries the statement, constraints and samples:
    #
    #     run_case(self, stdin="...", expected="...")

    def test_spec_has_no_samples_or_statement(self):
        self.skipTest("spec.md has no statement, constraints or samples to derive cases from")


if __name__ == "__main__":
    unittest.main()
