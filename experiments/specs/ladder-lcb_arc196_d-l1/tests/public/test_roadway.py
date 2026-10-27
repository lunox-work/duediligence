import itertools
import unittest

from sandbox.check import run_case

# Model used for the derived answers. Let P_k be the sum of w_1..w_{k-1}
# (P_1 = 0); any integer P_2..P_N is reachable by choosing the w_j. Stamina
# changes by +w_j on road j in either direction, so:
#   S < T: stamina at town k is P_k - P_S  -> P_S == P_T, P_k > P_S inside;
#   S > T: stamina at town k is P_S - P_k  -> P_S == P_T, P_k < P_S inside.
# Only the relative order of the P values matters, so trying every
# assignment of values 0..N-1 to the N towns covers every possibility.


def brute(n, people, queries):
    """Exhaustive search over P in {0..n-1}^n; for tiny n only."""
    def ok(p, s, t):
        if p[s - 1] != p[t - 1]:
            return False
        lo, hi = min(s, t), max(s, t)
        for k in range(lo + 1, hi):
            if s < t and not p[k - 1] > p[s - 1]:
                return False
            if s > t and not p[k - 1] < p[s - 1]:
                return False
        return True

    satisfiable = set()
    for p in itertools.product(range(n), repeat=n):
        satisfiable.add(frozenset(i for i, (s, t) in enumerate(people) if ok(p, s, t)))
    out = []
    for l, r in queries:
        need = set(range(l - 1, r))
        out.append("Yes" if any(need <= got for got in satisfiable) else "No")
    return out


def make_input(n, people, queries):
    lines = [f"{n} {len(people)} {len(queries)}"]
    lines += [f"{s} {t}" for s, t in people]
    lines += [f"{l} {r}" for l, r in queries]
    return "\n".join(lines) + "\n"


def all_queries(m):
    return [(l, r) for l in range(1, m + 1) for r in range(l, m + 1)]


class TestRoadway(unittest.TestCase):
    # The statement gives no sample inputs, so every case below is derived.

    def test_smallest_rightward(self):
        # N=3, one person 1->3: w = (1, -1) works.
        run_case(self, stdin="3 1 1\n1 3\n1 1\n", expected="Yes")

    def test_smallest_leftward(self):
        # N=3, one person 3->1: needs P1 == P3 > P2, e.g. w = (-1, 1).
        run_case(self, stdin="3 1 1\n3 1\n1 1\n", expected="Yes")

    def test_opposite_directions_same_towns(self):
        # 1->3 needs P2 > P1 = P3; 3->1 needs P2 < P1 = P3. Each alone is
        # fine, together they contradict.
        run_case(self, stdin="3 2 3\n1 3\n3 1\n1 1\n2 2\n1 2\n",
                 expected="Yes\nYes\nNo")

    def test_crossing_rightward_pair(self):
        # 1->3: P1 = P3 < P2;  2->4: P2 = P4 < P3. Then P3 < P2 < P3: No.
        run_case(self, stdin="4 2 1\n1 3\n2 4\n1 2\n", expected="No")

    def test_nested_rightward_pair(self):
        # 1->4 and 2->3: P = (0, 1, 1, 0) satisfies both.
        run_case(self, stdin="4 2 1\n1 4\n2 3\n1 2\n", expected="Yes")

    def test_shared_endpoint_inside(self):
        # 1->3 and 1->4: 1->4 needs P3 > P1, 1->3 needs P3 == P1: No.
        run_case(self, stdin="4 2 1\n1 3\n1 4\n1 2\n", expected="No")

    def test_largest_town_single_person(self):
        # One person spanning the whole line at N = 4*10^5; a single person
        # is always satisfiable (w_S = +1, w_{T-1} = -1, others 0).
        run_case(self, stdin="400000 1 1\n1 400000\n1 1\n", expected="Yes")

    def test_largest_town_single_person_leftward(self):
        # Same span, travelling left: w_1 = -1, w_{N-1} = +1, others 0.
        run_case(self, stdin="400000 1 1\n400000 1\n1 1\n", expected="Yes")

    def test_largest_town_crossing(self):
        # 1->3: P1 = P3 < P2;  2->400000: P2 = P400000 < P3. P3 < P2 < P3: No.
        run_case(self, stdin="400000 2 3\n1 3\n2 400000\n1 1\n2 2\n1 2\n",
                 expected="Yes\nYes\nNo")

    def test_five_towns_four_people(self):
        # Answers from brute() above (exhaustive search).
        n, people = 5, [(4, 2), (1, 3), (3, 5), (2, 4)]
        queries = [(1, 3), (2, 4)]
        self.assertEqual(brute(n, people, queries), ["Yes", "No"])
        run_case(self, stdin=make_input(n, people, queries), expected="Yes\nNo")

    def test_brute_five_towns_mixed_directions(self):
        # Every (L, R) range; answers from brute() (exhaustive search).
        n, people = 5, [(1, 3), (5, 3), (2, 5), (4, 1), (3, 1), (2, 4)]
        queries = all_queries(len(people))
        run_case(self, stdin=make_input(n, people, queries),
                 expected="\n".join(brute(n, people, queries)))

    def test_brute_six_towns(self):
        # Every (L, R) range; answers from brute() (exhaustive search).
        n, people = 6, [(1, 6), (2, 4), (5, 3), (4, 6), (6, 4), (1, 3), (3, 6)]
        queries = all_queries(len(people))
        run_case(self, stdin=make_input(n, people, queries),
                 expected="\n".join(brute(n, people, queries)))

    def test_brute_six_towns_nested(self):
        # Every (L, R) range; answers from brute() (exhaustive search).
        n, people = 6, [(6, 1), (2, 5), (5, 2), (3, 5), (1, 4), (4, 6), (6, 3)]
        queries = all_queries(len(people))
        run_case(self, stdin=make_input(n, people, queries),
                 expected="\n".join(brute(n, people, queries)))

    def test_max_size(self):
        # N = 4*10^5, M = Q = 2*10^5. People 1..199999 are k: 2k-1 -> 2k+1;
        # person 200000 is 2 -> 4.
        # - Without person 200000, P = 0 at odd towns and 1 at even towns
        #   works: Yes.
        # - Person 200000 needs P2 = P4 < P3. With person 1 (1->3, P3 < P2)
        #   or person 2 (3->5, P3 < P4) this contradicts: No.
        # - Persons k >= 3 only touch towns >= 5, so with L >= 3 setting
        #   P3 = 2 on top of the pattern above works: Yes.
        # So the answer is Yes iff R <= 199999 or L >= 3.
        n, m = 400000, 200000
        people = [(2 * k - 1, 2 * k + 1) for k in range(1, m)] + [(2, 4)]
        queries = []
        for i in range(m):
            l = 1 + (i * 7919) % m
            r = l + (i * 104729) % (m - l + 1)
            if i % 4 == 0:
                r = m
            if i % 8 == 0:
                l = 1 + i % 3
            queries.append((l, r))
        expected = "\n".join("Yes" if r <= m - 1 or l >= 3 else "No"
                             for l, r in queries)
        run_case(self, stdin=make_input(n, people, queries), expected=expected)


if __name__ == "__main__":
    unittest.main()
