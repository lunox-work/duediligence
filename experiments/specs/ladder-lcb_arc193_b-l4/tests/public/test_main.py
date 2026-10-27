# Public tests for "Broken Wheel" (spec.md).
#
# spec.md as given has only the title and the input format (N, then a
# string s_0 s_1 ... s_{N-1}) and says "Print the answer." It has no
# problem statement, no samples and no constraints, so no expected
# output can be stated with certainty and no case is asserted here.
# Add cases with run_case(self, stdin="...", expected="...") once the
# full statement is available.
import unittest

from sandbox.check import run_case  # noqa: F401  (used once cases exist)


class TestBrokenWheel(unittest.TestCase):
    def test_statement_missing_from_spec(self):
        self.skipTest("spec.md has no statement, samples or constraints; no case can be asserted")


if __name__ == "__main__":
    unittest.main()
