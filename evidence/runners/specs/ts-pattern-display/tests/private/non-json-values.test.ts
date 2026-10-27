import { displayValue } from '../../src/errors';

// A function whose name is empty, made where no name can be inferred.
const anonymous = (() => () => 1)();

// R2. Values JSON cannot show

// Extends "[happy-3] an undefined object property is shown": other positions.
it('[happy-3] undefined is shown as the only, first and nested property', () => {
  expect(displayValue({ u: undefined })).toEqual('{"u":undefined}');
  expect(displayValue({ u: undefined, a: 1 })).toEqual('{"u":undefined,"a":1}');
  expect(displayValue({ a: { b: undefined }, c: [undefined, 1] })).toEqual(
    '{"a":{"b":undefined},"c":[undefined,1]}'
  );
});

// Extends "[happy-3] undefined, NaN and -Infinity in an array are shown by name".
it('[happy-3] NaN and the infinities are shown by name as object properties', () => {
  expect(displayValue({ n: NaN, p: Infinity, m: -Infinity })).toEqual(
    '{"n":NaN,"p":Infinity,"m":-Infinity}'
  );
  expect(displayValue([Infinity, [NaN]])).toEqual('[Infinity,[NaN]]');
  expect(displayValue(-Infinity)).toEqual('-Infinity');
});

// Extends "[happy-3] a bigint displays as its digits and n": other bigints.
it('[happy-3] zero, large and negative bigints display as digits and n', () => {
  expect(displayValue(0n)).toEqual('0n');
  expect(displayValue(-7n)).toEqual('-7n');
  expect(displayValue(123456789012345678901234567890n)).toEqual(
    '123456789012345678901234567890n'
  );
  expect(displayValue([1n, -20n])).toEqual('[1n,-20n]');
});

// Extends "[happy-3] a symbol displays as String(symbol)".
it('[happy-3] symbols inside objects and arrays display as String(symbol)', () => {
  expect(displayValue({ s: Symbol('x') })).toEqual('{"s":Symbol(x)}');
  expect(displayValue([Symbol(), Symbol('a b')])).toEqual(
    '[Symbol(),Symbol(a b)]'
  );
  expect(displayValue(Symbol.iterator)).toEqual('Symbol(Symbol.iterator)');
  expect(displayValue(Symbol('say "q"'))).toEqual('Symbol(say "q")');
});

// Extends "[happy-3] a named function displays as [Function name]".
it('[happy-3] functions inside objects and arrays display by name', () => {
  const onClick = () => 0;
  expect(
    displayValue({
      m() {
        return 1;
      },
    })
  ).toEqual('{"m":[Function m]}');
  expect(displayValue([onClick])).toEqual('[[Function onClick]]');
  expect(displayValue(new Map([['cb', onClick]]))).toEqual(
    'Map {"cb" => [Function onClick]}'
  );
});

// Extends "[happy-3] a named function displays as [Function name]": the name property.
it('[happy-3] a function displays the name its name property holds', () => {
  function original() {}
  Object.defineProperty(original, 'name', { value: 'renamed' });
  expect(displayValue(original)).toEqual('[Function renamed]');
});

// Extends "[happy-3] an Error displays as [Name: message]": other Errors.
it('[happy-3] other Errors display as [Name: message] at every depth', () => {
  expect(displayValue(new Error('x'))).toEqual('[Error: x]');
  expect(displayValue({ e: new SyntaxError('bad token') })).toEqual(
    '{"e":[SyntaxError: bad token]}'
  );
  expect(displayValue([new RangeError('far')])).toEqual('[[RangeError: far]]');
  expect(displayValue(new Error('say "hi"'))).toEqual('[Error: say "hi"]');
});

// Extends "[happy-3] an Error with a custom name displays that name": a subclass.
it('[happy-3] an Error subclass displays its name and message', () => {
  class HttpError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }
  expect(displayValue(new HttpError('not found'))).toEqual(
    '[HttpError: not found]'
  );
});

// Extends "[happy-3] a Map displays its entries in insertion order": more entries,
// keys not in sorted order.
it('[happy-3] a Map with three entries keeps insertion order, not key order', () => {
  expect(
    displayValue(
      new Map<unknown, unknown>([
        [2, 'b'],
        [1, 'a'],
        ['z', 3],
      ])
    )
  ).toEqual('Map {2 => "b", 1 => "a", "z" => 3}');
});

// Extends "[happy-3] a Map displays its entries in insertion order": other keys.
it('[happy-3] Map keys of any kind display by the same rules', () => {
  expect(displayValue(new Map([[{ id: 1 }, 'x']]))).toEqual(
    'Map {{"id":1} => "x"}'
  );
  expect(displayValue(new Map([[undefined, NaN]]))).toEqual(
    'Map {undefined => NaN}'
  );
  expect(displayValue(new Map([[1n, [Symbol('v')]]]))).toEqual(
    'Map {1n => [Symbol(v)]}'
  );
});

// Extends "[happy-3] a Map displays its entries in insertion order": nesting.
it('[happy-3] Maps nested in objects and Maps display by the same rules', () => {
  expect(displayValue({ m: new Map([['k', 1]]) })).toEqual(
    '{"m":Map {"k" => 1}}'
  );
  expect(displayValue(new Map([['outer', new Map([['inner', true]])]]))).toEqual(
    'Map {"outer" => Map {"inner" => true}}'
  );
  expect(displayValue(new Map([['one', 1]]))).toEqual('Map {"one" => 1}');
});

// Extends "[happy-3] a Set displays its values in insertion order".
it('[happy-3] a Set keeps insertion order, not sorted order', () => {
  expect(displayValue(new Set([3, 1, 2]))).toEqual('Set {3, 1, 2}');
  expect(displayValue(new Set(['b', 'a']))).toEqual('Set {"b", "a"}');
  expect(displayValue(new Set([1]))).toEqual('Set {1}');
});

// Extends "[happy-3] a Set displays its values in insertion order": other values.
it('[happy-3] Set values of any kind display by the same rules', () => {
  expect(displayValue(new Set(['a"b']))).toEqual('Set {"a\\"b"}');
  expect(displayValue(new Set<unknown>([{ a: undefined }, [1], new Set([2])]))).toEqual(
    'Set {{"a":undefined}, [1], Set {2}}'
  );
  expect(displayValue([new Set([NaN, -Infinity])])).toEqual(
    '[Set {NaN, -Infinity}]'
  );
});

// Extends "[happy-3] an empty Map and an empty Set display as Map {} and Set {}".
it('[happy-3] empty Maps and Sets at top level and in arrays', () => {
  expect(displayValue(new Map())).toEqual('Map {}');
  expect(displayValue(new Set())).toEqual('Set {}');
  expect(displayValue([new Set(), new Map()])).toEqual('[Set {},Map {}]');
});

// Extends "[happy-3] a class instance displays its constructor name and properties".
it('[happy-3] a class instance shows its own properties in their order', () => {
  class P {
    y = 2;
    x = 1;
    label = 'p';
  }
  expect(displayValue(new P())).toEqual('P {"y":2,"x":1,"label":"p"}');
});

// Extends "[happy-3] a class instance displays its constructor name and properties".
it('[happy-3] class instances nested in class instances and arrays show their names', () => {
  class Point {
    constructor(public x: number) {}
  }
  class Line {
    constructor(public from: Point, public to: Point) {}
  }
  expect(displayValue(new Line(new Point(0), new Point(1)))).toEqual(
    'Line {"from":Point {"x":0},"to":Point {"x":1}}'
  );
  expect(displayValue([new Point(2)])).toEqual('[Point {"x":2}]');
  expect(displayValue({ p: new Point(3) })).toEqual('{"p":Point {"x":3}}');
});

// Extends "[happy-3] a class instance displays its constructor name and properties".
it('[happy-3] an instance of a subclass shows the subclass name', () => {
  class Point {
    x = 1;
  }
  class Point3 extends Point {
    z = 3;
  }
  expect(displayValue(new Point3())).toEqual('Point3 {"x":1,"z":3}');
});

// Extends "[happy-3] a class instance displays its constructor name and properties".
it('[happy-3] a class instance shows only its own enumerable string-keyed properties', () => {
  class Shape {
    side = 2;
    [Symbol.toStringTag] = 'ignored';
    get area() {
      return this.side * this.side;
    }
  }
  const s = new Shape();
  Object.defineProperty(s, 'secret', { value: 1, enumerable: false });
  expect(displayValue(s)).toEqual('Shape {"side":2}');
});

// Extends "[happy-3] a class instance displays its constructor name and properties".
it('[happy-3] class instance properties display by the same rules', () => {
  class Box {
    v: unknown = undefined;
    n = NaN;
    b = 5n;
    m = new Map([['k', 'v']]);
  }
  expect(displayValue(new Box())).toEqual(
    'Box {"v":undefined,"n":NaN,"b":5n,"m":Map {"k" => "v"}}'
  );
});

// R2. An anonymous function

// Extends "[boundary-1] an anonymous function inside an array displays as [Function]".
it('[boundary-1] an anonymous function inside an object, Map and Set displays as [Function]', () => {
  expect(displayValue({ f: anonymous })).toEqual('{"f":[Function]}');
  expect(displayValue(new Map([['k', anonymous]]))).toEqual(
    'Map {"k" => [Function]}'
  );
  expect(displayValue(new Set([anonymous]))).toEqual('Set {[Function]}');
});

// Extends "[boundary-1] an anonymous function displays as [Function]": name made empty.
it('[boundary-1] a function whose name is empty displays as [Function]', () => {
  function hadName() {}
  Object.defineProperty(hadName, 'name', { value: '' });
  expect(displayValue(hadName)).toEqual('[Function]');
});
