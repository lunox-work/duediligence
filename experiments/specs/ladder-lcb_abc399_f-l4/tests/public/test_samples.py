# Public tests for spec.md ("Range Power Sum").
#
# spec.md gives only the input format (N K / A_1 ... A_N) and "Print the
# answer". It does not define the answer, and it has no samples and no
# constraints, so no expected output can be stated from it. Rather than
# guess, this suite holds no cases. Add the full statement to spec.md and
# replace the skipped placeholder below with real run_case calls.
import unittest

from sandbox.check import run_case  # noqa: F401  (used once cases exist)


class TestRangePowerSum(unittest.TestCase):
    @unittest.skip("spec.md has no problem definition, samples or constraints")
    def test_spec_incomplete(self):
        pass


if __name__ == "__main__":
    unittest.main()
