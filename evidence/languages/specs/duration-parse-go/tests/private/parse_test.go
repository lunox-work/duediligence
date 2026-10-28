package private

import "testing"

// R1 @happy 1: Components add up.

// Extends public Test_happy_1__ParsesOneOfEveryUnit with other counts.
func Test_happy_1__ParsesEveryUnitWithDistinctCounts(t *testing.T) {
	expectParse(t, "3d4h5m6s7ms", 273906007)
}

// Extends public Test_happy_1__ParsesDays: counts containing a zero digit.
func Test_happy_1__ParsesTenDays(t *testing.T) {
	expectParse(t, "10d", 864000000)
}

func Test_happy_1__ParsesHundredMilliseconds(t *testing.T) {
	expectParse(t, "100ms", 100)
}

func Test_happy_1__ParsesTenSeconds(t *testing.T) {
	expectParse(t, "10s", 10000)
}

func Test_happy_1__ParsesTwelveHours(t *testing.T) {
	expectParse(t, "12h", 43200000)
}

func Test_happy_1__ParsesOneMinute(t *testing.T) {
	expectParse(t, "1m", 60000)
}

func Test_happy_1__ParsesZeroDays(t *testing.T) {
	expectParse(t, "0d", 0)
}

// Extends public Test_happy_1__ParsesMinutesFollowedByMilliseconds: "m"
// directly followed by an "ms" component.
func Test_happy_1__ParsesMinuteThenOneMillisecond(t *testing.T) {
	expectParse(t, "1m1ms", 60001)
}

// Extends public Test_happy_1__ParsesHoursAndMinutes: "30ms" after hours is
// thirty milliseconds, not thirty minutes and a stray "s".
func Test_happy_1__ParsesHoursThenMilliseconds(t *testing.T) {
	expectParse(t, "1h30ms", 3600030)
}

func Test_happy_1__ParsesSecondThenMillisecond(t *testing.T) {
	expectParse(t, "1s1ms", 1001)
}

func Test_happy_1__ParsesDayThenSecond(t *testing.T) {
	expectParse(t, "1d1s", 86401000)
}

// Extends public Test_happy_1__ParsesAllUnitsWithZeroComponents: zeros
// first, value last.
func Test_happy_1__ParsesZeroComponentsBeforeAValue(t *testing.T) {
	expectParse(t, "0d0h0m0s7ms", 7)
}

func Test_happy_1__ParsesZeroComponentBetweenValues(t *testing.T) {
	expectParse(t, "2h0m5s", 7205000)
}

// A shortcut that stores into an int32 would fail here.
func Test_happy_1__ParsesMillisecondsBeyondInt32(t *testing.T) {
	expectParse(t, "2147483648ms", 2147483648)
}

// R1 @boundary 1: Surrounding whitespace is ignored.

// Extends public Test_boundary_1__TrimsTabsAndCarriageReturns with the
// vertical tab and form feed, which strings.TrimSpace also removes.
func Test_boundary_1__TrimsVerticalTabAndFormFeed(t *testing.T) {
	expectParse(t, "\v\f90s\f\v", 90000)
}

// strings.TrimSpace removes Unicode whitespace such as U+00A0 and U+3000.
func Test_boundary_1__TrimsUnicodeSpaces(t *testing.T) {
	expectParse(t, " 45m　", 2700000)
}

func Test_boundary_1__TrimsNextLineAndEmSpace(t *testing.T) {
	expectParse(t, "\u0085 1d1ms \u0085", 86400001)
}

func Test_boundary_1__TrimsLeadingWhitespaceOnly(t *testing.T) {
	expectParse(t, "   250ms", 250)
}

func Test_boundary_1__TrimsTrailingWhitespaceOnly(t *testing.T) {
	expectParse(t, "250ms\n\n", 250)
}

// R1 @unhappy 1: Malformed durations are rejected.

// Extends public Test_unhappy_1__RejectsBareNumber.
func Test_unhappy_1__RejectsBareZero(t *testing.T) {
	expectParseError(t, "0")
}

func Test_unhappy_1__RejectsLongBareNumber(t *testing.T) {
	expectParseError(t, "5400000")
}

func Test_unhappy_1__RejectsPaddedBareNumber(t *testing.T) {
	expectParseError(t, " 90 ")
}

// Extends public Test_unhappy_1__RejectsDecimalPoint.
func Test_unhappy_1__RejectsDecimalMilliseconds(t *testing.T) {
	expectParseError(t, "2.5ms")
}

func Test_unhappy_1__RejectsDecimalInLaterComponent(t *testing.T) {
	expectParseError(t, "1h1.5m")
}

func Test_unhappy_1__RejectsLeadingDecimalPoint(t *testing.T) {
	expectParseError(t, ".5s")
}

// Extends public Test_unhappy_1__RejectsLeadingZero: the leading zero is in
// a later component.
func Test_unhappy_1__RejectsLeadingZeroInLaterComponent(t *testing.T) {
	expectParseError(t, "1h05m")
}

func Test_unhappy_1__RejectsLeadingZeroOnMilliseconds(t *testing.T) {
	expectParseError(t, "1s001ms")
}

func Test_unhappy_1__RejectsLeadingZeroOnLongCount(t *testing.T) {
	expectParseError(t, "0100ms")
}

// Extends public Test_unhappy_1__RejectsMinusSign.
func Test_unhappy_1__RejectsMinusSignInLaterComponent(t *testing.T) {
	expectParseError(t, "1h-30m")
}

func Test_unhappy_1__RejectsNegativeZero(t *testing.T) {
	expectParseError(t, "-0s")
}

func Test_unhappy_1__RejectsPlusSignInLaterComponent(t *testing.T) {
	expectParseError(t, "1h+30m")
}

// Extends public Test_unhappy_1__RejectsSpaceBetweenComponents with
// whitespace that strings.TrimSpace would remove at the ends.
func Test_unhappy_1__RejectsNewlineBetweenComponents(t *testing.T) {
	expectParseError(t, "1h\n30m")
}

func Test_unhappy_1__RejectsNoBreakSpaceBetweenComponents(t *testing.T) {
	expectParseError(t, "1h 30m")
}

func Test_unhappy_1__RejectsSpaceInsideCount(t *testing.T) {
	expectParseError(t, "1 0s")
}

func Test_unhappy_1__RejectsSpaceInsideMillisecondUnit(t *testing.T) {
	expectParseError(t, "5m s")
}

func Test_unhappy_1__RejectsInteriorSpaceWithSurroundingWhitespace(t *testing.T) {
	expectParseError(t, "  1h 30m  ")
}

// Extends public Test_unhappy_1__RejectsCommaBetweenComponents.
func Test_unhappy_1__RejectsUnderscoreBetweenComponents(t *testing.T) {
	expectParseError(t, "1h_30m")
}

func Test_unhappy_1__RejectsSemicolonBetweenComponents(t *testing.T) {
	expectParseError(t, "1h;30m")
}

func Test_unhappy_1__RejectsDigitSeparatorInCount(t *testing.T) {
	expectParseError(t, "1_000ms")
}

func Test_unhappy_1__RejectsThousandsCommaInCount(t *testing.T) {
	expectParseError(t, "1,000ms")
}

// Extends public Test_unhappy_1__RejectsUnknownUnit.
func Test_unhappy_1__RejectsYears(t *testing.T) {
	expectParseError(t, "1y")
}

func Test_unhappy_1__RejectsMicroseconds(t *testing.T) {
	expectParseError(t, "5us")
}

func Test_unhappy_1__RejectsMicroSignMicroseconds(t *testing.T) {
	expectParseError(t, "5µs")
}

func Test_unhappy_1__RejectsNanoseconds(t *testing.T) {
	expectParseError(t, "5ns")
}

func Test_unhappy_1__RejectsWeeksBeforeDays(t *testing.T) {
	expectParseError(t, "1w2d")
}

func Test_unhappy_1__RejectsSpelledOutUnit(t *testing.T) {
	expectParseError(t, "5min")
}

func Test_unhappy_1__RejectsSecUnit(t *testing.T) {
	expectParseError(t, "5sec")
}

func Test_unhappy_1__RejectsHrUnit(t *testing.T) {
	expectParseError(t, "2hr")
}

func Test_unhappy_1__RejectsTrailingLetterAfterValidDuration(t *testing.T) {
	expectParseError(t, "1h30mx")
}

func Test_unhappy_1__RejectsTrailingDotAfterValidDuration(t *testing.T) {
	expectParseError(t, "1h30m.")
}

func Test_unhappy_1__RejectsLeadingLetterBeforeValidDuration(t *testing.T) {
	expectParseError(t, "x1h")
}

func Test_unhappy_1__RejectsDoubledUnitLetter(t *testing.T) {
	expectParseError(t, "5hh")
}

func Test_unhappy_1__RejectsDoubledMillisecondSuffix(t *testing.T) {
	expectParseError(t, "5mss")
}

func Test_unhappy_1__RejectsNulByte(t *testing.T) {
	expectParseError(t, "5s\x00")
}

// Extends public Test_unhappy_1__RejectsUppercaseUnit with other units.
func Test_unhappy_1__RejectsUppercaseDays(t *testing.T) {
	expectParseError(t, "2D")
}

func Test_unhappy_1__RejectsUppercaseHours(t *testing.T) {
	expectParseError(t, "1H")
}

func Test_unhappy_1__RejectsUppercaseMinutes(t *testing.T) {
	expectParseError(t, "1M")
}

func Test_unhappy_1__RejectsUppercaseMilliseconds(t *testing.T) {
	expectParseError(t, "3MS")
}

func Test_unhappy_1__RejectsMixedCaseMillisecondsLowerM(t *testing.T) {
	expectParseError(t, "3mS")
}

func Test_unhappy_1__RejectsUppercaseUnitInLaterComponent(t *testing.T) {
	expectParseError(t, "1h30M")
}

// Extends public Test_unhappy_1__RejectsUnitWithoutCount.
func Test_unhappy_1__RejectsSingleUnitWithoutCount(t *testing.T) {
	expectParseError(t, "h")
}

func Test_unhappy_1__RejectsLaterUnitWithoutCount(t *testing.T) {
	expectParseError(t, "1hm")
}

func Test_unhappy_1__RejectsMillisecondsWithoutCountAfterSeconds(t *testing.T) {
	expectParseError(t, "1sms")
}

// Extends public Test_unhappy_1__RejectsTrailingCountWithoutUnit.
func Test_unhappy_1__RejectsTrailingZeroWithoutUnit(t *testing.T) {
	expectParseError(t, "1s0")
}

func Test_unhappy_1__RejectsTrailingCountAfterMilliseconds(t *testing.T) {
	expectParseError(t, "5ms7")
}

// Extends public Test_unhappy_1__RejectsFullwidthDigit with other non-ASCII
// decimal digits.
func Test_unhappy_1__RejectsArabicIndicDigit(t *testing.T) {
	expectParseError(t, "٣s")
}

func Test_unhappy_1__RejectsDevanagariDigit(t *testing.T) {
	expectParseError(t, "१h")
}

func Test_unhappy_1__RejectsNonASCIIDigitInsideCount(t *testing.T) {
	expectParseError(t, "1٠s")
}

func Test_unhappy_1__RejectsFullwidthDigitInLaterComponent(t *testing.T) {
	expectParseError(t, "1h３m")
}

func Test_unhappy_1__RejectsSuperscriptDigit(t *testing.T) {
	expectParseError(t, "³s")
}

func Test_unhappy_1__RejectsFullwidthUnit(t *testing.T) {
	expectParseError(t, "3ｓ")
}

// Extends public Test_unhappy_1__RejectsWhitespaceOnly.
func Test_unhappy_1__RejectsUnicodeWhitespaceOnly(t *testing.T) {
	expectParseError(t, " 　")
}

// Extends public Test_unhappy_1__RejectsDoubleZero.
func Test_unhappy_1__RejectsDoubleZeroInLaterComponent(t *testing.T) {
	expectParseError(t, "1h00m")
}

func Test_unhappy_1__RejectsHexCount(t *testing.T) {
	expectParseError(t, "0x10s")
}

func Test_unhappy_1__RejectsExponentCount(t *testing.T) {
	expectParseError(t, "1e3ms")
}

// R2 @happy 2: A count may exceed the next unit.

// Extends public Test_happy_2__Parses90Minutes with other units.
func Test_happy_2__Parses1000Seconds(t *testing.T) {
	expectParse(t, "1000s", 1000000)
}

func Test_happy_2__Parses48Hours(t *testing.T) {
	expectParse(t, "48h", 172800000)
}

func Test_happy_2__Parses1500Milliseconds(t *testing.T) {
	expectParse(t, "1500ms", 1500)
}

func Test_happy_2__Parses61Seconds(t *testing.T) {
	expectParse(t, "61s", 61000)
}

// Extends public Test_happy_2__ParsesHoursBeyondADayWithMilliseconds: every
// component exceeds the next unit's size.
func Test_happy_2__ParsesEveryComponentAboveNextUnit(t *testing.T) {
	expectParse(t, "100d25h61m61s1001ms", 8733722001)
}

func Test_happy_2__ParsesMinutesBeyondADayWithSeconds(t *testing.T) {
	expectParse(t, "1500m90s", 90090000)
}

// R2 @unhappy 2: Out-of-order or repeated units are rejected.

// Extends public Test_unhappy_2__RejectsMinutesBeforeHours.
func Test_unhappy_2__RejectsHoursBeforeDays(t *testing.T) {
	expectParseError(t, "1h1d")
}

func Test_unhappy_2__RejectsSecondsBeforeMinutes(t *testing.T) {
	expectParseError(t, "1s1m")
}

func Test_unhappy_2__RejectsMillisecondsBeforeDays(t *testing.T) {
	expectParseError(t, "1ms1d")
}

func Test_unhappy_2__RejectsFullyReversedUnits(t *testing.T) {
	expectParseError(t, "1ms1s1m1h1d")
}

func Test_unhappy_2__RejectsOutOfOrderWithZeroCounts(t *testing.T) {
	expectParseError(t, "0m0h")
}

func Test_unhappy_2__RejectsOutOfOrderAfterValidPrefix(t *testing.T) {
	expectParseError(t, "1d2h3s4m")
}

// Extends public Test_unhappy_2__RejectsRepeatedHours.
func Test_unhappy_2__RejectsRepeatedDays(t *testing.T) {
	expectParseError(t, "1d1d")
}

func Test_unhappy_2__RejectsRepeatedMinutes(t *testing.T) {
	expectParseError(t, "1m1m")
}

func Test_unhappy_2__RejectsRepeatedSeconds(t *testing.T) {
	expectParseError(t, "1s2s")
}

func Test_unhappy_2__RejectsRepeatedUnitWithOthersBetween(t *testing.T) {
	expectParseError(t, "1h2m3h")
}

func Test_unhappy_2__RejectsRepeatedDaysAfterEveryUnit(t *testing.T) {
	expectParseError(t, "1d1h1m1s1ms1d")
}

// Extends public Test_unhappy_2__RejectsSecondsAfterMilliseconds.
func Test_unhappy_2__RejectsMinutesAfterMilliseconds(t *testing.T) {
	expectParseError(t, "1ms1m")
}

func Test_unhappy_2__RejectsRepeatedZeroMilliseconds(t *testing.T) {
	expectParseError(t, "0ms0ms")
}

// R3 @boundary 2: The largest duration parses.

// Extends public Test_boundary_2__ParsesLargestDuration with other spellings
// of the same total.
func Test_boundary_2__ParsesLargestDurationAsSecondsAndMilliseconds(t *testing.T) {
	expectParse(t, "9007199254740s991ms", 9007199254740991)
}

func Test_boundary_2__ParsesLargestDurationAsMinutesAndMilliseconds(t *testing.T) {
	expectParse(t, "150119987579m991ms", 9007199254740991)
}

func Test_boundary_2__ParsesLargestDurationAsHoursMinutesAndMilliseconds(t *testing.T) {
	expectParse(t, "2501999792h59m991ms", 9007199254740991)
}

func Test_boundary_2__ParsesLargestDurationAsDaysAndMilliseconds(t *testing.T) {
	expectParse(t, "104249991d32340991ms", 9007199254740991)
}

func Test_boundary_2__ParsesLargestDurationWithZeroSeconds(t *testing.T) {
	expectParse(t, "104249991d8h59m0s991ms", 9007199254740991)
}

func Test_boundary_2__ParsesLargestDurationWithSurroundingWhitespace(t *testing.T) {
	expectParse(t, " 104249991d8h59m991ms\n", 9007199254740991)
}

func Test_boundary_2__ParsesOneBelowLargestDuration(t *testing.T) {
	expectParse(t, "104249991d8h59m990ms", 9007199254740990)
}

func Test_boundary_2__ParsesLargestWholeDays(t *testing.T) {
	expectParse(t, "104249991d", 9007199222400000)
}

// R3 @unhappy 3: Totals above the largest are rejected.

// Extends public Test_unhappy_3__RejectsOneAboveLargest with other
// spellings of totals just above the largest.
func Test_unhappy_3__RejectsOneDayAboveLargestWholeDays(t *testing.T) {
	expectParseError(t, "104249992d")
}

func Test_unhappy_3__RejectsSecondsJustAboveLargest(t *testing.T) {
	expectParseError(t, "9007199254741s")
}

func Test_unhappy_3__RejectsMinutesJustAboveLargest(t *testing.T) {
	expectParseError(t, "150119987580m")
}

func Test_unhappy_3__RejectsExtraSecondsAboveLargest(t *testing.T) {
	expectParseError(t, "104249991d8h59m59s991ms")
}

// Extends public Test_unhappy_3__RejectsComponentsWhoseSumExceedsLargest:
// each component is within range on its own.
func Test_unhappy_3__RejectsLargestPlusOneSecondPrefix(t *testing.T) {
	expectParseError(t, "1s9007199254740991ms")
}

func Test_unhappy_3__RejectsTwoLargeComponentsSummingAboveLargest(t *testing.T) {
	expectParseError(t, "52124996d4503599627370496ms")
}

// Extends public Test_unhappy_3__RejectsCountTooLargeForInt64: counts whose
// product or digits would wrap to a small in-range value.
func Test_unhappy_3__RejectsDaysThatWrapToSmallValue(t *testing.T) {
	// 213503982335 * 86400000 wraps modulo 2^64 to 34448384.
	expectParseError(t, "213503982335d")
}

func Test_unhappy_3__RejectsHoursThatWrapToSmallValue(t *testing.T) {
	// 5124095576031 * 3600000 wraps modulo 2^64 to 2048384.
	expectParseError(t, "5124095576031h")
}

func Test_unhappy_3__RejectsMinutesThatWrapToSmallValue(t *testing.T) {
	// 307445734561826 * 60000 wraps modulo 2^64 to 8384.
	expectParseError(t, "307445734561826m")
}

func Test_unhappy_3__RejectsSecondsThatWrapToSmallValue(t *testing.T) {
	// 18446744073709552 * 1000 wraps modulo 2^64 to 384.
	expectParseError(t, "18446744073709552s")
}

func Test_unhappy_3__RejectsMillisecondCountThatWrapsToSmallValue(t *testing.T) {
	// 2^64 + 5 wraps to 5.
	expectParseError(t, "18446744073709551621ms")
}

func Test_unhappy_3__RejectsMaxInt64Milliseconds(t *testing.T) {
	expectParseError(t, "9223372036854775807ms")
}

func Test_unhappy_3__RejectsVeryLongCount(t *testing.T) {
	expectParseError(t, "1000000000000000000000000000000000000000s")
}

func Test_unhappy_3__RejectsOverflowInLaterComponent(t *testing.T) {
	expectParseError(t, "1d99999999999999999999ms")
}
