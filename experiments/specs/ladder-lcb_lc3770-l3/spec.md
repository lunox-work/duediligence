# lexicographically-smallest-generated-string

You are given a pattern string of 'T' and 'F' characters and a second string, and must build a word whose length is the pattern's length plus the second string's length minus one. For each position in the pattern, the window of the word starting there with the second string's length must equal the second string if the pattern has 'T' at that position, and must differ from it if the pattern has 'F'. Find the lexicographically smallest word that meets all these conditions.

## Format

You will use the following starter code to write the solution to the problem and enclose your code within delimiters.

```python
class Solution:
    def generateString(self, str1: str, str2: str) -> str:
```
