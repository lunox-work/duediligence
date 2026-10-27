# NonExhaustiveError messages are unreadable for some inputs

When `.exhaustive()` throws, the message is built with `JSON.stringify` on
the input. That loses information: `undefined` fields vanish, Maps and Sets
print as `{}`, a BigInt makes stringify throw so we end up printing
`[object Object]`, and a large input dumps a megabyte into our logs. Please
show the value readably and keep the message short. The message we get for
plain objects today should stay exactly as it is; we grep for it.
