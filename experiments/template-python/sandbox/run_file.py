# Runs one unittest file and prints one JSON line per finished test on
# stdout, for sandbox/run.py to read. A file that fails to import prints a
# single failing line named after the file.
#
#   python3 -I sandbox/run_file.py tests/public/test_samples.py
import importlib.util
import json
import os
import sys
import traceback
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
out = sys.stdout  # the checker swaps sys.stdout while a case runs
MESSAGE_CHARS = 2000


def emit(name, ok, skipped=False, error=None):
    out.write(json.dumps({"ok": ok, "skipped": skipped, "name": name, "nesting": 0, "suite": False, "error": error}) + "\n")
    out.flush()


def failure(kind, err):
    exc_type, exc, _ = err
    message = "".join(traceback.format_exception_only(exc_type, exc)).strip()
    return {"failureType": kind, "code": None, "message": message[:MESSAGE_CHARS]}


class Result(unittest.TestResult):
    def name(self, test):
        method = getattr(test, "_testMethodName", None)
        return f"{type(test).__name__}.{method}" if method else str(test)

    def addSuccess(self, test):
        super().addSuccess(test)
        emit(self.name(test), True)

    def addFailure(self, test, err):
        super().addFailure(test, err)
        emit(self.name(test), False, error=failure("testCodeFailure", err))

    def addError(self, test, err):
        super().addError(test, err)
        emit(self.name(test), False, error=failure("uncaughtException", err))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        emit(self.name(test), True, skipped=True)

    def addExpectedFailure(self, test, err):
        super().addExpectedFailure(test, err)
        emit(self.name(test), True)

    def addUnexpectedSuccess(self, test):
        super().addUnexpectedSuccess(test)
        emit(self.name(test), False, error={"failureType": "testCodeFailure", "code": None, "message": "unexpected success"})


path = os.path.join(ROOT, sys.argv[1])
rel = os.path.relpath(path, ROOT)
try:
    spec = importlib.util.spec_from_file_location(os.path.splitext(os.path.basename(path))[0], path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
except BaseException:  # noqa: BLE001 - an import failure is the file's one failing line
    emit(rel, False, error={"failureType": "uncaughtException", "code": None, "message": traceback.format_exc()[-MESSAGE_CHARS:]})
    sys.exit(1)
suite = unittest.TestLoader().loadTestsFromModule(module)
result = Result()
suite.run(result)
sys.exit(0 if result.wasSuccessful() else 1)
