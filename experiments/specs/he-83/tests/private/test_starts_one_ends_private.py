import unittest

from src.solution import starts_one_ends


def brute(n):
    # Obviously correct: walk every n-digit positive integer and test its
    # decimal string directly. Only used for small n.
    count = 0
    for x in range(10 ** (n - 1), 10 ** n):
        s = str(x)
        if s[0] == "1" or s[-1] == "1":
            count += 1
    return count


def by_sets(n):
    # Inclusion-exclusion with exact integers over 10**(n-1) .. 10**n - 1,
    # for n >= 2: start with 1 is 10**(n-1); end with 1 is 9 * 10**(n-2)
    # (first digit 1-9, middle free); both is 10**(n-2).
    return 10 ** (n - 1) + 9 * 10 ** (n - 2) - 10 ** (n - 2)


class TestStartsOneEndsPrivate(unittest.TestCase):
    # Extends test_one_digit: the same value checked against the brute force
    # (1..9, only 1 qualifies), so a lookup and the enumeration must agree.
    def test_one_digit_matches_brute_force(self):
        self.assertEqual(starts_one_ends(1), brute(1))
        self.assertEqual(brute(1), 1)

    # Extends test_two_digits_counts_overlap_once: brute force for n = 2..5,
    # catching any formula that counts 11, 101, 1001, ... twice or not at all.
    def test_small_n_match_brute_force(self):
        for n in range(2, 6):
            with self.subTest(n=n):
                self.assertEqual(starts_one_ends(n), brute(n))

    # Extends test_two_digits_counts_overlap_once: a formula that adds the
    # overlap instead of subtracting it gives 10**4 + 9*10**3 + 10**3 = 20000.
    # By hand: 10000 + 9000 - 1000 = 18000. Also confirmed by brute force.
    def test_five_digits_by_hand(self):
        self.assertEqual(starts_one_ends(5), 18000)
        self.assertEqual(brute(5), 18000)

    # Extends test_three_digits: n = 6 by brute force over 900000 numbers.
    # 100000 + 90000 - 10000 = 180000.
    def test_six_digits_brute_force(self):
        self.assertEqual(brute(6), 180000)
        self.assertEqual(starts_one_ends(6), 180000)

    # Extends test_four_digits: the values between the public cases 4 and 10,
    # which a lookup table of the public inputs does not cover.
    # 7: 1800000, 8: 18000000, 9: 180000000 (inclusion-exclusion).
    def test_seven_eight_nine_digits(self):
        self.assertEqual(starts_one_ends(7), 1800000)
        self.assertEqual(starts_one_ends(8), 18000000)
        self.assertEqual(starts_one_ends(9), 180000000)

    # Extends test_ten_digits: just past the largest public input.
    # 10**10 + 9*10**9 - 10**9 = 18 * 10**9.
    def test_eleven_digits(self):
        self.assertEqual(starts_one_ends(11), 18000000000)

    # Extends test_ten_digits: n = 2..60 against exact inclusion-exclusion.
    # Float-based formulas (1.8 * 10**(n-1), int(18 * 10.0**(n-2))) lose
    # exactness well before n = 60 and so differ from the exact integer.
    def test_range_matches_inclusion_exclusion(self):
        for n in range(2, 61):
            with self.subTest(n=n):
                self.assertEqual(starts_one_ends(n), by_sets(n))

    # Extends test_ten_digits: n = 30. 18 * 10**28 is not representable as a
    # float (9 * 5**28 needs more than 53 bits), so only an exact integer
    # computation gives this value.
    def test_thirty_digits_exact(self):
        self.assertEqual(starts_one_ends(30), 18 * 10 ** 28)

    # Extends test_ten_digits: very large n, far past float range
    # (10**400 overflows a float). Exact count is 18 * 10**398.
    def test_four_hundred_digits_exact(self):
        self.assertEqual(starts_one_ends(400), 18 * 10 ** 398)

    # Extends test_three_digits: for n >= 2 each count is ten times the last,
    # since one more free middle digit multiplies every set by 10. Holds from
    # n = 2 onward but not from n = 1 (1 -> 18).
    def test_tenfold_growth_from_two(self):
        for n in range(2, 40):
            with self.subTest(n=n):
                self.assertEqual(starts_one_ends(n + 1), 10 * starts_one_ends(n))

    # Extends test_one_digit: n = 1 is not the general formula's value
    # (18 * 10**-1 = 1.8), and not "start or end with 1" counted as 2.
    def test_one_digit_not_double_counted(self):
        self.assertEqual(starts_one_ends(1), 1)
        self.assertNotEqual(starts_one_ends(1), 2)

    # The result is a count of integers, so it must be an exact integer
    # value equal to the brute force at n = 3 (180), not an approximation.
    def test_three_digits_brute_force(self):
        self.assertEqual(starts_one_ends(3), brute(3))
        self.assertEqual(brute(3), 180)


if __name__ == "__main__":
    unittest.main()
