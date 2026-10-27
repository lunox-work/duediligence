# Public tests for "Maximize Distance" (spec.md).
#
# spec.md gives only the title and the input layout (N M K, then M lines
# u_i v_i). It has no problem statement, no constraints and no samples, so
# no expected output follows from it. Cases are added here once the full
# statement is in spec.md: one per sample, then boundary cases derived by
# hand or by an in-test brute force.
import unittest

from sandbox.check import run_case  # noqa: F401  (used once cases exist)


class TestMaximizeDistance(unittest.TestCase):
    @unittest.skip("spec.md has no statement, constraints or samples to derive an expected answer from")
    def test_pending_full_statement(self):
        pass


if __name__ == "__main__":
    unittest.main()
