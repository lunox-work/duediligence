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

// R3. A circular object

// Extends "[boundary-2] a cycle through a nested object shows [Circular] at the ancestor":
// the ancestor reached again is not the root.
it('[boundary-2] a cycle back to a middle ancestor shows [Circular] there', () => {
  const middle: Record<string, unknown> = {};
  middle.c = { back: middle };
  const root = { b: middle };
  expect(displayValue(root)).toEqual('{"b":{"c":{"back":[Circular]}}}');
});

// Extends "[boundary-2] an object containing itself shows [Circular] there": siblings after it.
it('[boundary-2] properties after a [Circular] are still shown', () => {
  const a: Record<string, unknown> = { x: 1 };
  a.self = a;
  a.y = 2;
  a.again = a;
  expect(displayValue(a)).toEqual(
    '{"x":1,"self":[Circular],"y":2,"again":[Circular]}'
  );
});

// Extends "[boundary-2] a Map containing itself shows [Circular]": as a key, and a Set.
it('[boundary-2] a Map that is its own key and a Set that contains itself', () => {
  const m = new Map<unknown, unknown>();
  m.set(m, 1);
  expect(displayValue(m)).toEqual('Map {[Circular] => 1}');

  const s = new Set<unknown>([1]);
  s.add(s);
  expect(displayValue(s)).toEqual('Set {1, [Circular]}');
});

// Extends "[boundary-2] an array containing itself shows [Circular]": through an object.
it('[boundary-2] a cycle through an array inside an object shows [Circular]', () => {
  const o: Record<string, unknown> = {};
  o.list = [1, o];
  expect(displayValue(o)).toEqual('{"list":[1,[Circular]]}');
  expect(displayValue(o.list)).toEqual('[1,{"list":[Circular]}]');
});

// Extends "[boundary-2] an object containing itself shows [Circular] there": a class instance.
it('[boundary-2] a class instance containing itself shows [Circular]', () => {
  class Node {
    next: unknown = null;
    value = 1;
  }
  const n = new Node();
  n.next = n;
  expect(displayValue(n)).toEqual('Node {"next":[Circular],"value":1}');
});

// Combines boundary-2 and boundary-3: a circular value shared twice is shown in
// full each time, with [Circular] only inside itself.
it('[boundary-2] a circular value reached twice is shown in full both times', () => {
  const inner: Record<string, unknown> = { name: 'i' };
  inner.me = inner;
  expect(displayValue([inner, inner])).toEqual(
    '[{"name":"i","me":[Circular]},{"name":"i","me":[Circular]}]'
  );
});

// Extends "[boundary-2] an object containing itself shows [Circular] there": via the error.
it('[boundary-2] the NonExhaustiveError message shows [Circular] for a circular input', () => {
  const input: Record<string, unknown> = { color: 'orange' };
  input.self = input;
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(
    PREFIX + '{"color":"orange","self":[Circular]}'
  );
});

// R3. A shared value is not circular

// Extends "[boundary-3] a shared value in an array is displayed in full each time": Maps.
it('[boundary-3] a value shared by Map values, and as key and value, is shown in full', () => {
  const shared = { v: 1 };
  expect(
    displayValue(
      new Map([
        ['a', shared],
        ['b', shared],
      ])
    )
  ).toEqual('Map {"a" => {"v":1}, "b" => {"v":1}}');
  expect(displayValue(new Map([[shared, shared]]))).toEqual(
    'Map {{"v":1} => {"v":1}}'
  );
});

// Extends "[boundary-3] a shared value in an array is displayed in full each time": Sets.
it('[boundary-3] a value shared by two Sets is shown in full in each', () => {
  const shared = [1, 2];
  expect(displayValue([new Set([shared]), new Set([shared])])).toEqual(
    '[Set {[1,2]},Set {[1,2]}]'
  );
});

// Extends "[boundary-3] a shared value at different depths is displayed in full each time":
// the deep occurrence first, then the shallow one, and three uses.
it('[boundary-3] a shared value shown deep first, then shallow, then again', () => {
  const shared = { v: 1 };
  expect(
    displayValue({ deep: { deeper: [shared] }, top: shared, last: shared })
  ).toEqual('{"deep":{"deeper":[{"v":1}]},"top":{"v":1},"last":{"v":1}}');
});

// Extends "[boundary-3] a shared value in an array is displayed in full each time":
// shared arrays, Maps and class instances.
it('[boundary-3] shared arrays, Maps and class instances are shown in full each time', () => {
  class Tag {
    t = 'x';
  }
  const arr = [1];
  const map = new Map([['k', 0]]);
  const tag = new Tag();
  expect(
    displayValue({ a: arr, b: arr, c: [arr], m1: map, m2: map, t: [tag, tag] })
  ).toEqual(
    '{"a":[1],"b":[1],"c":[[1]],"m1":Map {"k" => 0},"m2":Map {"k" => 0},"t":[Tag {"t":"x"},Tag {"t":"x"}]}'
  );
});

// Extends "[boundary-3] a shared value in an array is displayed in full each time":
// the same object many times.
it('[boundary-3] one object reached ten times is shown in full ten times', () => {
  const shared = { v: 1 };
  const arr = new Array(10).fill(shared);
  expect(displayValue(arr)).toEqual(
    '[' + new Array(10).fill('{"v":1}').join(',') + ']'
  );
});

// R3. A getter that throws does not escape

// Extends "[unhappy-1] a getter that throws displays the error as its value": nested.
it('[unhappy-1] a throwing getter deep inside displays the error there', () => {
  const o = {
    outer: {
      get bad(): unknown {
        throw new TypeError('t');
      },
    },
    list: [
      {
        get worse(): unknown {
          throw new SyntaxError('s');
        },
      },
    ],
  };
  let result: string | undefined;
  expect(() => {
    result = displayValue(o);
  }).not.toThrow();
  expect(result).toEqual(
    '{"outer":{"bad":[TypeError: t]},"list":[{"worse":[SyntaxError: s]}]}'
  );
});

// Extends "[unhappy-1] a throwing getter among other properties leaves them shown":
// two throwing getters, one with a custom error name.
it('[unhappy-1] two throwing getters each display their own error', () => {
  const custom = new Error('custom message');
  custom.name = 'MyError';
  const o = {
    get first(): unknown {
      throw custom;
    },
    middle: 'm',
    get second(): unknown {
      throw new Error('second');
    },
  };
  let result: string | undefined;
  expect(() => {
    result = displayValue(o);
  }).not.toThrow();
  expect(result).toEqual(
    '{"first":[MyError: custom message],"middle":"m","second":[Error: second]}'
  );
});

// Extends "[unhappy-1] a getter that throws displays the error as its value": on a class instance.
it('[unhappy-1] a throwing getter on a class instance displays the error', () => {
  class Thing {
    a = 1;
  }
  const t = new Thing();
  Object.defineProperty(t, 'bad', {
    enumerable: true,
    get() {
      throw new Error('no');
    },
  });
  let result: string | undefined;
  expect(() => {
    result = displayValue(t);
  }).not.toThrow();
  expect(result).toEqual('Thing {"a":1,"bad":[Error: no]}');
});

// Extends "[unhappy-1] a getter that throws displays the error as its value": via the error.
it('[unhappy-1] an input with a throwing getter still gets a NonExhaustiveError', () => {
  const input = {
    color: 'orange',
    get bad(): unknown {
      throw new Error('no');
    },
  };
  const err = thrownBy(() => matchOnlyRed(input)) as NonExhaustiveError;

  expect(err).toBeInstanceOf(NonExhaustiveError);
  expect(err.input).toBe(input);
  expect(err.message).toEqual(PREFIX + '{"color":"orange","bad":[Error: no]}');
});

// displayValue never throws: a toJSON that throws.
it('[unhappy-1] a toJSON that throws does not escape', () => {
  const o = {
    toJSON(): unknown {
      throw new Error('toJSON failed');
    },
  };
  let result: unknown;
  expect(() => {
    result = displayValue(o);
  }).not.toThrow();
  expect(typeof result).toBe('string');
});

// displayValue never throws: a Proxy whose traps throw.
it('[unhappy-1] a Proxy whose traps throw does not escape', () => {
  const fail = () => {
    throw new Error('trap');
  };
  const p = new Proxy(
    {},
    { ownKeys: fail, get: fail, getOwnPropertyDescriptor: fail, has: fail }
  );
  let result: unknown;
  expect(() => {
    result = displayValue(p);
  }).not.toThrow();
  expect(typeof result).toBe('string');
  expect(() => displayValue([p, { p }])).not.toThrow();
});
