import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

test("[unhappy-1] rejects two real names sharing a public name and names the collision", () => {
  assert.throws(
    () => mapFiles(
      [{ path: ".env", text: "NORTHWIND_A=1\nNORTHWIND_B=2\n" }],
      [
        { real: "NORTHWIND_A", public: "SVC_X" },
        { real: "NORTHWIND_B", public: "SVC_X" },
      ],
      "to public",
    ),
    /SVC_X/,
  );
});

test("[unhappy-1] rejects a duplicate public name even for empty input mapped to real", () => {
  assert.throws(
    () => mapFiles(
      [],
      [
        { real: "NORTHWIND_A", public: "SVC_X" },
        { real: "NORTHWIND_B", public: "SVC_X" },
      ],
      "to real",
    ),
    /SVC_X/,
  );
});
