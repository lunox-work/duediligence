// Package task parses and formats the short duration strings, such as
// "1h30m" or "250ms", that a job scheduler stores as whole milliseconds.
package task

import (
	"errors"
	"strconv"
	"strings"
)

// maxMillis is 2^53 - 1, the largest integer a JavaScript reader holds
// exactly and the largest value either function accepts or returns.
const maxMillis int64 = 9007199254740991

// units lists the units from largest to smallest with their size in
// milliseconds; a duration must use them in this order.
var units = []struct {
	name string
	ms   int64
}{
	{"d", 86400000},
	{"h", 3600000},
	{"m", 60000},
	{"s", 1000},
	{"ms", 1},
}

var (
	errDuration     = errors.New("task: invalid duration")
	errDurationSize = errors.New("task: duration above 9007199254740991 milliseconds")
	errMillis       = errors.New("task: milliseconds out of range 0 to 9007199254740991")
)

// ParseDuration turns a duration string into milliseconds. A duration is one
// or more components, each a decimal count followed by one of the units d,
// h, m, s and ms, with units from largest to smallest and each at most once;
// leading and trailing whitespace is removed first. The result is the sum of
// the components in milliseconds and is never above 9007199254740991.
// Invalid text, or a total above 9007199254740991, returns 0 and a non-nil
// error whose message contains "duration".
func ParseDuration(s string) (int64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, errDuration
	}
	var total int64
	next := 0 // index in units of the largest unit still allowed
	for s != "" {
		n := 0
		for n < len(s) && s[n] >= '0' && s[n] <= '9' {
			n++
		}
		digits := s[:n]
		if n == 0 || (n > 1 && digits[0] == '0') {
			return 0, errDuration
		}
		s = s[n:]
		u := -1
		switch {
		case strings.HasPrefix(s, "ms"):
			u, s = 4, s[2:]
		case strings.HasPrefix(s, "d"):
			u, s = 0, s[1:]
		case strings.HasPrefix(s, "h"):
			u, s = 1, s[1:]
		case strings.HasPrefix(s, "m"):
			u, s = 2, s[1:]
		case strings.HasPrefix(s, "s"):
			u, s = 3, s[1:]
		}
		if u < next {
			return 0, errDuration
		}
		next = u + 1
		count, err := strconv.ParseInt(digits, 10, 64)
		if err != nil || count > (maxMillis-total)/units[u].ms {
			return 0, errDurationSize
		}
		total += count * units[u].ms
	}
	return total, nil
}

// FormatDuration turns milliseconds from 0 to 9007199254740991 back into the
// shortest duration string: largest units first, every zero component left
// out, so that parsing the result gives ms back; zero is "0ms". Any other
// value returns "" and a non-nil error whose message contains "milliseconds".
func FormatDuration(ms int64) (string, error) {
	if ms < 0 || ms > maxMillis {
		return "", errMillis
	}
	if ms == 0 {
		return "0ms", nil
	}
	var b strings.Builder
	for _, u := range units {
		if c := ms / u.ms; c > 0 {
			b.WriteString(strconv.FormatInt(c, 10))
			b.WriteString(u.name)
			ms %= u.ms
		}
	}
	return b.String(), nil
}
