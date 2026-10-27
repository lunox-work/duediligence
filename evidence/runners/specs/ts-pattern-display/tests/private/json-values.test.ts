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

// R1. JSON values

// Extends "[happy-1] an array of JSON values displays compactly": other numbers.
it('[happy-1] finite numbers display exactly as JSON.stringify shows them', () => {
  const values = [1.5, -2.25, 1e21, 1e-7, 0.1 + 0.2, 123456789, -1];
  for (const v of values) {
    expect(displayValue(v)).toEqual(JSON.stringify(v));
  }
  expect(displayValue(values)).toEqual(JSON.stringify(values));
});

// Extends "[happy-1] a string displays quoted and escaped": other escapes.
it('[happy-1] strings with control characters and backslashes are escaped as JSON does', () => {
  const strings = [
    'line\nbreak',
    'tab\there',
    'back\\slash',
    '\u0001\u001f',
    'café',
    'lone \ud800 surrogate',
    '',
  ];
  for (const s of strings) {
    expect(displayValue(s)).toEqual(JSON.stringify(s));
  }
  expect(displayValue('a\nb')).toEqual('"a\\nb"');
  expect(displayValue('')).toEqual('""');
});

// Extends "[happy-1] a plain object displays as JSON.stringify shows it".
it('[happy-1] empty objects and arrays display as {} and []', () => {
  expect(displayValue({})).toEqual('{}');
  expect(displayValue([])).toEqual('[]');
  expect(displayValue([{}, []])).toEqual('[{},[]]');
});

// Extends "[happy-1] a plain object displays as JSON.stringify shows it": key order.
it('[happy-1] object keys keep the order JSON.stringify gives them', () => {
  const o = { b: 1, 2: 'two', a: 3, 1: 'one' };
  expect(displayValue(o)).toEqual('{"1":"one","2":"two","b":1,"a":3}');
});

// Extends "[happy-1] a plain object displays as JSON.stringify shows it": key escapes.
it('[happy-1] object keys are quoted and escaped', () => {
  expect(displayValue({ 'say "k"': 1, 'new\nline': 2 })).toEqual(
    '{"say \\"k\\"":1,"new\\nline":2}'
  );
});

// Extends "[happy-1] a plain object displays as JSON.stringify shows it".
it('[happy-1] non-enumerable properties of a plain object are left out', () => {
  const o = { a: 1 };
  Object.defineProperty(o, 'hidden', { value: 2, enumerable: false });
  expect(displayValue(o)).toEqual('{"a":1}');
});

// Extends "[happy-1] a plain object displays as JSON.stringify shows it".
it('[happy-1] a getter that returns a value displays that value', () => {
  const o = {
    get ok() {
      return 5;
    },
  };
  expect(displayValue(o)).toEqual('{"ok":5}');
});

// Extends "[happy-1] -0 displays as 0": -0 nested.
it('[happy-1] -0 inside arrays and objects displays as 0', () => {
  expect(displayValue([-0, { z: -0 }])).toEqual('[0,{"z":0}]');
});

// Extends "[happy-1] nested objects and arrays display as JSON": deeper nesting.
it('[happy-1] deeply nested JSON values display as JSON.stringify shows them', () => {
  const v = {
    a: { b: { c: { d: [[[1, 'x', null]]] } } },
    e: [true, false, { f: [] }],
  };
  expect(displayValue(v)).toEqual(JSON.stringify(v));
  expect(displayValue(v)).toEqual(
    '{"a":{"b":{"c":{"d":[[[1,"x",null]]]}}},"e":[true,false,{"f":[]}]}'
  );
});

// Extends "[happy-1] a valid Date displays as its quoted ISO string": nested Dates.
it('[happy-1] Dates inside objects and arrays display as their toJSON value', () => {
  expect(displayValue({ at: new Date(0) })).toEqual(
    '{"at":"1970-01-01T00:00:00.000Z"}'
  );
  expect(
    displayValue([new Date('1999-12-31T23:59:59.999Z'), new Date(NaN)])
  ).toEqual('["1999-12-31T23:59:59.999Z",null]');
});

// Extends "[happy-1] a null-prototype object displays as a plain object".
it('[happy-1] a null-prototype object with nested values displays without a name', () => {
  const o = Object.assign(Object.create(null), {
    a: [1],
    b: { c: null },
    d: 'x',
  });
  expect(displayValue(o)).toEqual('{"a":[1],"b":{"c":null},"d":"x"}');
  expect(displayValue({ inner: o })).toEqual(
    '{"inner":{"a":[1],"b":{"c":null},"d":"x"}}'
  );
});

// Extends "[happy-1] symbol-keyed properties are left out".
it('[happy-1] symbol-keyed properties are left out at every depth', () => {
  const inner = { [Symbol('hidden')]: 1, shown: 2 };
  expect(displayValue({ [Symbol.iterator]: 0, inner })).toEqual(
    '{"inner":{"shown":2}}'
  );
  const nullProto = Object.assign(Object.create(null), { k: 1 });
  nullProto[Symbol('s')] = 2;
  expect(displayValue(nullProto)).toEqual('{"k":1}');
});

// Extends "[happy-1] an object with toJSON displays what toJSON returns".
it('[happy-1] toJSON returning a primitive displays that primitive', () => {
  expect(displayValue({ toJSON: () => 'custom' })).toEqual('"custom"');
  expect(displayValue({ x: { toJSON: () => 5 } })).toEqual('{"x":5}');
  expect(displayValue([{ toJSON: () => null }])).toEqual('[null]');
});

// Extends "[happy-1] an object with toJSON displays what toJSON returns".
it('[happy-1] toJSON returning a value JSON cannot show displays that value', () => {
  expect(displayValue({ toJSON: () => new Map([[1, 2]]) })).toEqual(
    'Map {1 => 2}'
  );
  expect(displayValue({ k: { toJSON: () => undefined } })).toEqual(
    '{"k":undefined}'
  );
});

// Extends "[happy-1] an object with toJSON displays what toJSON returns": class instance.
it('[happy-1] a class instance with toJSON displays what toJSON returns', () => {
  class Money {
    constructor(public cents: number) {}
    toJSON() {
      return `$${this.cents / 100}`;
    }
  }
  expect(displayValue(new Money(150))).toEqual('"$1.5"');
  expect(displayValue({ price: new Money(250) })).toEqual('{"price":"$2.5"}');
});

// R1. The existing message for a plain object is unchanged

// Extends "[happy-2] the message for an unmatched plain object is unchanged".
it('[happy-2] messages for other unmatched JSON inputs are unchanged', () => {
  const inputs: unknown[] = [
    { color: 'orange', size: 3, tags: ['a', 'b'], nested: { ok: true } },
    [1, 'two', null],
    'blue',
    42,
    null,
  ];
  for (const input of inputs) {
    const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;
    expect(err).toBeInstanceOf(NonExhaustiveError);
    expect(err.input).toBe(input);
    expect(err.message).toEqual(PREFIX + JSON.stringify(input));
    expect(displayValue(input)).toEqual(JSON.stringify(input));
  }
});

// Extends "[happy-2] the message shows an undefined property of the input".
it('[happy-2] the message shows Maps, Sets, NaN and bigints in the input', () => {
  const input = {
    color: 'orange',
    m: new Map([['k', 1n]]),
    s: new Set([NaN]),
  };
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(
    PREFIX + '{"color":"orange","m":Map {"k" => 1n},"s":Set {NaN}}'
  );
});

// Extends "[happy-2] the constructor builds its message from displayValue".
it('[happy-2] the constructor message uses displayValue for other inputs', () => {
  const sym = Symbol('tag');
  function named() {}
  const cases: [unknown, string][] = [
    [sym, 'Symbol(tag)'],
    [named, '[Function named]'],
    [new Set([1, 2]), 'Set {1, 2}'],
    [new RangeError('far'), '[RangeError: far]'],
    [[undefined], '[undefined]'],
  ];
  for (const [input, display] of cases) {
    const err = new NonExhaustiveError(input);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NonExhaustiveError);
    expect(err.input).toBe(input);
    expect(err.message).toEqual(PREFIX + display);
    expect(err.message).toEqual(PREFIX + displayValue(input));
  }
});
