import unittest

from sandbox.check import run_case

# spec.md has no statement samples and no constraints, so every case below
# is a small tree with its answer derived by hand. The tree has NK vertices,
# so "N paths each of length K" can only mean splitting the vertices into N
# disjoint paths of K vertices each: N paths of K edges would need N(K+1)
# vertices if disjoint, or NK edges if they shared vertices, and the tree has
# neither. All answers were also checked with an exhaustive search.


class TestPathDecomposition(unittest.TestCase):
    def test_single_vertex(self):
        # N=K=1: the one vertex is itself a path of 1 vertex.
        run_case(self, stdin="1 1\n", expected="Yes")

    def test_k1_star_always_yes(self):
        # K=1: every vertex is its own path, whatever the shape of the tree.
        run_case(self, stdin="4 1\n1 2\n1 3\n1 4\n", expected="Yes")

    def test_n1_single_edge(self):
        # N=1, K=2: the tree is the edge 1-2, which is a path.
        run_case(self, stdin="1 2\n2 1\n", expected="Yes")

    def test_n1_tree_is_path(self):
        # N=1: the whole tree must be one path; 1-2-3-4 is one.
        run_case(self, stdin="1 4\n1 2\n2 3\n3 4\n", expected="Yes")

    def test_n1_tree_is_star(self):
        # N=1: a star with 3 leaves is not a path.
        run_case(self, stdin="1 4\n1 2\n1 3\n1 4\n", expected="No")

    def test_k2_path_of_four(self):
        # 1-2-3-4 splits into {1,2} and {3,4}.
        run_case(self, stdin="2 2\n1 2\n2 3\n3 4\n", expected="Yes")

    def test_k2_star_of_four(self):
        # Leaves 2, 3 and 4 can each pair only with vertex 1, which can take
        # just one of them.
        run_case(self, stdin="2 2\n1 2\n1 3\n1 4\n", expected="No")

    def test_k2_branching_yes(self):
        # Edges 1-2, 2-3, 3-4, 2-5, 5-6: split into {1,2}, {3,4}, {5,6}.
        run_case(self, stdin="3 2\n1 2\n2 3\n3 4\n2 5\n5 6\n", expected="Yes")

    def test_k2_branching_no(self):
        # Edges 1-2, 2-3, 3-4, 2-5, 3-6: leaves 1 and 5 both hang only on
        # vertex 2, so they cannot both be paired.
        run_case(self, stdin="3 2\n1 2\n2 3\n3 4\n2 5\n3 6\n", expected="No")

    def test_k3_branching_yes(self):
        # Edges 1-2, 2-3, 2-4, 4-5, 5-6 (vertex 2 has degree 3): split into
        # {1,2,3} and {4,5,6}.
        run_case(self, stdin="2 3\n1 2\n2 3\n2 4\n4 5\n5 6\n", expected="Yes")

    def test_k3_spider_no(self):
        # Vertex 1 has legs 1-2-3, 1-4-5 and 1-6. The path through 1 has 3
        # vertices, and each of the 7 choices ({3,2,1}, {2,1,4}, {2,1,6},
        # {5,4,1}, {4,1,6}, {6,1,2}, {6,1,4}) leaves 3 vertices that do not
        # form a path.
        run_case(self, stdin="2 3\n1 2\n2 3\n1 4\n4 5\n1 6\n", expected="No")

    def test_k3_shuffled_labels_path(self):
        # The edges form the path 4-2-5-3-1-6, given out of order:
        # split into {4,2,5} and {3,1,6}.
        run_case(self, stdin="2 3\n4 2\n6 1\n3 5\n1 3\n2 5\n", expected="Yes")


if __name__ == "__main__":
    unittest.main()
