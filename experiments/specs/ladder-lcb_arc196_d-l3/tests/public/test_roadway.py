# Public tests for "Roadway" (spec.md).
#
# The statement gives no samples and no explicit constraints, so every case
# here is small, uses towns numbered 1..N, has S_i != T_i, and keeps all 2M
# endpoints distinct.
#
# Notation used in the derivations: let P_x be the sum of the weights of the
# roads between town 1 and town x (P_1 = 0), so road x has weight
# P_{x+1} - P_x. A person going S -> T with S < T has stamina P_x - P_S at
# town x; with S > T it is P_S - P_x. "Zero on arrival" means P_S = P_T and
# "strictly positive in between" means P_x > P_S (S < T) or P_S > P_x (S > T)
# for every town x strictly between S and T.
import unittest

from sandbox.check import run_case


def feasible(n, people):
    """Brute force: the requirements are the constraints P_a >= P_b
    (equalities as two of them) and P_a > P_b. Such a system has a real
    solution, and so (scaling a rational one) an integer one, exactly when
    no strict constraint P_a > P_b has P_b >= P_a implied by the transitive
    closure of all the constraints. The closure is computed with
    Floyd-Warshall on a tiny n."""
    ge = [[i == j for j in range(n + 1)] for i in range(n + 1)]
    strict = []
    for s, t in people:
        ge[s][t] = ge[t][s] = True
        for x in range(min(s, t) + 1, max(s, t)):
            a, b = (x, s) if s < t else (s, x)
            ge[a][b] = True
            strict.append((a, b))
    for k in range(1, n + 1):
        for i in range(1, n + 1):
            if ge[i][k]:
                for j in range(1, n + 1):
                    if ge[k][j]:
                        ge[i][j] = True
    return all(not ge[b][a] for a, b in strict)


def all_ranges_case(n, people):
    """Input asking every range L..R, and the expected output from feasible()."""
    m = len(people)
    queries = [(l, r) for l in range(1, m + 1) for r in range(l, m + 1)]
    lines = [f"{n} {m} {len(queries)}"]
    lines += [f"{s} {t}" for s, t in people]
    lines += [f"{l} {r}" for l, r in queries]
    answers = ["Yes" if feasible(n, people[l - 1:r]) else "No" for l, r in queries]
    return "\n".join(lines) + "\n", "\n".join(answers) + "\n"


class TestRoadway(unittest.TestCase):
    def test_smallest_input(self):
        # N=2, one person 1 -> 2: no town in between, so weight 0 on the
        # only road brings stamina to exactly 0. Yes.
        run_case(self, stdin="2 1 1\n1 2\n1 1\n", expected="Yes\n")

    def test_smallest_input_walking_left(self):
        # Same as above in the other direction: weight 0. Yes.
        run_case(self, stdin="2 1 1\n2 1\n1 1\n", expected="Yes\n")

    def test_single_person_long_walk_left(self):
        # 5 -> 1 with weights (road 1..road 4) = (-1, 0, 0, 1): stamina is
        # 1 at towns 4, 3 and 2, then 1 + (-1) = 0 at town 1. Yes.
        run_case(self, stdin="5 1 1\n5 1\n1 1\n", expected="Yes\n")

    def test_crossing_same_direction_is_impossible(self):
        # 1 -> 3 needs P_2 > P_1 = P_3; 2 -> 4 needs P_3 > P_2 = P_4.
        # Together P_3 > P_2 > P_3, impossible. Each alone is possible.
        run_case(
            self,
            stdin="4 2 3\n1 3\n2 4\n1 1\n2 2\n1 2\n",
            expected="Yes\nYes\nNo\n",
        )

    def test_crossing_walking_left_is_impossible(self):
        # 4 -> 2 needs P_4 = P_2 and P_4 > P_3; 3 -> 1 needs P_3 = P_1 and
        # P_3 > P_2. Then P_3 > P_2 = P_4 > P_3, impossible.
        run_case(self, stdin="4 2 1\n4 2\n3 1\n1 2\n", expected="No\n")

    def test_crossing_opposite_directions_is_possible(self):
        # 1 -> 3 and 4 -> 2 with weights (1, -1, 1): person 1 has 1 at town
        # 2 and 0 at town 3; person 2 has 1 at town 3 and 0 at town 2. Yes.
        run_case(self, stdin="4 2 1\n1 3\n4 2\n1 2\n", expected="Yes\n")

    def test_nested_same_direction_is_possible(self):
        # 1 -> 4 and 2 -> 3 with weights (1, 0, -1): person 1 has 1, 1, then
        # 0; person 2 crosses the weight-0 road and arrives with 0. Yes.
        run_case(self, stdin="4 2 1\n1 4\n2 3\n1 2\n", expected="Yes\n")

    def test_nested_opposite_direction_is_possible(self):
        # 1 -> 6 and 5 -> 2 with P = (0, 2, 1, 1, 2, 0), i.e. weights
        # (2, -1, 0, 1, -2): person 1 sees 2, 1, 1, 2, then 0; person 2
        # (stamina P_5 - P_x) sees 1, 1, then 0 at town 2. Yes.
        run_case(self, stdin="6 2 1\n1 6\n5 2\n1 2\n", expected="Yes\n")

    def test_adjacent_inside_longer_walk(self):
        # 1 -> 4 and 3 -> 2 (adjacent, no town between, so P_3 = P_2):
        # weights (1, 0, -1) satisfy both. Yes.
        run_case(self, stdin="4 2 1\n1 4\n3 2\n1 2\n", expected="Yes\n")

    def test_ranges_around_one_conflict(self):
        # People: 1->3, 2->4, 5->8, 6->7. People 1 and 2 conflict as in
        # test_crossing_same_direction_is_impossible. People 3 and 4 are
        # nested (P_6 = P_7 > P_5 = P_8 works), and people on towns 1..4 and
        # on towns 5..8 constrain disjoint variables, so any range that does
        # not contain both 1 and 2 is Yes.
        run_case(
            self,
            stdin="8 4 6\n1 3\n2 4\n5 8\n6 7\n1 1\n1 2\n2 4\n1 4\n3 4\n2 2\n",
            expected="Yes\nNo\nYes\nNo\nYes\nYes\n",
        )

    def test_all_ranges_ten_towns(self):
        # Every range over 5 people; expected answers from feasible().
        stdin, expected = all_ranges_case(
            10, [(3, 7), (1, 5), (10, 4), (2, 9), (8, 6)]
        )
        run_case(self, stdin=stdin, expected=expected)

    def test_all_ranges_twelve_towns(self):
        # Every range over 6 people; expected answers from feasible().
        stdin, expected = all_ranges_case(
            12, [(1, 12), (11, 2), (3, 6), (4, 10), (9, 5), (7, 8)]
        )
        run_case(self, stdin=stdin, expected=expected)


if __name__ == "__main__":
    unittest.main()
