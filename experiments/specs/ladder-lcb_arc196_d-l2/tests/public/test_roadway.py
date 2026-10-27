# The statement in spec.md gives no samples, so every case here is derived.
#
# Let P_k be the stamina a traveller would have at town k if they started
# at town 1 with stamina 0 and walked right (P_1 = 0, P_{k+1} = P_k + w_k).
# Any integer sequence P is reachable by choosing the w_j. A person going
# right from S to T needs P_S = P_T and P_k > P_S for every town strictly
# between; a person going left needs P_S = P_T and P_k < P_S strictly
# between. Each expected answer below follows from this by hand and was
# also checked with a brute force over all P in {0..N-1}^N (enough, since
# a feasible system of =, < among N values has a solution using N ranks).
import unittest

from sandbox.check import run_case


class TestRoadway(unittest.TestCase):
    def test_smallest_single_person_rightward(self):
        # N=3, one person 1->3: P = 0,1,0 works.
        run_case(self, stdin="3 1 1\n1 3\n1 1\n", expected="Yes")

    def test_smallest_single_person_leftward(self):
        # N=3, one person 3->1: P = 1,0,1 works.
        run_case(self, stdin="3 1 1\n3 1\n1 1\n", expected="Yes")

    def test_same_pair_opposite_directions(self):
        # 1->3 needs P2 > P1, 3->1 needs P2 < P1: together impossible;
        # each alone is fine.
        run_case(self, stdin="3 2 3\n1 3\n3 1\n1 2\n1 1\n2 2\n",
                 expected="No\nYes\nYes")

    def test_crossing_same_direction(self):
        # 1->3 and 2->4: P3 > P2 > P1 = P3, contradiction; each alone fine.
        run_case(self, stdin="4 2 3\n1 3\n2 4\n1 2\n1 1\n2 2\n",
                 expected="No\nYes\nYes")

    def test_crossing_opposite_directions(self):
        # 1->3 and 4->2: P = 0,1,0,1 works.
        run_case(self, stdin="4 2 1\n1 3\n4 2\n1 2\n", expected="Yes")

    def test_crossing_both_leftward(self):
        # 3->1 and 4->2: P2 < P1 = P3 and P3 < P2, contradiction.
        run_case(self, stdin="4 2 1\n3 1\n4 2\n1 2\n", expected="No")

    def test_nested_same_direction(self):
        # 1->5 and 2->4: P = 0,1,2,1,0 works.
        run_case(self, stdin="5 2 1\n1 5\n2 4\n1 2\n", expected="Yes")

    def test_nested_opposite_directions(self):
        # 1->5 and 4->2: P = 0,2,1,2,0 works.
        run_case(self, stdin="5 2 1\n1 5\n4 2\n1 2\n", expected="Yes")

    def test_touching_at_shared_endpoint(self):
        # 1->3 and 3->5: P = 0,1,0,1,0 works.
        run_case(self, stdin="5 2 1\n1 3\n3 5\n1 2\n", expected="Yes")

    def test_query_ranges_select_people(self):
        # People 1->3, 3->5, 5->3. Only the pair 3->5 / 5->3 conflicts
        # (P4 > P3 and P4 < P3), so any range containing people 2 and 3
        # is No.
        run_case(self, stdin="5 3 4\n1 3\n3 5\n5 3\n1 2\n2 3\n1 3\n3 3\n",
                 expected="Yes\nNo\nNo\nYes")

    def test_mixed_four_people(self):
        # People 4->2, 1->3, 3->5, 2->4. People 1..3: P = 0,1,0,1,0 works.
        # People 2..4 contain 1->3 and 2->4, which cross in the same
        # direction: No. (Brute force agrees.)
        run_case(self, stdin="5 4 2\n4 2\n1 3\n3 5\n2 4\n1 3\n2 4\n",
                 expected="Yes\nNo")

    def test_mixed_six_people(self):
        # Answers obtained with the brute force described at the top.
        # Query 4 4 is a single person (7->1), which is always Yes.
        run_case(self, stdin="7 6 3\n1 5\n2 4\n4 6\n7 1\n5 3\n1 6\n1 6\n4 4\n2 5\n",
                 expected="No\nYes\nYes")


if __name__ == "__main__":
    unittest.main()
