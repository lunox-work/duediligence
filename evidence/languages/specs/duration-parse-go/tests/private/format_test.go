package private

import (
	"math"
	"testing"
)

// R4 @happy 3: Formatting.

// Extends public Test_happy_3__FormatsEveryUnit with other counts.
func Test_happy_3__FormatsEveryUnitWithDistinctCounts(t *testing.T) {
	expectFormat(t, 273906007, "3d4h5m6s7ms")
}

func Test_happy_3__FormatsEveryUnitAboveOne(t *testing.T) {
	expectFormat(t, 8733722001, "101d2h2m2s1ms")
}

// Extends public Test_happy_3__FormatsOneDay: counts containing zero digits.
func Test_happy_3__FormatsTenDays(t *testing.T) {
	expectFormat(t, 864000000, "10d")
}

func Test_happy_3__FormatsTenHours(t *testing.T) {
	expectFormat(t, 36000000, "10h")
}

func Test_happy_3__FormatsTenMinutes(t *testing.T) {
	expectFormat(t, 600000, "10m")
}

func Test_happy_3__FormatsTenSeconds(t *testing.T) {
	expectFormat(t, 10000, "10s")
}

func Test_happy_3__FormatsTenMilliseconds(t *testing.T) {
	expectFormat(t, 10, "10ms")
}

func Test_happy_3__FormatsHundredMilliseconds(t *testing.T) {
	expectFormat(t, 100, "100ms")
}

func Test_happy_3__FormatsOneMinute(t *testing.T) {
	expectFormat(t, 60000, "1m")
}

func Test_happy_3__FormatsOneHour(t *testing.T) {
	expectFormat(t, 3600000, "1h")
}

func Test_happy_3__FormatsTwoDays(t *testing.T) {
	expectFormat(t, 172800000, "2d")
}

// Days are the largest unit: no weeks or years.
func Test_happy_3__FormatsSevenDaysAsDays(t *testing.T) {
	expectFormat(t, 604800000, "7d")
}

func Test_happy_3__Formats1000Days(t *testing.T) {
	expectFormat(t, 86400000000, "1000d")
}

// Extends public Test_happy_3__FormatsMinuteAndSeconds.
func Test_happy_3__FormatsMinuteAndFortySeconds(t *testing.T) {
	expectFormat(t, 100000, "1m40s")
}

func Test_happy_3__FormatsSecondAndMillisecond(t *testing.T) {
	expectFormat(t, 1001, "1s1ms")
}

func Test_happy_3__Formats1500AsSecondAndMilliseconds(t *testing.T) {
	expectFormat(t, 1500, "1s500ms")
}

func Test_happy_3__FormatsJustUnderAMinute(t *testing.T) {
	expectFormat(t, 59999, "59s999ms")
}

func Test_happy_3__FormatsJustUnderAnHour(t *testing.T) {
	expectFormat(t, 3599999, "59m59s999ms")
}

// Extends public Test_happy_3__OmitsZeroComponentsInTheMiddle.
func Test_happy_3__OmitsZeroMinutesAndSeconds(t *testing.T) {
	expectFormat(t, 3600001, "1h1ms")
}

func Test_happy_3__OmitsZeroHoursAndSeconds(t *testing.T) {
	expectFormat(t, 86460000, "1d1m")
}

func Test_happy_3__OmitsZeroHoursAndMinutes(t *testing.T) {
	expectFormat(t, 86401000, "1d1s")
}

func Test_happy_3__OmitsZeroMinutesBetweenHoursAndSeconds(t *testing.T) {
	expectFormat(t, 7205000, "2h5s")
}

// Beyond int32: a shortcut that truncates would fail here.
func Test_happy_3__Formats2To32(t *testing.T) {
	expectFormat(t, 4294967296, "49d17h2m47s296ms")
}

// R4 @boundary 3: Formatting the largest value.

// Extends public Test_boundary_3__FormatsOneBelowLargestValue.
func Test_boundary_3__FormatsLargestWithoutMilliseconds(t *testing.T) {
	expectFormat(t, 9007199254740000, "104249991d8h59m")
}

func Test_boundary_3__FormatsLargestWholeDays(t *testing.T) {
	expectFormat(t, 9007199222400000, "104249991d")
}

func Test_boundary_3__FormatsLargestWholeDaysPlusOneMillisecond(t *testing.T) {
	expectFormat(t, 9007199222400001, "104249991d1ms")
}

// R4 @boundary 4: Formatting then parsing gives the number back.

// Extends public Test_boundary_4__RoundTrips123456789 with other values.
func Test_boundary_4__RoundTripsOne(t *testing.T) {
	expectRoundTrip(t, 1)
}

func Test_boundary_4__RoundTrips999(t *testing.T) {
	expectRoundTrip(t, 999)
}

func Test_boundary_4__RoundTrips60000(t *testing.T) {
	expectRoundTrip(t, 60000)
}

func Test_boundary_4__RoundTripsJustUnderADay(t *testing.T) {
	expectRoundTrip(t, 86399999)
}

func Test_boundary_4__RoundTrips987654321012(t *testing.T) {
	expectRoundTrip(t, 987654321012)
}

func Test_boundary_4__RoundTrips2To32(t *testing.T) {
	expectRoundTrip(t, 4294967296)
}

// Extends public Test_boundary_4__RoundTripsLargestValue.
func Test_boundary_4__RoundTripsOneBelowLargestValue(t *testing.T) {
	expectRoundTrip(t, 9007199254740990)
}

func Test_boundary_4__RoundTripsLargestWholeDays(t *testing.T) {
	expectRoundTrip(t, 9007199222400000)
}

func Test_boundary_4__RoundTrips2To52(t *testing.T) {
	expectRoundTrip(t, 4503599627370496)
}

// R4 @unhappy 4: Out-of-range values are rejected.

// Extends public Test_unhappy_4__RejectsMinusOne.
func Test_unhappy_4__RejectsMinusTwo(t *testing.T) {
	expectFormatError(t, -2)
}

func Test_unhappy_4__RejectsMinusOneDay(t *testing.T) {
	expectFormatError(t, -86400000)
}

func Test_unhappy_4__RejectsNegativeLargest(t *testing.T) {
	expectFormatError(t, -9007199254740991)
}

func Test_unhappy_4__RejectsMinInt64PlusOne(t *testing.T) {
	expectFormatError(t, math.MinInt64+1)
}

// Extends public Test_unhappy_4__RejectsOneAboveLargest.
func Test_unhappy_4__RejectsTwoAboveLargest(t *testing.T) {
	expectFormatError(t, 9007199254740993)
}

func Test_unhappy_4__Rejects2To53PlusOneDay(t *testing.T) {
	expectFormatError(t, 9007199254740992+86400000)
}

func Test_unhappy_4__Rejects2To62(t *testing.T) {
	expectFormatError(t, 1<<62)
}

func Test_unhappy_4__RejectsMaxInt64MinusOne(t *testing.T) {
	expectFormatError(t, math.MaxInt64-1)
}
