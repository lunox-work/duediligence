# One checker call in its own process, as the benchmark runs it
# (compute_code_generation_metrics.check_correctness spawns a process per
# check): reliability_guard disables os and subprocess functions for good,
# so a second run_test in the same process fails on its own environment
# write. Reads {"sample", "code", "timeout"} as JSON on stdin and prints
# {"results", "metadata"} as JSON on stdout.
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sandbox.lcb import run_test  # noqa: E402

job = json.load(sys.stdin)
out = sys.stdout
results, metadata = run_test(job["sample"], test=job["code"], timeout=job["timeout"])
out.write(json.dumps({"results": list(results or []), "metadata": metadata or {}}, default=str))
out.flush()
