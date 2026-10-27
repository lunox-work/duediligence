import unittest

from sandbox.check import run_case


class TestRoadway(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="5 4 2\n4 2\n1 3\n3 5\n2 4\n1 3\n2 4\n", expected="Yes\nNo\n")

    def test_sample_2(self):
        run_case(
            self,
            stdin="7 6 3\n1 5\n2 4\n4 6\n7 1\n5 3\n1 6\n1 6\n4 4\n2 5\n",
            expected="No\nYes\nYes\n",
        )

    # Hand-derived cases. Write P_x for the stamina-potential at town x
    # (P_{j+1} = P_j + w_j). A person going right from S to T needs
    # P_S = P_T and P_x > P_S strictly between; going left needs
    # P_S = P_T and P_x < P_S strictly between.

    def test_smallest_input_rightward(self):
        # N=3, one person 1->3: P = 0, 1, 0 works.
        run_case(self, stdin="3 1 1\n1 3\n1 1\n", expected="Yes\n")

    def test_smallest_input_leftward(self):
        # One person 3->1: P = 0, -1, 0 works.
        run_case(self, stdin="3 1 1\n3 1\n1 1\n", expected="Yes\n")

    def test_same_towns_opposite_directions(self):
        # (1,3) and (3,1) are distinct pairs. Alone each is fine; together
        # P_2 > P_1 and P_2 < P_3 = P_1, a contradiction.
        run_case(
            self,
            stdin="3 2 3\n1 3\n3 1\n1 1\n2 2\n1 2\n",
            expected="Yes\nYes\nNo\n",
        )

    def test_crossing_same_direction(self):
        # 1->3 and 2->4: P_3 > P_2 > P_1 = P_3, contradiction.
        run_case(self, stdin="4 2 1\n1 3\n2 4\n1 2\n", expected="No\n")

    def test_crossing_opposite_directions(self):
        # 1->3 and 4->2: P = 0, 1, 0, 1 works.
        run_case(self, stdin="4 2 1\n1 3\n4 2\n1 2\n", expected="Yes\n")

    def test_endpoint_strictly_inside_other_same_direction(self):
        # 1->3 and 1->5: P_3 = P_1 but town 3 is inside 1..5, needs P_3 > P_1.
        run_case(self, stdin="5 2 1\n1 3\n1 5\n1 2\n", expected="No\n")

    def test_endpoint_strictly_inside_other_opposite_direction(self):
        # 1->3 and 5->1: P_3 = P_1 = P_5 but town 3 is inside, needs P_3 < P_5.
        run_case(self, stdin="5 2 1\n1 3\n5 1\n1 2\n", expected="No\n")

    def test_strictly_nested_same_direction(self):
        # 1->5 and 2->4: P = 0, 1, 2, 1, 0 works.
        run_case(self, stdin="5 2 1\n1 5\n2 4\n1 2\n", expected="Yes\n")

    def test_strictly_nested_opposite_direction(self):
        # 1->5 and 4->2: P = 0, 2, 1, 2, 0 works.
        run_case(self, stdin="5 2 1\n1 5\n4 2\n1 2\n", expected="Yes\n")

    def test_touching_at_endpoint(self):
        # 1->3 and 5->3 share only town 3: P = 0, 1, 0, 1, 0 works.
        run_case(self, stdin="5 2 1\n1 3\n5 3\n1 2\n", expected="Yes\n")

    # Largest town numbers.

    def test_max_n_single_person_rightward(self):
        # One person 1->N: P_x = min(x, N+1-x) - 1 works.
        run_case(self, stdin="400000 1 1\n1 400000\n1 1\n", expected="Yes\n")

    def test_max_n_single_person_leftward(self):
        # One person N->1: the negation of the above works.
        run_case(self, stdin="400000 1 1\n400000 1\n1 1\n", expected="Yes\n")

    def test_max_size(self):
        # N=400000, M=200000, Q=200000. Persons 1..199999 are i -> N+1-i
        # (strictly nested, all rightward), person 200000 is 2 -> 4.
        # Nested people alone: P_x = min(x, N+1-x) works, so Yes.
        # Person 200000 together with person 1 or 2 (interval 2..N-1):
        # town 4 lies strictly inside 2..N-1, so P_4 > P_2, but 2->4 needs
        # P_4 = P_2: No. With person 3 (3..N-2): P_4 > P_3 > P_2 = P_4: No.
        # With only persons l..200000 for l >= 4: P_x = min(x, N+1-x) for
        # x >= 4, P_2 = P_4, P_3 = P_4 + 1 works: Yes.
        # So the answer is No exactly when r = M and l <= 3. This rule was
        # also checked against an exhaustive feasibility brute force on the
        # same construction for N = 10..13, all (l, r).
        n, m, q = 400000, 200000, 200000
        people = [(i, n + 1 - i) for i in range(1, m)] + [(2, 4)]
        queries = [(1, m), (2, m), (3, m), (4, m), (m, m), (1, m - 1), (3, m - 1)]
        k = 0
        while len(queries) < q:
            l = (k * 7919) % m + 1
            r = l + (k * 104729) % (m - l + 1)
            if k % 5 == 0:
                r = m
            queries.append((l, r))
            k += 1
        lines = [f"{n} {m} {q}"]
        lines += [f"{s} {t}" for s, t in people]
        lines += [f"{l} {r}" for l, r in queries]
        answers = ["No" if r == m and l <= 3 else "Yes" for l, r in queries]
        run_case(self, stdin="\n".join(lines) + "\n", expected="\n".join(answers) + "\n")


if __name__ == "__main__":
    unittest.main()
