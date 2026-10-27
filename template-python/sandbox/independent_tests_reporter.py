# A pytest plugin: one JSON line per finished test, and one per test file
# that failed to collect, appended to the file INDEPENDENT_TESTS_REPORT
# names, for sandbox/run.py and bin/runners/pytest.mjs to read. Loaded with
# `-p independent_tests_reporter` and this folder on PYTHONPATH; without
# the variable it only registers the `scenario` marker.
#
#   {"file": "tests/public/test_parse.py", "name": "[happy-1] TestParse.test_unit", "ok": true, "skipped": false, "error": null}
#   {"file": "tests/public/test_parse.py", "collectError": "ImportError: ..."}
#
# `file` is relative to the folder pytest runs in. `name` is the node id
# after the file with `::` as `.` (`Class.method[param]`, the name unittest
# gives the same test), prefixed with `[<kind>-<n>] ` when the function is
# named `test_<kind>_<n>__<rest>` (`test_unhappy_2__rejects_empty`) or
# carries `@pytest.mark.scenario("<kind>-<n>")`: the spec scenario it
# asserts, which is all a verdict reports of a failing hidden test. The
# name form needs nothing registered, so a repository's own pytest run with
# warnings as errors takes it unchanged. A test is ok when it
# passed, was skipped (as node:test counts a skip) or failed as expected;
# a failure in setup or teardown fails it.
import json
import os
import re

KEYED = re.compile(r"^test_([a-z]+)_(\d+)__")

MESSAGE_CHARS = 2000
_names = {}
_state = {}
_config = None


def pytest_configure(config):
    global _config
    _config = config
    config.addinivalue_line("markers", "scenario(key): the spec scenario this test asserts, such as unhappy-2")


def _emit(record):
    path = os.environ.get("INDEPENDENT_TESTS_REPORT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


def _relative(path):
    return os.path.relpath(str(path), os.getcwd()).replace(os.sep, "/")


def pytest_collection_modifyitems(session, config, items):
    for item in items:
        marker = item.get_closest_marker("scenario")
        named = KEYED.match(getattr(item, "originalname", None) or item.name)
        key = marker.args[0] if marker is not None and marker.args else f"{named[1]}-{named[2]}" if named else None
        name = ".".join(item.nodeid.split("::")[1:]) or item.name
        _names[item.nodeid] = (_relative(item.path), f"[{key}] {name}" if key else name)


def _message(report):
    crash = getattr(getattr(report, "longrepr", None), "reprcrash", None)
    text = getattr(crash, "message", None) or getattr(report, "longreprtext", "") or ""
    return str(text)[:MESSAGE_CHARS]


def pytest_runtest_logreport(report):
    state = _state.setdefault(report.nodeid, {"ok": True, "skipped": False, "error": None})
    expected = hasattr(report, "wasxfail")
    if report.failed and state["error"] is None:
        state["ok"] = False
        kind = "testCodeFailure" if report.when == "call" else "hookFailed"
        state["error"] = {"failureType": kind, "code": None, "message": _message(report)}
    elif report.skipped and not expected:
        state["skipped"] = True
    if report.when != "teardown":
        return
    file, name = _names.get(report.nodeid, (_relative(report.location[0]), ".".join(report.nodeid.split("::")[1:])))
    _state.pop(report.nodeid, None)
    _emit({"file": file, "name": name, **state})


def pytest_collectreport(report):
    if not report.failed or _config is None:
        return
    path = report.nodeid.split("::")[0]
    if not path:
        return
    _emit({"file": _relative(_config.rootpath / path), "collectError": _message(report) or str(report.longrepr)[:MESSAGE_CHARS]})
