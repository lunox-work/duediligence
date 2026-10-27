#!/bin/sh
# Runs one suite with cargo's own runner: sh sandbox/test.sh public|own|private
# Each suite is the integration test cargo builds from tests/<suite>/main.rs.
set -e
suite=${1:?usage: sh sandbox/test.sh public|own|private}
exec cargo test --offline --test "$suite" -- --test-threads=1
