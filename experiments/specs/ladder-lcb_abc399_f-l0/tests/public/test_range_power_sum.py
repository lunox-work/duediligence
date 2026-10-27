import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(k, a):
    # Direct definition: sum over every l <= r of (A_l + ... + A_r)^K, mod 998244353.
    total = 0
    for l in range(len(a)):
        s = 0
        for r in range(l, len(a)):
            s += a[r]
            total += pow(s, k, MOD)
    return total % MOD


def stdin_of(k, a):
    return f"{len(a)} {k}\n{' '.join(map(str, a))}\n"


class TestRangePowerSum(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 2\n3 1 2\n", expected="75")

    def test_sample_2(self):
        run_case(self, stdin="1 10\n0\n", expected="0")

    def test_sample_3(self):
        run_case(self, stdin="10 5\n91 59 85 60 57 72 12 3 27 16\n", expected="428633385")

    def test_single_element_k1(self):
        # Only one subarray: 7^1 = 7.
        run_case(self, stdin="1 1\n7\n", expected="7")

    def test_single_max_element_k1(self):
        # Only one subarray: 998244352^1, already below the modulus.
        run_case(self, stdin="1 1\n998244352\n", expected="998244352")

    def test_single_max_element_k10(self):
        # 998244352 = -1 (mod p), so (-1)^10 = 1.
        run_case(self, stdin="1 10\n998244352\n", expected="1")

    def test_single_max_element_k9(self):
        # 998244352 = -1 (mod p), so (-1)^9 = -1 = 998244352.
        run_case(self, stdin="1 9\n998244352\n", expected="998244352")

    def test_two_max_elements_k1(self):
        # Subarray sums are -1, -1, -2 (mod p); total -4 = 998244349.
        run_case(self, stdin="2 1\n998244352 998244352\n", expected="998244349")

    def test_two_max_elements_k2(self):
        # Squares of -1, -1, -2 (mod p): 1 + 1 + 4 = 6.
        run_case(self, stdin="2 2\n998244352 998244352\n", expected="6")

    def test_small_brute_k10(self):
        # Expected computed by the O(N^2) brute force above.
        a = [5, 0, 998244352, 123456789, 2, 998244000]
        run_case(self, stdin=stdin_of(10, a), expected=str(brute(10, a)))

    def test_small_brute_k3(self):
        # Expected computed by the O(N^2) brute force above.
        a = [1, 2, 3, 4, 5, 6, 7, 8]
        run_case(self, stdin=stdin_of(3, a), expected=str(brute(3, a)))

    def test_max_n_all_zero_k10(self):
        # Every subarray sum is 0, so the answer is 0.
        n = 200000
        run_case(self, stdin=stdin_of(10, [0] * n), expected="0")

    def test_max_n_all_ones_k1(self):
        # Subarrays of length L number N-L+1 and sum to L:
        # sum L*(N-L+1) = N(N+1)(N+2)/6.
        n = 200000
        expected = n * (n + 1) * (n + 2) // 6 % MOD
        run_case(self, stdin=stdin_of(1, [1] * n), expected=str(expected))

    def test_max_n_all_ones_k10(self):
        # Subarrays of length L number N-L+1 and sum to L: sum (N-L+1)*L^10.
        n = 200000
        expected = sum((n - L + 1) * pow(L, 10, MOD) for L in range(1, n + 1)) % MOD
        run_case(self, stdin=stdin_of(10, [1] * n), expected=str(expected))

    def test_max_n_all_max_k10(self):
        # Every A_i = -1 (mod p): a length-L subarray sums to -L, and (-L)^10 = L^10,
        # so the answer is sum (N-L+1)*L^10.
        n = 200000
        expected = sum((n - L + 1) * pow(L, 10, MOD) for L in range(1, n + 1)) % MOD
        run_case(self, stdin=stdin_of(10, [MOD - 1] * n), expected=str(expected))


if __name__ == "__main__":
    unittest.main()
