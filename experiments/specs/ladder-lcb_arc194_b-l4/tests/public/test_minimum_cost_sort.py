# spec.md gives only the input/output format: it states no operation, no
# cost rule, no constraints and no samples. The only answer that follows
# from it alone is that an already-sorted P needs no operations, so its
# minimum total cost is the empty sum, 0.
import unittest

from sandbox.check import run_case


class TestMinimumCostSort(unittest.TestCase):
    def test_already_sorted_two_elements(self):
        # P is sorted already; doing nothing costs 0.
        run_case(self, stdin="2\n1 2\n", expected="0")

    def test_already_sorted_five_elements(self):
        # P is sorted already; doing nothing costs 0.
        run_case(self, stdin="5\n1 2 3 4 5\n", expected="0")


if __name__ == "__main__":
    unittest.main()
