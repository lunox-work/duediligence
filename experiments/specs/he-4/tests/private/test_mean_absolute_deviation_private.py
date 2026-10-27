import unittest

from src.solution import mean_absolute_deviation


def brute_mad(numbers):
    # Direct transcription of the docstring: mean, then average |x - mean|.
    mean = sum(numbers) / len(numbers)
    return sum(abs(x - mean) for x in numbers) / len(numbers)


class TestMeanAbsoluteDeviationPrivate(unittest.TestCase):
    # Extends test_docstring_example: same values, shuffled order.
    # Mean 2.5; deviations 1.5, 0.5, 0.5, 1.5 sum to 4; 4/4 = 1.0.
    def test_docstring_values_unordered(self):
        self.assertAlmostEqual(mean_absolute_deviation([4.0, 1.0, 3.0, 2.0]), 1.0)

    # Extends test_docstring_example: odd length.
    # [1..5] mean 3; deviations 2, 1, 0, 1, 2 sum to 6; 6/5 = 1.2.
    def test_one_to_five(self):
        self.assertAlmostEqual(mean_absolute_deviation([1.0, 2.0, 3.0, 4.0, 5.0]), 1.2)

    # Extends test_docstring_example: large size.
    # [0..999] mean 499.5; sum |i - 499.5| = 2 * sum_{k=0}^{499} (k + 0.5)
    # = 2 * (124750 + 250) = 250000; 250000/1000 = 250.0.
    def test_large_range(self):
        self.assertAlmostEqual(
            mean_absolute_deviation([float(i) for i in range(1000)]), 250.0
        )

    # Extends test_centerpoint_is_mean_skewed_data: mean differs from median.
    # [0, 0, 0, 12] mean 3; deviations 3, 3, 3, 9 sum to 18; 18/4 = 4.5.
    # (Around the median 0 it would be 12/4 = 3.0.)
    def test_centerpoint_is_mean_not_median(self):
        self.assertAlmostEqual(mean_absolute_deviation([0.0, 0.0, 0.0, 12.0]), 4.5)

    # Extends test_centerpoint_is_mean_skewed_data: odd length with duplicates.
    # [0, 0, 6] mean 2; deviations 2, 2, 4 sum to 8; 8/3.
    # (Median 0 gives 6/3 = 2.0; dividing by n-1 gives 4.0.)
    def test_odd_length_duplicates_skewed(self):
        self.assertAlmostEqual(mean_absolute_deviation([0.0, 0.0, 6.0]), 8.0 / 3.0)

    # Extends test_centerpoint_is_mean_skewed_data: duplicates, mean not median.
    # [1, 1, 1, 5] mean 2; deviations 1, 1, 1, 3 sum to 6; 6/4 = 1.5.
    def test_duplicates_with_outlier(self):
        self.assertAlmostEqual(mean_absolute_deviation([1.0, 1.0, 1.0, 5.0]), 1.5)

    # Extends test_centerpoint_is_mean_skewed_data: outlier first, unsorted.
    # [10, 3, 1, 2] mean 4; deviations 6, 1, 3, 2 sum to 12; 12/4 = 3.0.
    def test_skewed_unsorted(self):
        self.assertAlmostEqual(mean_absolute_deviation([10.0, 3.0, 1.0, 2.0]), 3.0)

    # Extends test_single_element_is_zero: negative single element.
    def test_single_negative_is_zero(self):
        self.assertAlmostEqual(mean_absolute_deviation([-3.7]), 0.0)

    # Extends test_single_element_is_zero: single zero.
    def test_single_zero_is_zero(self):
        self.assertAlmostEqual(mean_absolute_deviation([0.0]), 0.0)

    # Extends test_single_element_is_zero: large magnitude single element.
    def test_single_large_is_zero(self):
        self.assertAlmostEqual(mean_absolute_deviation([1e9]), 0.0)

    # Extends test_average_divides_by_count: n = 5 rather than 2.
    # [0, 0, 0, 0, 10] mean 2; deviations 2, 2, 2, 2, 8 sum to 16; 16/5 = 3.2.
    # (Dividing by n-1 gives 4.0.)
    def test_divides_by_count_five(self):
        self.assertAlmostEqual(
            mean_absolute_deviation([0.0, 0.0, 0.0, 0.0, 10.0]), 3.2
        )

    # Extends test_average_divides_by_count: non-terminating quotient.
    # [0, 1, 2] mean 1; deviations 1, 0, 1 sum to 2; 2/3.
    def test_divides_by_count_three(self):
        self.assertAlmostEqual(mean_absolute_deviation([0.0, 1.0, 2.0]), 2.0 / 3.0)

    # Extends test_all_equal_is_zero: many equal negative values.
    def test_all_equal_negative_many(self):
        self.assertAlmostEqual(mean_absolute_deviation([-1.5] * 10), 0.0)

    # Extends test_all_equal_is_zero: large count of equal values.
    def test_all_equal_large_count(self):
        self.assertAlmostEqual(mean_absolute_deviation([7.0] * 500), 0.0)

    # Extends test_absolute_value_with_negatives: all negative.
    # [-1, -2, -3, -4] mean -2.5; deviations 1.5, 0.5, 0.5, 1.5 sum to 4; 1.0.
    def test_all_negative(self):
        self.assertAlmostEqual(mean_absolute_deviation([-1.0, -2.0, -3.0, -4.0]), 1.0)

    # Extends test_absolute_value_with_negatives: negative outlier.
    # [-9, 1, 1, 3] mean -1; deviations 8, 2, 2, 4 sum to 16; 16/4 = 4.0.
    def test_negative_outlier(self):
        self.assertAlmostEqual(mean_absolute_deviation([-9.0, 1.0, 1.0, 3.0]), 4.0)

    # Extends test_absolute_value_symmetric_pair: fractional symmetric pair.
    # [-0.5, 0.5] mean 0; deviations 0.5, 0.5; 1/2 = 0.5.
    def test_symmetric_fractional_pair(self):
        self.assertAlmostEqual(mean_absolute_deviation([-0.5, 0.5]), 0.5)

    # Extends test_absolute_value_symmetric_pair: pair not centred on 0.
    # [11, 3] mean 7; deviations 4, 4; 8/2 = 4.0.
    def test_asymmetric_pair(self):
        self.assertAlmostEqual(mean_absolute_deviation([11.0, 3.0]), 4.0)

    # Extends test_absolute_value_symmetric_pair: large offset pair.
    # [1e6, 1e6 + 2] mean 1e6 + 1; deviations 1, 1; 2/2 = 1.0.
    def test_large_offset_pair(self):
        self.assertAlmostEqual(mean_absolute_deviation([1e6, 1e6 + 2.0]), 1.0)

    # Rule: fractional inputs.
    # [0.1, 0.2, 0.3] mean 0.2; deviations 0.1, 0, 0.1 sum to 0.2; 0.2/3.
    def test_fractional_values(self):
        self.assertAlmostEqual(
            mean_absolute_deviation([0.1, 0.2, 0.3]), 0.2 / 3.0
        )

    # Rule: whole formula on irregular data, checked against the brute force
    # brute_mad (a literal transcription of the docstring formula).
    def test_irregular_data_matches_brute_force(self):
        data = [3.5, -2.25, 8.0, 0.0, -7.5, 4.75, 4.75, 1.0, -0.125]
        self.assertAlmostEqual(mean_absolute_deviation(data), brute_mad(data))

    # Rule: larger irregular data, checked against brute_mad.
    def test_larger_irregular_matches_brute_force(self):
        data = [float((i * 37) % 101 - 50) / 4.0 for i in range(300)]
        self.assertAlmostEqual(mean_absolute_deviation(data), brute_mad(data))

    # Rule: the result is a float (return annotation), and order does not
    # matter since mean and the sum of deviations are order-independent.
    def test_order_independent_and_float(self):
        data = [5.0, -1.0, 2.0, 9.0, 0.5]
        result = mean_absolute_deviation(data)
        self.assertIsInstance(result, float)
        self.assertAlmostEqual(result, mean_absolute_deviation(list(reversed(data))))
        self.assertAlmostEqual(result, brute_mad(data))


if __name__ == "__main__":
    unittest.main()
