# LiveCodeBench's checker, vendored verbatim (testing_util.py; UPSTREAM has
# the commit). It imports numpy and never uses it (the one mention is a
# comment), so an absent numpy is stubbed rather than installed: the file
# stays byte-identical to the benchmark's.
import sys
import types

if "numpy" not in sys.modules:
    try:
        import numpy  # noqa: F401
    except ImportError:
        sys.modules["numpy"] = types.ModuleType("numpy")

from .testing_util import (  # noqa: E402
    Capturing,
    call_method,
    clean_if_name,
    compile_code,
    get_function,
    import_string,
    make_function,
    run_test,
)

__all__ = [
    "Capturing",
    "call_method",
    "clean_if_name",
    "compile_code",
    "get_function",
    "import_string",
    "make_function",
    "run_test",
]
