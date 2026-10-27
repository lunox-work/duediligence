import unittest

from sandbox.check import run_case  # noqa: F401  (used once spec.md is complete)


# spec.md gives only the input format (T cases of "N K" then N lines of
# "X Y Z") and "Print T lines". It has no problem statement, no
# constraints and no samples, so no expected output can be stated with
# certainty. Cases go here once the full statement is in spec.md.
class TestSamples(unittest.TestCase):
    @unittest.skip("spec.md has no problem statement, constraints or samples")
    def test_spec_incomplete(self):
        pass


if __name__ == "__main__":
    unittest.main()
