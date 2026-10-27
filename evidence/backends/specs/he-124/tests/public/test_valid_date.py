import unittest

from src.solution import valid_date


class TestValidDate(unittest.TestCase):
    def test_example_march_date(self):
        self.assertEqual(valid_date("03-11-2000"), True)

    def test_example_month_fifteen(self):
        self.assertEqual(valid_date("15-01-2012"), False)

    def test_example_zero_day(self):
        self.assertEqual(valid_date("04-0-2040"), False)

    def test_example_june_date(self):
        self.assertEqual(valid_date("06-04-2020"), True)

    def test_example_slash_separators(self):
        self.assertEqual(valid_date("06/04/2020"), False)

    def test_empty_string(self):
        # Rule 1 excludes the empty string.
        self.assertEqual(valid_date(""), False)

    def test_january_last_day(self):
        # January is in the 31-day group, so 31 is inclusive.
        self.assertEqual(valid_date("01-31-2020"), True)

    def test_march_last_day(self):
        # March is in the 31-day group, so 31 is inclusive.
        self.assertEqual(valid_date("03-31-2020"), True)

    def test_may_last_day(self):
        # May is in the 31-day group, so 31 is inclusive.
        self.assertEqual(valid_date("05-31-2020"), True)

    def test_july_last_day(self):
        # July is in the 31-day group, so 31 is inclusive.
        self.assertEqual(valid_date("07-31-2020"), True)

    def test_august_last_day(self):
        # August is in the 31-day group, so 31 is inclusive.
        self.assertEqual(valid_date("08-31-2020"), True)

    def test_october_last_day(self):
        # October is in the 31-day group, so 31 is inclusive.
        self.assertEqual(valid_date("10-31-2020"), True)

    def test_december_last_day(self):
        # December is in the 31-day group; month 12 is also inclusive.
        self.assertEqual(valid_date("12-31-2020"), True)

    def test_january_day_above_maximum(self):
        # 32 is one greater than January's stated maximum of 31.
        self.assertEqual(valid_date("01-32-2020"), False)

    def test_march_day_above_maximum(self):
        # 32 is one greater than March's stated maximum of 31.
        self.assertEqual(valid_date("03-32-2020"), False)

    def test_may_day_above_maximum(self):
        # 32 is one greater than May's stated maximum of 31.
        self.assertEqual(valid_date("05-32-2020"), False)

    def test_july_day_above_maximum(self):
        # 32 is one greater than July's stated maximum of 31.
        self.assertEqual(valid_date("07-32-2020"), False)

    def test_august_day_above_maximum(self):
        # 32 is one greater than August's stated maximum of 31.
        self.assertEqual(valid_date("08-32-2020"), False)

    def test_october_day_above_maximum(self):
        # 32 is one greater than October's stated maximum of 31.
        self.assertEqual(valid_date("10-32-2020"), False)

    def test_december_day_above_maximum(self):
        # 32 is one greater than December's stated maximum of 31.
        self.assertEqual(valid_date("12-32-2020"), False)

    def test_april_last_day(self):
        # April is in the 30-day group, so 30 is inclusive.
        self.assertEqual(valid_date("04-30-2020"), True)

    def test_june_last_day(self):
        # June is in the 30-day group, so 30 is inclusive.
        self.assertEqual(valid_date("06-30-2020"), True)

    def test_september_last_day(self):
        # September is in the 30-day group, so 30 is inclusive.
        self.assertEqual(valid_date("09-30-2020"), True)

    def test_november_last_day(self):
        # November is in the 30-day group, so 30 is inclusive.
        self.assertEqual(valid_date("11-30-2020"), True)

    def test_april_day_above_maximum(self):
        # 31 is one greater than April's stated maximum of 30.
        self.assertEqual(valid_date("04-31-2020"), False)

    def test_june_day_above_maximum(self):
        # 31 is one greater than June's stated maximum of 30.
        self.assertEqual(valid_date("06-31-2020"), False)

    def test_september_day_above_maximum(self):
        # 31 is one greater than September's stated maximum of 30.
        self.assertEqual(valid_date("09-31-2020"), False)

    def test_november_day_above_maximum(self):
        # 31 is one greater than November's stated maximum of 30.
        self.assertEqual(valid_date("11-31-2020"), False)

    def test_february_typical_day(self):
        # 15 lies between February's stated bounds of 1 and 29.
        self.assertEqual(valid_date("02-15-2020"), True)

    def test_february_last_day(self):
        # February's stated maximum is 29, inclusive.
        self.assertEqual(valid_date("02-29-2020"), True)

    def test_february_last_day_in_non_leap_year(self):
        # The stated February limit is 29 with no condition on the year.
        self.assertEqual(valid_date("02-29-2019"), True)

    def test_february_day_above_maximum(self):
        # 30 is one greater than February's stated maximum of 29.
        self.assertEqual(valid_date("02-30-2020"), False)

    def test_first_day_of_thirty_one_day_month(self):
        # Day 1 and month 1 are both inclusive lower bounds.
        self.assertEqual(valid_date("01-01-2020"), True)

    def test_zero_day_of_thirty_one_day_month(self):
        # Day 0 is one below the inclusive lower bound of 1.
        self.assertEqual(valid_date("01-00-2020"), False)

    def test_first_day_of_thirty_day_month(self):
        # The 30-day group also admits its lower bound, day 1.
        self.assertEqual(valid_date("04-01-2020"), True)

    def test_zero_day_of_thirty_day_month(self):
        # The 30-day group excludes day 0 because it is below 1.
        self.assertEqual(valid_date("04-00-2020"), False)

    def test_first_day_of_february(self):
        # February also admits its lower bound, day 1.
        self.assertEqual(valid_date("02-01-2020"), True)

    def test_zero_day_of_february(self):
        # February excludes day 0 because it is below 1.
        self.assertEqual(valid_date("02-00-2020"), False)

    def test_month_below_minimum(self):
        # Month 0 is one below the inclusive lower bound of 1.
        self.assertEqual(valid_date("00-15-2020"), False)

    def test_month_above_maximum(self):
        # Month 13 is one above the inclusive upper bound of 12.
        self.assertEqual(valid_date("13-15-2020"), False)

    def test_year_first_format(self):
        # yyyy-mm-dd does not match the required mm-dd-yyyy order.
        self.assertEqual(valid_date("2020-06-04"), False)

    def test_missing_year(self):
        # Removing the year leaves only two of the three required fields.
        self.assertEqual(valid_date("06-04"), False)

    def test_extra_date_field(self):
        # A fourth field is outside the required three-field format.
        self.assertEqual(valid_date("06-04-2020-01"), False)
