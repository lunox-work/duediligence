import { match } from '../../src';
import { displayValue, NonExhaustiveError } from '../../src/errors';

const PREFIX = 'Pattern matching error: no pattern matches value ';

// A match with only a pattern for { color: 'red' }; anything else is unmatched.
const matchOnlyRed = (input: unknown) =>
  match(input as { color: 'red' })
    .with({ color: 'red' }, () => 'red')
    .exhaustive();

const thrownBy = (f: () => unknown): unknown => {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
};

const cut = (display: string) => display.slice(0, 200) + '…';

// R4. Exactly 200 characters is kept

// Extends "[boundary-4] a display of exactly 200 characters is not cut": an object.
it('[boundary-4] an object display of exactly 200 characters is not cut', () => {
  const o = { k: 'x'.repeat(192) };
  const result = displayValue(o);
  expect(result).toEqual(JSON.stringify(o));
  expect(result.length).toBe(200);
});

// Extends "[boundary-4] a display of exactly 200 characters is not cut": a Map, whose
// display is not JSON.
it('[boundary-4] a Map display of exactly 200 characters is not cut', () => {
  const v = 'x'.repeat(185);
  const result = displayValue(new Map([['k', v]]));
  expect(result).toEqual('Map {"k" => "' + v + '"}');
  expect(result.length).toBe(200);
});

// Extends "[boundary-4] a display of exactly 200 characters is not cut": escapes count.
it('[boundary-4] escape characters count toward the 200', () => {
  const s = '"'.repeat(99);
  const result = displayValue(s);
  expect(result).toEqual('"' + '\\"'.repeat(99) + '"');
  expect(result.length).toBe(200);
});

// Extends "[boundary-4] a display of exactly 200 characters is not cut": just under.
it('[boundary-4] a display of 199 characters is not cut', () => {
  const s = 'x'.repeat(197);
  expect(displayValue(s)).toEqual('"' + s + '"');
  expect(displayValue([s.slice(2)])).toEqual('["' + s.slice(2) + '"]');
});

// R4. 201 characters is cut

// Extends "[boundary-5] a display of 201 characters is cut to 200 and an ellipsis":
// a longer string inside an object is cut once, as a whole.
it('[boundary-5] a long string inside an object is cut with the whole display', () => {
  const o = { a: 'x'.repeat(250) };
  const result = displayValue(o);
  expect(result).toEqual('{"a":"' + 'x'.repeat(194) + '…');
  expect(result.length).toBe(201);
});

// Extends "[boundary-5] a 201-character array display is cut to 200 and an ellipsis":
// two long parts, cut once.
it('[boundary-5] a display made of several long parts has one ellipsis', () => {
  const v = ['a'.repeat(150), 'b'.repeat(150)];
  const result = displayValue(v);
  expect(result).toEqual(cut(JSON.stringify(v)));
  expect(result).toEqual('["' + 'a'.repeat(150) + '","' + 'b'.repeat(45) + '…');
  expect(result.split('…').length).toBe(2);
});

// Extends "[boundary-5] a display of 201 characters is cut to 200 and an ellipsis": 202.
it('[boundary-5] a display of 202 characters is cut to 200 and an ellipsis', () => {
  const result = displayValue('y'.repeat(200));
  expect(result).toEqual('"' + 'y'.repeat(199) + '…');
  expect(result.length).toBe(201);
});

// Extends "[boundary-5] a display of 201 characters is cut to 200 and an ellipsis":
// the cut is made after escaping.
it('[boundary-5] the cut is counted on the escaped display', () => {
  const result = displayValue('"'.repeat(100));
  expect(result).toEqual('"' + '\\"'.repeat(99) + '\\' + '…');
  expect(result.length).toBe(201);
});

// Extends "[boundary-4] the length is counted in UTF-16 code units": the cut counts
// code units too, even inside a surrogate pair.
it('[boundary-5] the cut is made after 200 UTF-16 code units', () => {
  const s = '😀'.repeat(100);
  const result = displayValue(s);
  expect(result).toEqual(('"' + s + '"').slice(0, 200) + '…');
  expect(result).toEqual('"' + '😀'.repeat(99) + '\ud83d' + '…');
  expect(result.length).toBe(201);
});

// Extends "[boundary-5] a 201-character array display is cut to 200 and an ellipsis":
// a Set display, which is not JSON.
it('[boundary-5] a long Set display is cut to 200 and an ellipsis', () => {
  const values = Array.from({ length: 100 }, (_, i) => i);
  const result = displayValue(new Set(values));
  expect(result).toEqual(cut('Set {' + values.join(', ') + '}'));
  expect(result.length).toBe(201);
});

// Extends "[boundary-5] a 201-character array display is cut to 200 and an ellipsis":
// a Map display with non-JSON values.
it('[boundary-5] a long Map display of non-JSON values is cut to 200 and an ellipsis', () => {
  const entries = Array.from({ length: 40 }, (_, i): [number, bigint] => [
    i,
    BigInt(i),
  ]);
  const result = displayValue(new Map(entries));
  expect(result).toEqual(
    cut('Map {' + entries.map(([k, v]) => `${k} => ${v}n`).join(', ') + '}')
  );
  expect(result.length).toBe(201);
});

// R4. A huge input does not flood the message

// Extends "[unhappy-2] a huge array shows only its first 200 display characters": a Map.
it('[unhappy-2] a huge Map shows only its first 200 display characters', () => {
  const input = new Map(
    Array.from({ length: 100000 }, (_, i): [number, string] => [i, 'v' + i])
  );
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  const display =
    'Map {' +
    Array.from({ length: 100 }, (_, i) => `${i} => "v${i}"`).join(', ');
  expect(err.message).toEqual(PREFIX + cut(display));
  expect(err.message.length).toBe(PREFIX.length + 201);
});

// Extends "[unhappy-2] a huge array shows only its first 200 display characters":
// an object of undefined properties, which JSON would drop.
it('[unhappy-2] a huge object of undefined properties shows its first 200 characters', () => {
  const input: Record<string, undefined> = {};
  for (let i = 0; i < 100000; i++) input['k' + i] = undefined;
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  const display =
    '{' +
    Array.from({ length: 100 }, (_, i) => `"k${i}":undefined`).join(',');
  expect(err.message).toEqual(PREFIX + cut(display));
  expect(err.message.length).toBe(PREFIX.length + 201);
});

// Extends "[unhappy-2] a huge array shows only its first 200 display characters":
// bigints, which make JSON.stringify throw.
it('[unhappy-2] a huge array of bigints shows only its first 200 display characters', () => {
  const input = Array.from({ length: 100000 }, (_, i) => BigInt(i));
  const err = new NonExhaustiveError(input);

  expect(err.input).toBe(input);
  const display =
    '[' + Array.from({ length: 100 }, (_, i) => `${i}n`).join(',');
  expect(err.message).toEqual(PREFIX + cut(display));
  expect(err.message.length).toBe(PREFIX.length + 201);
});

// Extends "[unhappy-2] a huge string shows only its first 200 display characters":
// a string that is escaped.
it('[unhappy-2] a huge string of newlines shows only its first 200 display characters', () => {
  const input = '\n'.repeat(100000);
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(PREFIX + '"' + '\\n'.repeat(99) + '\\' + '…');
});

// Extends "[unhappy-2] a huge array shows only its first 200 display characters": a Set
// through the constructor.
it('[unhappy-2] a huge Set shows only its first 200 display characters', () => {
  const input = new Set(Array.from({ length: 100000 }, (_, i) => i));
  const err = new NonExhaustiveError(input);

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.message).toEqual(
    PREFIX + cut('Set {' + Array.from({ length: 100 }, (_, i) => i).join(', '))
  );
});
