import unittest

from src.solution import simplify


class TestSimplifyHidden(unittest.TestCase):
    # Extends test_example_reciprocal_product: reciprocals need not have a unit numerator.
    def test_reciprocals_with_two_digit_numerators(self):
        # (37 * 101) / (101 * 37) = 1.
        self.assertIs(simplify("37/101", "101/37"), True)

    # Extends test_example_reciprocal_product: reverse the proper/improper order.
    def test_integer_followed_by_its_reciprocal(self):
        # 113 * (1/113) = 1.
        self.assertIs(simplify("113/1", "1/113"), True)

    # Extends test_example_nonwhole_product: shared factors do not ensure integrality.
    def test_integer_cancels_only_part_of_denominator(self):
        # (1 * 6) / (14 * 1) = 3/7.
        self.assertIs(simplify("1/14", "6/1"), False)

    # Extends test_example_nonwhole_product: cancelling x's denominator is insufficient.
    def test_unit_numerator_with_remaining_second_denominator(self):
        # (1 * 42) / (14 * 5) = 3/5.
        self.assertIs(simplify("1/14", "42/5"), False)

    # Extends test_example_partial_cancellation: cancellation can leave a value above one.
    def test_partial_cancellation_leaves_noninteger_above_ten(self):
        # (17 * 126) / (42 * 5) = 51/5.
        self.assertIs(simplify("17/42", "126/5"), False)

    # Extends test_whole_product_greater_than_one: larger factors and a larger result.
    def test_cancellation_produces_fifteen(self):
        # (25 * 54) / (18 * 5) = 1350/90 = 15.
        self.assertIs(simplify("25/18", "54/5"), True)

    # Extends test_whole_product_greater_than_one: exchange which fraction is proper.
    def test_proper_first_factor_produces_six(self):
        # (14 * 45) / (15 * 7) = 630/105 = 6.
        self.assertIs(simplify("14/15", "45/7"), True)

    # Extends test_all_components_at_minimum_positive_value: identity alone is insufficient.
    def test_identity_times_nonwhole_fraction(self):
        # 1 * (19/23) = 19/23.
        self.assertIs(simplify("1/1", "19/23"), False)

    # Extends test_all_components_at_minimum_positive_value: identity can be second.
    def test_unreduced_integer_times_identity(self):
        # (84/7) * 1 = 12.
        self.assertIs(simplify("84/7", "1/1"), True)

    # Extends test_nonwhole_product_greater_than_one: cancellation still leaves a fraction.
    def test_nonwhole_product_with_larger_integer_part(self):
        # (25 * 7) / (4 * 5) = 35/4.
        self.assertIs(simplify("25/4", "7/5"), False)

    # Extends test_minimum_numerators_with_proper_fractions: equal inputs are allowed.
    def test_repeated_unit_fraction(self):
        # (1/97)^2 = 1/9409, strictly between zero and one.
        self.assertIs(simplify("1/97", "1/97"), False)

    # Extends test_minimum_numerators_with_proper_fractions: no lower magnitude bound.
    def test_positive_product_too_small_for_binary_float(self):
        denominator = 10**400
        # The exact product is 1/10**800, positive and smaller than one.
        self.assertIs(simplify(f"1/{denominator}", f"1/{denominator}"), False)

    # Extends test_unreduced_fraction_can_produce_whole_product: both may be unreduced.
    def test_two_unreduced_fractions_produce_five(self):
        # (42 * 50) / (30 * 14) = 2100/420 = 5.
        self.assertIs(simplify("42/30", "50/14"), True)

    # Extends test_unreduced_fraction_can_produce_whole_product: reducibility is not enough.
    def test_two_unreduced_fractions_produce_one_half(self):
        # (18 * 20) / (24 * 30) = 360/720 = 1/2.
        self.assertIs(simplify("18/24", "20/30"), False)

    # Extends test_unreduced_fraction_can_produce_whole_product: split denominator factors.
    def test_integral_product_without_any_whole_pairwise_quotient(self):
        # (6 * 25) / (10 * 15) = 150/150 = 1. Neither denominator
        # divides either numerator on its own, so factors must combine.
        self.assertIs(simplify("6/10", "25/15"), True)

    # Extends test_both_denominators_at_minimum_positive_value: arbitrary integer sizes.
    def test_enormous_integers_with_unit_denominators(self):
        first = 10**400 + 7
        second = 10**401 + 3
        # Both factors are positive integers, hence so is their product.
        self.assertIs(simplify(f"{first}/1", f"{second}/1"), True)

    # Extends test_both_denominators_at_minimum_positive_value: one unit denominator.
    def test_unit_denominator_only_in_second_factor(self):
        # (26 * 7) / (15 * 1) = 182/15; 15 * 12 = 180.
        self.assertIs(simplify("26/15", "7/1"), False)

    # Extends test_both_denominators_at_minimum_positive_value: reverse the previous order.
    def test_unit_denominator_only_in_first_factor(self):
        # (7 * 26) / (1 * 15) = 182/15; 15 * 12 = 180.
        self.assertIs(simplify("7/1", "26/15"), False)

    # Extends test_both_fractions_improper: improper factors need not give a whole product.
    def test_two_improper_nonwhole_fractions(self):
        # (7 * 8) / (3 * 5) = 56/15; 15 * 3 = 45 and 15 * 4 = 60.
        self.assertIs(simplify("7/3", "8/5"), False)

    # Extends test_both_fractions_improper: each factor may already be a whole number.
    def test_two_unreduced_whole_factors(self):
        # (84/12) * (45/9) = 7 * 5 = 35.
        self.assertIs(simplify("84/12", "45/9"), True)

    # Extends test_both_fractions_improper: identical nonwhole factors stay nonwhole.
    def test_repeated_improper_nonwhole_fraction(self):
        # (5/2)^2 = 25/4.
        self.assertIs(simplify("5/2", "5/2"), False)

    # Extends test_both_fractions_improper: identical unreduced whole factors are valid.
    def test_repeated_unreduced_whole_fraction(self):
        # (18/6)^2 = 3^2 = 9.
        self.assertIs(simplify("18/6", "18/6"), True)

    # Extends test_unreduced_fraction_can_produce_whole_product: equal proper inputs.
    def test_repeated_unreduced_proper_fraction(self):
        # (6/8)^2 = (3/4)^2 = 9/16.
        self.assertIs(simplify("6/8", "6/8"), False)

    # Extends test_large_fraction_just_above_one_is_not_whole: approach one from below.
    def test_fraction_just_below_one(self):
        scale = 10**30
        # The product is 1 - 1/scale, strictly between zero and one.
        self.assertIs(simplify(f"{scale - 1}/{scale}", "1/1"), False)

    # Extends test_large_fraction_just_above_one_is_not_whole: a different integer boundary.
    def test_fraction_just_above_seven(self):
        scale = 10**30
        # The product is 7 + 1/scale, strictly between seven and eight.
        self.assertIs(simplify(f"{7 * scale + 1}/{scale}", "1/1"), False)

    # Extends test_large_fraction_just_above_one_is_not_whole: tiny remainder in n.
    def test_near_integer_in_second_factor(self):
        scale = 10**50
        # 1 * ((scale + 1)/scale) = 1 + 1/scale, strictly between one and two.
        self.assertIs(simplify("1/1", f"{scale + 1}/{scale}"), False)

    # Extends test_large_fraction_just_above_one_is_not_whole: both factors are near one.
    def test_near_integer_remainder_after_multiplication(self):
        scale = 10**18
        # (scale + 1)(scale - 1)/scale^2 = 1 - 1/scale^2, in (0, 1).
        self.assertIs(
            simplify(f"{scale + 1}/{scale}", f"{scale - 1}/{scale}"), False
        )

    # Extends test_unreduced_fraction_can_produce_whole_product: huge common factors.
    def test_enormous_unreduced_factors_cancel_exactly(self):
        scale = 10**400
        # (13s * 51s)/(17s * 13s) = 51/17 = 3 for positive s.
        self.assertIs(
            simplify(f"{13 * scale}/{17 * scale}", f"{51 * scale}/{13 * scale}"),
            True,
        )

    # Extends test_large_fraction_just_above_one_is_not_whole: enormous equal inputs.
    def test_enormous_nonwhole_factors_do_not_become_whole(self):
        scale = 10**400
        # ((scale + 1)/scale)^2 = 1 + 2/scale + 1/scale^2, in (1, 2).
        fraction = f"{scale + 1}/{scale}"
        self.assertIs(simplify(fraction, fraction), False)
