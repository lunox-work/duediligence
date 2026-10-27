"""The hidden suite: this problem's private test cases from LiveCodeBench,
run through the benchmark's own checker in order and stopping at the first
failure, as the benchmark does. One test per case; a case after the first
failure fails as not reached."""
import json
import os
import unittest

from sandbox.check import describe, run_cases

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as handle:
    DATA = json.load(handle)
CASES = DATA["cases"]
FN = DATA.get("fn_name")


class Hidden(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results, cls.metadata = run_cases(CASES, FN)


def make(index):
    def test(self):
        results = self.results
        if index < len(results) and results[index] is True:
            return
        if index < len(results):
            self.fail(describe(self.metadata))
        self.fail("not reached: an earlier case failed")

    return test


for i in range(len(CASES)):
    setattr(Hidden, f"test_case_{i + 1:04d}", make(i))
