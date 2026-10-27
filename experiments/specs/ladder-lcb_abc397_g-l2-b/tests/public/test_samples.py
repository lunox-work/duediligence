import unittest

from sandbox.check import run_case


class TestSamples(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 3 2\n1 2\n2 3\n1 3\n", expected="1\n")

    def test_sample_2(self):
        run_case(self, stdin="4 4 3\n1 2\n1 3\n3 2\n2 4\n", expected="2\n")

    def test_sample_3(self):
        run_case(self, stdin="2 2 1\n1 2\n1 2\n", expected="0\n")


if __name__ == "__main__":
    unittest.main()
