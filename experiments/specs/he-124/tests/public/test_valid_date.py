import unittest

from src.solution import valid_date


class TestValidDate(unittest.TestCase):
    # Docstring examples.

    def test_example_03_11_2000(self):
        self.assertIs(valid_date('03-11-2000'), True)

    def test_example_15_01_2012(self):
        self.assertIs(valid_date('15-01-2012'), False)

    def test_example_04_0_2040(self):
        self.assertIs(valid_date('04-0-2040'), False)

    def test_example_06_04_2020(self):
        self.assertIs(valid_date('06-04-2020'), True)

    def test_example_06_slash_04_slash_2020(self):
        self.assertIs(valid_date('06/04/2020'), False)

    # Rule 1: the date string is not empty.

    def test_rule1_empty_string_is_invalid(self):
        # Rule 1 fails outright.
        self.assertIs(valid_date(''), False)

    def test_rule1_whitespace_only_is_invalid(self):
        # Non-empty, but a single space has no mm, dd or yyyy part, so
        # rule 4 (format mm-dd-yyyy) fails.
        self.assertIs(valid_date(' '), False)

    # Rule 2: day ranges per month.

    def test_rule2_31_day_month_mid_day_is_valid(self):
        # Month 8 allows 1..31; day 15 is inside, month 8 is in 1..12,
        # format is mm-dd-yyyy, so every rule holds.
        self.assertIs(valid_date('08-15-2021'), True)

    def test_rule2_31_day_month_day_31_is_valid(self):
        # Upper edge: month 1 allows up to 31.
        self.assertIs(valid_date('01-31-2020'), True)

    def test_rule2_31_day_month_day_32_is_invalid(self):
        # Just past the upper edge: month 12 allows at most 31.
        self.assertIs(valid_date('12-32-2021'), False)

    def test_rule2_day_00_is_invalid(self):
        # Lower edge: day 0 is less than 1 for any month.
        self.assertIs(valid_date('03-00-2020'), False)

    def test_rule2_day_01_is_valid(self):
        # Lower edge: day 1 is the smallest allowed day.
        self.assertIs(valid_date('05-01-2020'), True)

    def test_rule2_30_day_month_mid_day_is_valid(self):
        # Month 9 allows 1..30; day 15 is inside.
        self.assertIs(valid_date('09-15-2021'), True)

    def test_rule2_30_day_month_day_30_is_valid(self):
        # Upper edge: month 4 allows up to 30.
        self.assertIs(valid_date('04-30-2021'), True)

    def test_rule2_30_day_month_day_31_is_invalid(self):
        # Just past the upper edge: month 11 allows at most 30.
        self.assertIs(valid_date('11-31-2021'), False)

    def test_rule2_february_mid_day_is_valid(self):
        # Month 2 allows 1..29; day 14 is inside.
        self.assertIs(valid_date('02-14-2021'), True)

    def test_rule2_february_day_29_is_valid(self):
        # Upper edge: month 2 allows up to 29 (2020 is also a leap year,
        # so this holds under any calendar reading).
        self.assertIs(valid_date('02-29-2020'), True)

    def test_rule2_february_day_30_is_invalid(self):
        # Just past the upper edge: month 2 allows at most 29.
        self.assertIs(valid_date('02-30-2020'), False)

    # Rule 3: month range 1..12.

    def test_rule3_month_12_is_valid(self):
        # Upper edge: month 12 is allowed; day 25 is within its 31 days.
        self.assertIs(valid_date('12-25-2020'), True)

    def test_rule3_month_13_is_invalid(self):
        # Just past the upper edge.
        self.assertIs(valid_date('13-01-2020'), False)

    def test_rule3_month_00_is_invalid(self):
        # Below the lower edge: month 0 is less than 1.
        self.assertIs(valid_date('00-10-2020'), False)

    def test_rule3_month_01_is_valid(self):
        # Lower edge: month 1 is allowed.
        self.assertIs(valid_date('01-01-2020'), True)

    # Rule 4: format mm-dd-yyyy.

    def test_rule4_no_separators_is_invalid(self):
        # Digits only, no '-' separators: not mm-dd-yyyy.
        self.assertIs(valid_date('04122003'), False)

    def test_rule4_missing_year_is_invalid(self):
        # Only mm-dd present; the yyyy part is missing.
        self.assertIs(valid_date('04-12'), False)


if __name__ == '__main__':
    unittest.main()
