import unittest

from src.solution import fib


class TestFibPrivate(unittest.TestCase):
    # Extends test_docstring_first_number: the initial 1, 1 must advance to 2.
    def test_third_number(self):
        # By hand: 1, 1, 2.
        self.assertEqual(fib(3), 2)

    # Extends test_second_number: distinguish the next two unequal terms.
    def test_fourth_number(self):
        # By hand: 1, 1, 2, 3.
        self.assertEqual(fib(4), 3)

    # Extends test_sixth_number: check the preceding odd index.
    def test_fifth_number(self):
        # By hand: 1, 1, 2, 3, 5.
        self.assertEqual(fib(5), 5)

    # Extends test_sixth_number: check the following odd index.
    def test_seventh_number(self):
        # By hand: F(7) = F(6) + F(5) = 8 + 5.
        self.assertEqual(fib(7), 13)

    # Extends test_docstring_eighth_number: do not skip an odd-indexed term.
    def test_ninth_number(self):
        # By hand: F(9) = F(8) + F(7) = 21 + 13.
        self.assertEqual(fib(9), 34)

    # Extends test_docstring_tenth_number: go beyond the largest example.
    def test_eleventh_number(self):
        # By hand: F(11) = F(10) + F(9) = 55 + 34.
        self.assertEqual(fib(11), 89)

    # Extends test_docstring_tenth_number: a later even index also advances.
    def test_twelfth_number(self):
        # By hand: F(12) = F(11) + F(10) = 89 + 55.
        self.assertEqual(fib(12), 144)

    # Extends test_docstring_tenth_number: doubling the index is not doubling F.
    def test_twentieth_number(self):
        # Continuing addition from F(11), F(12):
        # 233, 377, 610, 987, 1597, 2584, 4181, 6765.
        self.assertEqual(fib(20), 6765)

    # Extends test_docstring_eighth_number: exceed signed 32-bit arithmetic.
    def test_forty_seventh_number(self):
        # Enumerate the defining sequence by adding its two preceding terms.
        terms = [1, 1]
        for _ in range(2, 47):
            terms.append(terms[-1] + terms[-2])
        self.assertEqual(fib(47), terms[46])

    # Extends test_docstring_tenth_number: floating-point formulas lose precision.
    def test_seventy_ninth_number(self):
        # Enumerate with integer addition, preserving the exact Fibonacci value.
        terms = [1, 1]
        for _ in range(2, 79):
            terms.append(terms[-1] + terms[-2])
        self.assertEqual(fib(79), terms[78])

    # Extends test_sixth_number: exceed unsigned 64-bit arithmetic as well.
    def test_hundredth_number(self):
        # Enumerate the defining recurrence; no fixed-width arithmetic is used.
        terms = [1, 1]
        for _ in range(2, 100):
            terms.append(terms[-1] + terms[-2])
        self.assertEqual(fib(100), terms[99])

    # Extends test_docstring_tenth_number: a table of just small indices is short.
    def test_two_hundred_fiftieth_number(self):
        # Exactly 248 additions extend the two initial terms to F(250).
        terms = [1, 1]
        for _ in range(2, 250):
            terms.append(terms[-1] + terms[-2])
        self.assertEqual(fib(250), terms[249])

    # Extends test_docstring_first_number and test_second_number: revisit the
    # initial terms after larger calls, with repetitions and decreasing indices.
    # Also extends test_sixth_number, test_docstring_eighth_number, and
    # test_docstring_tenth_number beyond their isolated example calls.
    def test_many_indices_in_nonmonotonic_order(self):
        # Build all reference terms by the defining recurrence, then index them.
        terms = [1, 1]
        for _ in range(2, 120):
            terms.append(terms[-1] + terms[-2])
        indices = [120, 1, 37, 2, 119, 3, 37, 1, 2]
        indices += list(range(120, 0, -1))
        for n in indices:
            with self.subTest(n=n):
                self.assertEqual(fib(n), terms[n - 1])
