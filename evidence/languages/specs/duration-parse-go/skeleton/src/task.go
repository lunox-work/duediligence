// Package task parses and formats the short duration strings, such as
// "1h30m" or "250ms", that a job scheduler stores as whole milliseconds.
package task

// ParseDuration turns a duration string into milliseconds. A duration is one
// or more components, each a decimal count followed by one of the units d,
// h, m, s and ms, with units from largest to smallest and each at most once;
// leading and trailing whitespace is removed first. The result is the sum of
// the components in milliseconds and is never above 9007199254740991.
// Invalid text, or a total above 9007199254740991, returns 0 and a non-nil
// error whose message contains "duration".
func ParseDuration(s string) (int64, error) {
	panic("not implemented")
}

// FormatDuration turns milliseconds from 0 to 9007199254740991 back into the
// shortest duration string: largest units first, every zero component left
// out, so that parsing the result gives ms back; zero is "0ms". Any other
// value returns "" and a non-nil error whose message contains "milliseconds".
func FormatDuration(ms int64) (string, error) {
	panic("not implemented")
}
