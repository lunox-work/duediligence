package public

import (
	"math"
	"testing"
)

// R4 @happy 3: Formatting.

func Test_happy_3__FormatsZero(t *testing.T) {
	expectFormat(t, 0, "0ms")
}

func Test_happy_3__Formats250(t *testing.T) {
	expectFormat(t, 250, "250ms")
}

func Test_happy_3__FormatsMinuteAndSeconds(t *testing.T) {
	expectFormat(t, 90000, "1m30s")
}

func Test_happy_3__FormatsHourAndMinutes(t *testing.T) {
	expectFormat(t, 5400000, "1h30m")
}

func Test_happy_3__FormatsOneDay(t *testing.T) {
	expectFormat(t, 86400000, "1d")
}

func Test_happy_3__FormatsEveryUnit(t *testing.T) {
	expectFormat(t, 90061001, "1d1h1m1s1ms")
}

func Test_happy_3__FormatsOneMillisecond(t *testing.T) {
	expectFormat(t, 1, "1ms")
}

func Test_happy_3__Formats999AsMilliseconds(t *testing.T) {
	expectFormat(t, 999, "999ms")
}

func Test_happy_3__Formats1000AsOneSecond(t *testing.T) {
	expectFormat(t, 1000, "1s")
}

func Test_happy_3__FormatsJustUnderADay(t *testing.T) {
	expectFormat(t, 86399999, "23h59m59s999ms")
}

func Test_happy_3__OmitsZeroComponentsInTheMiddle(t *testing.T) {
	expectFormat(t, 86400001, "1d1ms")
}

// R4 @boundary 3: Formatting the largest value.

func Test_boundary_3__FormatsLargestValue(t *testing.T) {
	expectFormat(t, 9007199254740991, "104249991d8h59m991ms")
}

func Test_boundary_3__FormatsOneBelowLargestValue(t *testing.T) {
	expectFormat(t, 9007199254740990, "104249991d8h59m990ms")
}

// R4 @boundary 4: Formatting then parsing gives the number back.

func Test_boundary_4__RoundTrips123456789(t *testing.T) {
	expectRoundTrip(t, 123456789)
}

func Test_boundary_4__RoundTripsZero(t *testing.T) {
	expectRoundTrip(t, 0)
}

func Test_boundary_4__RoundTripsLargestValue(t *testing.T) {
	expectRoundTrip(t, 9007199254740991)
}

// R4 @unhappy 4: Out-of-range values are rejected.

func Test_unhappy_4__RejectsMinusOne(t *testing.T) {
	expectFormatError(t, -1)
}

func Test_unhappy_4__RejectsOneAboveLargest(t *testing.T) {
	expectFormatError(t, 9007199254740992)
}

func Test_unhappy_4__RejectsMinInt64(t *testing.T) {
	expectFormatError(t, math.MinInt64)
}

func Test_unhappy_4__RejectsMaxInt64(t *testing.T) {
	expectFormatError(t, math.MaxInt64)
}
