import unittest

from src.solution import valid_date

# Days allowed per month, copied from rule 2 of the docstring.
MAX_DAY = {1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
           7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}


class TestValidDatePrivate(unittest.TestCase):
    # Rule 2, every month at its last allowed day and one past it.
    # Extends test_rule2_31_day_month_day_31_is_valid,
    # test_rule2_30_day_month_day_30_is_valid and the "day 32/31/30 is
    # invalid" tests, which only check months 1, 12, 4, 11 and 2. A
    # table that gets any other month wrong fails here.

    def test_month_01_day_31_valid(self):
        self.assertIs(valid_date('01-31-2021'), True)

    def test_month_01_day_32_invalid(self):
        self.assertIs(valid_date('01-32-2021'), False)

    def test_month_02_day_29_valid(self):
        self.assertIs(valid_date('02-29-2024'), True)

    def test_month_02_day_30_invalid(self):
        self.assertIs(valid_date('02-30-2021'), False)

    def test_month_02_day_31_invalid(self):
        self.assertIs(valid_date('02-31-2021'), False)

    def test_month_03_day_31_valid(self):
        self.assertIs(valid_date('03-31-2021'), True)

    def test_month_03_day_32_invalid(self):
        self.assertIs(valid_date('03-32-2021'), False)

    def test_month_04_day_31_invalid(self):
        self.assertIs(valid_date('04-31-2021'), False)

    def test_month_05_day_31_valid(self):
        self.assertIs(valid_date('05-31-2021'), True)

    def test_month_05_day_32_invalid(self):
        self.assertIs(valid_date('05-32-2021'), False)

    def test_month_06_day_30_valid(self):
        self.assertIs(valid_date('06-30-2021'), True)

    def test_month_06_day_31_invalid(self):
        self.assertIs(valid_date('06-31-2021'), False)

    def test_month_07_day_31_valid(self):
        self.assertIs(valid_date('07-31-2021'), True)

    def test_month_07_day_32_invalid(self):
        self.assertIs(valid_date('07-32-2021'), False)

    def test_month_08_day_31_valid(self):
        self.assertIs(valid_date('08-31-2021'), True)

    def test_month_08_day_32_invalid(self):
        self.assertIs(valid_date('08-32-2021'), False)

    def test_month_09_day_30_valid(self):
        self.assertIs(valid_date('09-30-2021'), True)

    def test_month_09_day_31_invalid(self):
        self.assertIs(valid_date('09-31-2021'), False)

    def test_month_10_day_31_valid(self):
        self.assertIs(valid_date('10-31-2021'), True)

    def test_month_10_day_32_invalid(self):
        self.assertIs(valid_date('10-32-2021'), False)

    def test_month_11_day_30_valid(self):
        self.assertIs(valid_date('11-30-2021'), True)

    def test_month_12_day_31_valid(self):
        self.assertIs(valid_date('12-31-2021'), True)

    # Extends test_rule2_february_day_29_is_valid, which uses leap year
    # 2020. Rule 2 allows day 29 in month 2 with no mention of leap
    # years, and no rule restricts the year, so 02-29 is valid in any
    # year. A calendar-based shortcut (datetime) fails these.

    def test_feb_29_non_leap_year_2021_valid(self):
        self.assertIs(valid_date('02-29-2021'), True)

    def test_feb_29_century_non_leap_1900_valid(self):
        self.assertIs(valid_date('02-29-1900'), True)

    def test_feb_29_year_2023_valid(self):
        self.assertIs(valid_date('02-29-2023'), True)

    # Extends test_rule2_day_00_is_invalid (month 3 only): day 00 is
    # below 1 in a 30-day month and in February too.

    def test_day_00_in_30_day_month_invalid(self):
        self.assertIs(valid_date('06-00-2020'), False)

    def test_day_00_in_february_invalid(self):
        self.assertIs(valid_date('02-00-2020'), False)

    # Extends test_rule2_day_01_is_valid: day 01 in February and in a
    # 30-day month.

    def test_day_01_february_valid(self):
        self.assertIs(valid_date('02-01-2021'), True)

    def test_day_01_30_day_month_valid(self):
        self.assertIs(valid_date('11-01-2021'), True)

    # Extends test_rule2_31_day_month_day_32_is_invalid: days far past
    # the range are invalid too.

    def test_day_99_invalid(self):
        self.assertIs(valid_date('01-99-2021'), False)

    # Many: every month 01..12 crossed with every day 00..35. Expected
    # value computed from the rule-2 table above: valid iff
    # 1 <= day <= MAX_DAY[month].
    def test_all_months_all_days_against_rule_table(self):
        for m in range(1, 13):
            for d in range(0, 36):
                s = '%02d-%02d-2021' % (m, d)
                with self.subTest(date=s):
                    self.assertIs(valid_date(s), 1 <= d <= MAX_DAY[m])

    # Extends test_rule3_month_13_is_invalid and
    # test_rule3_month_00_is_invalid: every two-digit month outside
    # 1..12 is invalid, with a day (01) that no month would reject.
    def test_all_out_of_range_months_invalid(self):
        for m in [0] + list(range(13, 100)):
            s = '%02d-01-2021' % m
            with self.subTest(date=s):
                self.assertIs(valid_date(s), False)

    # Extends test_rule3_month_13_is_invalid: month 13 with day 31 —
    # an implementation that falls through to a "31 days" default for
    # unknown months would accept it.
    def test_month_13_day_31_invalid(self):
        self.assertIs(valid_date('13-31-2021'), False)

    # Extends test_example_15_01_2012: the dd-mm-yyyy reading. Month
    # comes first; '01-13-2020' is month 1 day 13 (valid), while
    # '13-01-2020' would be month 13 (invalid). An implementation that
    # swaps fields gets both wrong.

    def test_day_13_valid_when_month_first(self):
        self.assertIs(valid_date('01-13-2020'), True)

    def test_day_greater_than_12_month_first_valid(self):
        self.assertIs(valid_date('07-25-1999'), True)

    def test_swapped_day_month_invalid(self):
        self.assertIs(valid_date('25-07-1999'), False)

    # Extends test_example_03_11_2000 / test_example_06_04_2020: other
    # valid dates, including leading-zero fields 08 and 09 (which break
    # an octal/eval-style parse).

    def test_leading_zero_08_09_valid(self):
        self.assertIs(valid_date('08-09-2008'), True)

    def test_leading_zero_09_08_valid(self):
        self.assertIs(valid_date('09-08-2009'), True)

    def test_mid_month_mid_day_valid(self):
        self.assertIs(valid_date('10-10-2010'), True)

    # No rule restricts the year, so the ends of yyyy are valid.

    def test_year_0000_valid(self):
        self.assertIs(valid_date('01-01-0000'), True)

    def test_year_9999_valid(self):
        self.assertIs(valid_date('12-31-9999'), True)

    # Extends test_example_06_slash_04_slash_2020: other separators
    # are not mm-dd-yyyy.

    def test_dot_separator_invalid(self):
        self.assertIs(valid_date('06.04.2020'), False)

    def test_space_separator_invalid(self):
        self.assertIs(valid_date('06 04 2020'), False)

    def test_mixed_separator_invalid(self):
        self.assertIs(valid_date('06-04/2020'), False)

    def test_mixed_separator_other_side_invalid(self):
        self.assertIs(valid_date('06/04-2020'), False)

    # Extends test_rule4_no_separators_is_invalid and
    # test_rule4_missing_year_is_invalid: other malformed strings.

    def test_yyyy_mm_dd_order_invalid(self):
        # Valid fields in the wrong order: first field 2020 is not mm.
        self.assertIs(valid_date('2020-06-04'), False)

    def test_trailing_separator_empty_year_invalid(self):
        self.assertIs(valid_date('04-12-'), False)

    def test_missing_month_invalid(self):
        self.assertIs(valid_date('-12-2020'), False)

    def test_empty_day_field_invalid(self):
        self.assertIs(valid_date('04--2020'), False)

    def test_extra_field_invalid(self):
        self.assertIs(valid_date('04-12-2020-01'), False)

    def test_letters_instead_of_digits_invalid(self):
        self.assertIs(valid_date('mm-dd-yyyy'), False)

    def test_month_name_invalid(self):
        self.assertIs(valid_date('Jan-12-2020'), False)

    def test_letter_in_year_invalid(self):
        self.assertIs(valid_date('04-12-20a0'), False)

    def test_negative_day_invalid(self):
        # A '-' before the day makes an extra empty field; not mm-dd-yyyy.
        self.assertIs(valid_date('04--1-2020'), False)

    def test_negative_month_invalid(self):
        self.assertIs(valid_date('-4-12-2020'), False)

    def test_only_separators_invalid(self):
        self.assertIs(valid_date('--'), False)

    # Extends test_example_04_0_2040: a one-digit zero day is invalid in
    # other months too (day 0 fails rule 2 regardless of width).
    def test_single_zero_day_other_month_invalid(self):
        self.assertIs(valid_date('12-0-2040'), False)


if __name__ == '__main__':
    unittest.main()
