#!/bin/sh
# Runs one suite with go's own runner: sh sandbox/test.sh public|own|private
# The build cache goes to the temp folder: the project holds only code.
set -e
suite=${1:?usage: sh sandbox/test.sh public|own|private}
export GOCACHE="${GOCACHE:-${TMPDIR:-/tmp}/independent-tests-go-cache}" GOFLAGS=-mod=mod GOTOOLCHAIN=local
exec go test -count=1 -v "./tests/$suite/..."
