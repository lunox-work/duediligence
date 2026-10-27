import { match } from '../src';
import { displayValue, NonExhaustiveError } from '../src/errors';

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

it('[happy-1] a plain object displays as JSON.stringify shows it', () => {
  expect(displayValue({ color: 'orange' })).toEqual('{"color":"orange"}');
});

it('[happy-1] an array of JSON values displays compactly', () => {
  expect(displayValue([1, 'a', null, true])).toEqual('[1,"a",null,true]');
});

it('[happy-1] a string displays quoted and escaped', () => {
  expect(displayValue('say "hi"')).toEqual('"say \\"hi\\""');
});

it('[happy-1] -0 displays as 0', () => {
  expect(displayValue(-0)).toEqual('0');
});

it('[happy-1] nested objects and arrays display as JSON', () => {
  expect(displayValue({ a: { b: [] } })).toEqual('{"a":{"b":[]}}');
});

it('[happy-1] a valid Date displays as its quoted ISO string', () => {
  expect(displayValue(new Date('2020-01-02T03:04:05Z'))).toEqual(
    '"2020-01-02T03:04:05.000Z"'
  );
});

it('[happy-1] a null-prototype object displays as a plain object', () => {
  expect(displayValue(Object.assign(Object.create(null), { k: 1 }))).toEqual(
    '{"k":1}'
  );
});

it('[happy-1] null and booleans display as JSON', () => {
  expect(displayValue(null)).toEqual('null');
  expect(displayValue(true)).toEqual('true');
  expect(displayValue(false)).toEqual('false');
});

it('[happy-1] an invalid Date displays as null', () => {
  expect(displayValue(new Date(NaN))).toEqual('null');
});

it('[happy-1] symbol-keyed properties are left out', () => {
  expect(displayValue({ a: 1, [Symbol('s')]: 2 })).toEqual('{"a":1}');
});

it('[happy-1] an object with toJSON displays what toJSON returns', () => {
  expect(displayValue({ toJSON: () => ({ replaced: true }) })).toEqual(
    '{"replaced":true}'
  );
});

// R1. The existing message for a plain object is unchanged

it('[happy-2] the message for an unmatched plain object is unchanged', () => {
  const input = { color: 'orange' };
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(
    'Pattern matching error: no pattern matches value {"color":"orange"}'
  );
});

it('[happy-2] the message shows an undefined property of the input', () => {
  const input = { color: undefined };
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(PREFIX + '{"color":undefined}');
});

it('[happy-2] the constructor builds its message from displayValue', () => {
  const err = new NonExhaustiveError(12n);

  expect(err).toBeInstanceOf(Error);
  expect(err.input).toBe(12n);
  expect(err.message).toEqual(PREFIX + '12n');
});

// R2. Values JSON cannot show

it('[happy-3] undefined displays as undefined', () => {
  expect(displayValue(undefined)).toEqual('undefined');
});

it('[happy-3] an undefined object property is shown', () => {
  expect(displayValue({ a: 1, b: undefined })).toEqual('{"a":1,"b":undefined}');
});

it('[happy-3] undefined, NaN and -Infinity in an array are shown by name', () => {
  expect(displayValue([undefined, NaN, -Infinity])).toEqual(
    '[undefined,NaN,-Infinity]'
  );
});

it('[happy-3] a bigint displays as its digits and n', () => {
  expect(displayValue(12n)).toEqual('12n');
});

it('[happy-3] a negative bigint property displays as its digits and n', () => {
  expect(displayValue({ n: -3n })).toEqual('{"n":-3n}');
});

it('[happy-3] a symbol displays as String(symbol)', () => {
  expect(displayValue(Symbol('id'))).toEqual('Symbol(id)');
});

it('[happy-3] a named function displays as [Function name]', () => {
  expect(displayValue(function handler() {})).toEqual('[Function handler]');
});

it('[happy-3] an Error displays as [Name: message]', () => {
  expect(displayValue(new TypeError('boom'))).toEqual('[TypeError: boom]');
});

it('[happy-3] a Map displays its entries in insertion order', () => {
  expect(
    displayValue(
      new Map<unknown, unknown>([
        ['a', 1],
        [2, [3]],
      ])
    )
  ).toEqual('Map {"a" => 1, 2 => [3]}');
});

it('[happy-3] a Set displays its values in insertion order', () => {
  expect(displayValue(new Set<unknown>([1, 'a']))).toEqual('Set {1, "a"}');
});

it('[happy-3] an empty Map and an empty Set display as Map {} and Set {}', () => {
  expect(displayValue({ m: new Map(), s: new Set() })).toEqual(
    '{"m":Map {},"s":Set {}}'
  );
});

it('[happy-3] a class instance displays its constructor name and properties', () => {
  expect(
    displayValue(
      new (class Point {
        x: number;
        constructor() {
          this.x = 1;
        }
      })()
    )
  ).toEqual('Point {"x":1}');
});

it('[happy-3] Infinity, NaN and an empty-description symbol at top level', () => {
  expect(displayValue(Infinity)).toEqual('Infinity');
  expect(displayValue(NaN)).toEqual('NaN');
  expect(displayValue(Symbol())).toEqual('Symbol()');
});

it('[happy-3] the same rules apply inside a Set inside a Map inside an array', () => {
  expect(
    displayValue([new Map([['s', new Set<unknown>([undefined, 1n])]])])
  ).toEqual('[Map {"s" => Set {undefined, 1n}}]');
});

it('[happy-3] a class instance with no own properties displays as Name {}', () => {
  class Empty {}
  expect(displayValue(new Empty())).toEqual('Empty {}');
});

it('[happy-3] an Error with a custom name displays that name', () => {
  const err = new Error('went wrong');
  err.name = 'CustomError';
  expect(displayValue(err)).toEqual('[CustomError: went wrong]');
});

// R2. An anonymous function

it('[boundary-1] an anonymous function displays as [Function]', () => {
  expect(displayValue((() => () => 1)())).toEqual('[Function]');
});

it('[boundary-1] an anonymous function inside an array displays as [Function]', () => {
  expect(displayValue([(() => () => 1)()])).toEqual('[[Function]]');
});

// R3. A circular object

it('[boundary-2] an object containing itself shows [Circular] there', () => {
  const a: Record<string, unknown> = { name: 'a' };
  a.self = a;
  expect(displayValue(a)).toEqual('{"name":"a","self":[Circular]}');
});

it('[boundary-2] a cycle through a nested object shows [Circular] at the ancestor', () => {
  const a: Record<string, unknown> = {};
  a.child = { parent: a };
  expect(displayValue(a)).toEqual('{"child":{"parent":[Circular]}}');
});

it('[boundary-2] an array containing itself shows [Circular]', () => {
  const arr: unknown[] = [1];
  arr.push(arr);
  expect(displayValue(arr)).toEqual('[1,[Circular]]');
});

it('[boundary-2] a Map containing itself shows [Circular]', () => {
  const m = new Map<string, unknown>();
  m.set('self', m);
  expect(displayValue(m)).toEqual('Map {"self" => [Circular]}');
});

// R3. A shared value is not circular

it('[boundary-3] a shared value in an array is displayed in full each time', () => {
  const shared = { v: 1 };
  expect(displayValue([shared, shared])).toEqual('[{"v":1},{"v":1}]');
});

it('[boundary-3] a shared value at different depths is displayed in full each time', () => {
  const shared = { v: 1 };
  expect(displayValue({ x: shared, y: { z: shared } })).toEqual(
    '{"x":{"v":1},"y":{"z":{"v":1}}}'
  );
});

// R3. A getter that throws does not escape

it('[unhappy-1] a getter that throws displays the error as its value', () => {
  const o = {
    get bad(): unknown {
      throw new Error('no');
    },
  };
  let result: string | undefined;
  expect(() => {
    result = displayValue(o);
  }).not.toThrow();
  expect(result).toEqual('{"bad":[Error: no]}');
});

it('[unhappy-1] a throwing getter among other properties leaves them shown', () => {
  const o = {
    a: 1,
    get bad(): unknown {
      throw new RangeError('out');
    },
    c: 2,
  };
  let result: string | undefined;
  expect(() => {
    result = displayValue(o);
  }).not.toThrow();
  expect(result).toEqual('{"a":1,"bad":[RangeError: out],"c":2}');
});

// R4. Exactly 200 characters is kept

it('[boundary-4] a display of exactly 200 characters is not cut', () => {
  const s = 'x'.repeat(198);
  const result = displayValue(s);
  expect(result).toEqual('"' + s + '"');
  expect(result.length).toBe(200);
});

it('[boundary-4] the length is counted in UTF-16 code units', () => {
  const s = '😀'.repeat(99);
  const result = displayValue(s);
  expect(result).toEqual('"' + s + '"');
  expect(result.length).toBe(200);
});

// R4. 201 characters is cut

it('[boundary-5] a display of 201 characters is cut to 200 and an ellipsis', () => {
  const result = displayValue('x'.repeat(199));
  expect(result).toEqual('"' + 'x'.repeat(199) + '…');
  expect(result.length).toBe(201);
});

it('[boundary-5] a 201-character array display is cut to 200 and an ellipsis', () => {
  const zeros = new Array<number>(100).fill(0);
  const result = displayValue(zeros);
  expect(result).toEqual('[' + '0,'.repeat(99) + '0' + '…');
  expect(result.length).toBe(201);
});

// R4. A huge input does not flood the message

it('[unhappy-2] a huge array shows only its first 200 display characters', () => {
  const input = Array.from({ length: 100000 }, (_, i) => i);
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.message).toEqual(
    PREFIX + JSON.stringify(input).slice(0, 200) + '…'
  );
  expect(err.message.length).toBe(PREFIX.length + 201);
});

it('[unhappy-2] a huge string shows only its first 200 display characters', () => {
  const input = 'x'.repeat(100000);
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(PREFIX + '"' + 'x'.repeat(199) + '…');
});
