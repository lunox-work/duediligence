// The contract: spec.md, "Interface: a command", and the TypeScript types of each name's arguments and result in tests/public/boundary.ts.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func main() {
	if len(os.Args) != 2 {
		fail(2, "usage: task <name>")
	}
	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		fail(2, err.Error())
	}
	var result any
	switch os.Args[1] {
	case "applyPatch":
		var args []json.RawMessage
		if err := json.Unmarshal(input, &args); err != nil || len(args) != 2 {
			fail(2, "applyPatch: expected a JSON array of [files, diff]")
		}
		var files map[string]string
		var diff string
		if err := json.Unmarshal(args[0], &files); err != nil {
			fail(2, "applyPatch: files: "+err.Error())
		}
		if err := json.Unmarshal(args[1], &diff); err != nil {
			fail(2, "applyPatch: diff: "+err.Error())
		}
		if files == nil {
			files = map[string]string{}
		}
		result, err = applyPatch(files, diff)
		if err != nil {
			fail(1, err.Error())
		}
	default:
		fail(2, fmt.Sprintf("unknown name %q", os.Args[1]))
	}
	out, err := json.Marshal(result)
	if err != nil {
		fail(2, err.Error())
	}
	os.Stdout.Write(out)
}

func fail(code int, message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(code)
}
