package public

import "testing"

// R1 @happy 1: Components add up.

func Test_happy_1__Parses250ms(t *testing.T) {
	expectParse(t, "250ms", 250)
}

func Test_happy_1__Parses90s(t *testing.T) {
	expectParse(t, "90s", 90000)
}

func Test_happy_1__ParsesHoursAndMinutes(t *testing.T) {
	expectParse(t, "1h30m", 5400000)
}

func Test_happy_1__ParsesDays(t *testing.T) {
	expectParse(t, "2d", 172800000)
}

func Test_happy_1__ParsesZeroSeconds(t *testing.T) {
	expectParse(t, "0s", 0)
}

func Test_happy_1__ParsesAllUnitsWithZeroComponents(t *testing.T) {
	expectParse(t, "1d0h0m0s0ms", 86400000)
}

func Test_happy_1__ParsesZeroMilliseconds(t *testing.T) {
	expectParse(t, "0ms", 0)
}

func Test_happy_1__ParsesOneOfEveryUnit(t *testing.T) {
	expectParse(t, "1d1h1m1s1ms", 90061001)
}

func Test_happy_1__ParsesMinutesFollowedByMilliseconds(t *testing.T) {
	expectParse(t, "1m5ms", 60005)
}

// R1 @boundary 1: Surrounding whitespace is ignored.

func Test_boundary_1__TrimsSpacesAndNewline(t *testing.T) {
	expectParse(t, "  45m\n", 2700000)
}

func Test_boundary_1__TrimsTabsAndCarriageReturns(t *testing.T) {
	expectParse(t, "\t\r\n1h30m \t", 5400000)
}

// R1 @unhappy 1: Malformed durations are rejected.

func Test_unhappy_1__RejectsEmptyString(t *testing.T) {
	expectParseError(t, "")
}

func Test_unhappy_1__RejectsBareNumber(t *testing.T) {
	expectParseError(t, "90")
}

func Test_unhappy_1__RejectsDecimalPoint(t *testing.T) {
	expectParseError(t, "1.5h")
}

func Test_unhappy_1__RejectsLeadingZero(t *testing.T) {
	expectParseError(t, "05s")
}

func Test_unhappy_1__RejectsMinusSign(t *testing.T) {
	expectParseError(t, "-3s")
}

func Test_unhappy_1__RejectsPlusSign(t *testing.T) {
	expectParseError(t, "+3s")
}

func Test_unhappy_1__RejectsSpaceBetweenComponents(t *testing.T) {
	expectParseError(t, "1h 30m")
}

func Test_unhappy_1__RejectsCommaBetweenComponents(t *testing.T) {
	expectParseError(t, "1h,30m")
}

func Test_unhappy_1__RejectsUnknownUnit(t *testing.T) {
	expectParseError(t, "3w")
}

func Test_unhappy_1__RejectsUppercaseUnit(t *testing.T) {
	expectParseError(t, "3S")
}

func Test_unhappy_1__RejectsSpaceBeforeUnit(t *testing.T) {
	expectParseError(t, "3 s")
}

func Test_unhappy_1__RejectsUnitWithoutCount(t *testing.T) {
	expectParseError(t, "ms")
}

func Test_unhappy_1__RejectsFullwidthDigit(t *testing.T) {
	expectParseError(t, "３s")
}

func Test_unhappy_1__RejectsWhitespaceOnly(t *testing.T) {
	expectParseError(t, " \t\n ")
}

func Test_unhappy_1__RejectsDoubleZero(t *testing.T) {
	expectParseError(t, "00s")
}

func Test_unhappy_1__RejectsMixedCaseMilliseconds(t *testing.T) {
	expectParseError(t, "3Ms")
}

func Test_unhappy_1__RejectsTrailingCountWithoutUnit(t *testing.T) {
	expectParseError(t, "1h30")
}

func Test_unhappy_1__RejectsTabBetweenComponents(t *testing.T) {
	expectParseError(t, "1h\t30m")
}

// R2 @happy 2: A count may exceed the next unit.

func Test_happy_2__Parses90Minutes(t *testing.T) {
	expectParse(t, "90m", 5400000)
}

func Test_happy_2__ParsesHoursBeyondADayWithMilliseconds(t *testing.T) {
	expectParse(t, "25h1000ms", 90001000)
}

// R2 @unhappy 2: Out-of-order or repeated units are rejected.

func Test_unhappy_2__RejectsMinutesBeforeHours(t *testing.T) {
	expectParseError(t, "30m1h")
}

func Test_unhappy_2__RejectsRepeatedHours(t *testing.T) {
	expectParseError(t, "1h1h")
}

func Test_unhappy_2__RejectsSecondsAfterMilliseconds(t *testing.T) {
	expectParseError(t, "1s500ms2s")
}

func Test_unhappy_2__RejectsMillisecondsBeforeSeconds(t *testing.T) {
	expectParseError(t, "5ms1s")
}

func Test_unhappy_2__RejectsRepeatedMilliseconds(t *testing.T) {
	expectParseError(t, "1ms1ms")
}

func Test_unhappy_2__RejectsRepeatedZeroDays(t *testing.T) {
	expectParseError(t, "0d0d")
}

// R3 @boundary 2: The largest duration parses.

func Test_boundary_2__ParsesLargestDuration(t *testing.T) {
	expectParse(t, "104249991d8h59m991ms", 9007199254740991)
}

func Test_boundary_2__ParsesLargestDurationAsMilliseconds(t *testing.T) {
	expectParse(t, "9007199254740991ms", 9007199254740991)
}

// R3 @unhappy 3: Totals above the largest are rejected.

func Test_unhappy_3__RejectsOneAboveLargest(t *testing.T) {
	expectParseError(t, "104249991d8h59m992ms")
}

func Test_unhappy_3__RejectsCountTooLargeForInt64(t *testing.T) {
	expectParseError(t, "99999999999999999999ms")
}

func Test_unhappy_3__RejectsOneAboveLargestAsMilliseconds(t *testing.T) {
	expectParseError(t, "9007199254740992ms")
}

func Test_unhappy_3__RejectsCountJustAboveInt64(t *testing.T) {
	expectParseError(t, "9223372036854775808ms")
}

func Test_unhappy_3__RejectsMaxInt64DaysThatWouldWrap(t *testing.T) {
	expectParseError(t, "9223372036854775807d")
}

func Test_unhappy_3__RejectsComponentsWhoseSumExceedsLargest(t *testing.T) {
	expectParseError(t, "104249991d9h")
}
