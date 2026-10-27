import unittest

from sandbox.check import run_case


def tree_input(n, k, edges):
    # Builds the input text; every edge is written with u < v as required.
    lines = [f"{n} {k}"]
    lines += [f"{min(u, v)} {max(u, v)}" for u, v in edges]
    return "\n".join(lines) + "\n"


def path_edges(m):
    return [(i, i + 1) for i in range(1, m)]


def star_edges(m):
    return [(1, i) for i in range(2, m + 1)]


class TestPathDecomposition(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="3 2\n1 2\n2 3\n3 4\n2 5\n5 6\n", expected="Yes")

    def test_sample_2(self):
        run_case(self, stdin="3 2\n1 2\n2 3\n3 4\n2 5\n3 6\n", expected="No")

    # Smallest input: one vertex, no edges; the 1x1 matrix [1] works.

    def test_single_vertex(self):
        run_case(self, stdin="1 1\n", expected="Yes")

    # Two vertices, one path of length 2 covers the single edge.

    def test_two_vertices_one_path(self):
        run_case(self, stdin="1 2\n1 2\n", expected="Yes")

    # Two vertices, K=1: each vertex is its own path.

    def test_two_vertices_k1(self):
        run_case(self, stdin="2 1\n1 2\n", expected="Yes")

    # N=1: the whole tree must be a single path. A star with 3 leaves has a
    # vertex of degree 3, so it is not a path.

    def test_n1_star_is_not_path(self):
        run_case(self, stdin=tree_input(1, 4, star_edges(4)), expected="No")

    # N=1 on a spider with legs 1-2-3 and 1-4-5: it is the path 3-2-1-4-5.

    def test_n1_tree_that_is_path(self):
        edges = [(1, 2), (2, 3), (1, 4), (4, 5)]
        run_case(self, stdin=tree_input(1, 5, edges), expected="Yes")

    # K=2 on a star with 3 leaves: the centre pairs with only one leaf, the
    # other two leaves are adjacent only to the centre, so no perfect matching.

    def test_star_four_vertices_k2(self):
        run_case(self, stdin=tree_input(2, 2, star_edges(4)), expected="No")

    # Spider with centre 1 and legs 1-2, 1-3-4, 1-5-6.
    # K=2: matching {1-2, 3-4, 5-6} works.

    def test_spider_k2_yes(self):
        edges = [(1, 2), (1, 3), (3, 4), (1, 5), (5, 6)]
        run_case(self, stdin=tree_input(3, 2, edges), expected="Yes")

    # Same spider, K=3: vertex 1's path has 3 vertices. Enumerating them by
    # hand: 2-1-3 / 2-1-5 strand 4 or 6; 3-1-5 strands 2; 1-3-4 / 1-5-6 /
    # 4-3-1 / 6-5-1 strand 2. Every option leaves a lone vertex, so No.

    def test_spider_k3_no(self):
        edges = [(1, 2), (1, 3), (3, 4), (1, 5), (5, 6)]
        run_case(self, stdin=tree_input(2, 3, edges), expected="No")

    # Path of 6 vertices split into 2 paths of 3: 1-2-3, 4-5-6.

    def test_path6_k3(self):
        run_case(self, stdin=tree_input(2, 3, path_edges(6)), expected="Yes")

    # Largest inputs, NK = 2*10^5.

    def test_max_k1_star(self):
        # K=1: every vertex is its own path, regardless of shape.
        run_case(self, stdin=tree_input(200000, 1, star_edges(200000)), expected="Yes")

    def test_max_n1_path(self):
        # The tree is itself one path 1-2-...-200000.
        run_case(self, stdin=tree_input(1, 200000, path_edges(200000)), expected="Yes")

    def test_max_path_k2(self):
        # Pairs (1,2), (3,4), ... cover the path.
        run_case(self, stdin=tree_input(100000, 2, path_edges(200000)), expected="Yes")

    def test_max_star_no(self):
        # K>1: a leaf of the star lies on a path through the centre, and the
        # centre's path can include at most 2 of its 199999 leaves.
        run_case(self, stdin=tree_input(2, 100000, star_edges(200000)), expected="No")


if __name__ == "__main__":
    unittest.main()
