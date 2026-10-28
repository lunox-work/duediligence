package public

import (
	"strings"
	"testing"

	task "task/src"
)

// expectParse asserts that ParseDuration(text) returns want and a nil error.
func expectParse(t *testing.T, text string, want int64) {
	t.Helper()
	got, err := task.ParseDuration(text)
	if err != nil {
		t.Fatalf("ParseDuration(%q): unexpected error %v", text, err)
	}
	if got != want {
		t.Fatalf("ParseDuration(%q) = %d, want %d", text, got, want)
	}
}

// expectParseError asserts that ParseDuration(text) returns 0 and an error
// whose message contains "duration".
func expectParseError(t *testing.T, text string) {
	t.Helper()
	got, err := task.ParseDuration(text)
	if err == nil {
		t.Fatalf("ParseDuration(%q) = %d, nil; want an error", text, got)
	}
	if got != 0 {
		t.Fatalf("ParseDuration(%q) = %d with error; want 0", text, got)
	}
	if !strings.Contains(err.Error(), "duration") {
		t.Fatalf("ParseDuration(%q) error %q does not contain %q", text, err.Error(), "duration")
	}
}

// expectFormat asserts that FormatDuration(ms) returns want and a nil error.
func expectFormat(t *testing.T, ms int64, want string) {
	t.Helper()
	got, err := task.FormatDuration(ms)
	if err != nil {
		t.Fatalf("FormatDuration(%d): unexpected error %v", ms, err)
	}
	if got != want {
		t.Fatalf("FormatDuration(%d) = %q, want %q", ms, got, want)
	}
}

// expectFormatError asserts that FormatDuration(ms) returns "" and an error
// whose message contains "milliseconds".
func expectFormatError(t *testing.T, ms int64) {
	t.Helper()
	got, err := task.FormatDuration(ms)
	if err == nil {
		t.Fatalf("FormatDuration(%d) = %q, nil; want an error", ms, got)
	}
	if got != "" {
		t.Fatalf("FormatDuration(%d) = %q with error; want \"\"", ms, got)
	}
	if !strings.Contains(err.Error(), "milliseconds") {
		t.Fatalf("FormatDuration(%d) error %q does not contain %q", ms, err.Error(), "milliseconds")
	}
}

// expectRoundTrip asserts that FormatDuration(ms) succeeds and that parsing
// its result gives ms back.
func expectRoundTrip(t *testing.T, ms int64) {
	t.Helper()
	text, err := task.FormatDuration(ms)
	if err != nil {
		t.Fatalf("FormatDuration(%d): unexpected error %v", ms, err)
	}
	got, err := task.ParseDuration(text)
	if err != nil {
		t.Fatalf("ParseDuration(%q) (from FormatDuration(%d)): unexpected error %v", text, ms, err)
	}
	if got != ms {
		t.Fatalf("ParseDuration(FormatDuration(%d) = %q) = %d, want %d", ms, text, got, ms)
	}
}
