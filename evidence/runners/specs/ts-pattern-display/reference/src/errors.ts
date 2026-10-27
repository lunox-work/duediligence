const MAX_DISPLAY_LENGTH = 200;

/**
 * JSON.stringify of a string, escaping only as much of it as can show
 * before the display is cut. Two code units are kept past the limit so that
 * a surrogate pair is never split before it is escaped.
 */
const quote = (str: string): string =>
  JSON.stringify(
    str.length > MAX_DISPLAY_LENGTH + 2
      ? str.slice(0, MAX_DISPLAY_LENGTH + 2)
      : str
  );

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
};

const constructorName = (value: object): string => {
  const name = Object.getPrototypeOf(value)?.constructor?.name;
  return typeof name === 'string' ? name : '';
};

/**
 * Readable display of a value for the NonExhaustiveError message: what JSON
 * can show is shown as JSON.stringify shows it, what JSON cannot show is
 * shown rather than dropped, a value inside itself is shown as [Circular],
 * and a display longer than 200 characters is cut and followed by "…".
 * Never throws.
 */
export function displayValue(value: unknown): string {
  let out = '';
  // Values still being displayed, to tell a cycle from a shared value.
  const ancestors = new Set<object>();
  const isFull = () => out.length > MAX_DISPLAY_LENGTH;

  // A value that threw while being read is displayed as what it threw.
  const writeThrown = (error: unknown, start: number, depth: number) => {
    out = out.slice(0, start);
    if (depth > 0) {
      out += '[Unknown]';
    } else {
      write(error, '', true, depth + 1);
    }
  };

  const writeProperty = (
    obj: Record<string, unknown>,
    key: string,
    depth: number
  ) => {
    out += quote(key) + ':';
    const start = out.length;
    let prop: unknown;
    try {
      prop = obj[key];
    } catch (e) {
      writeThrown(e, start, depth);
      return;
    }
    write(prop, key, false, depth);
  };

  const writeObject = (obj: object, depth: number) => {
    if (!isPlainObject(obj)) {
      const name = constructorName(obj);
      if (name) out += name + ' ';
    }
    out += '{';
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length && !isFull(); i++) {
      if (i > 0) out += ',';
      writeProperty(obj as Record<string, unknown>, keys[i]!, depth);
    }
    out += '}';
  };

  const writeContainer = (obj: object, depth: number) => {
    if (Array.isArray(obj)) {
      out += '[';
      for (let i = 0; i < obj.length && !isFull(); i++) {
        if (i > 0) out += ',';
        write(obj[i], String(i), false, depth);
      }
      out += ']';
    } else if (obj instanceof Map) {
      out += 'Map {';
      let first = true;
      for (const [k, v] of Map.prototype.entries.call(obj)) {
        if (isFull()) break;
        if (!first) out += ', ';
        first = false;
        write(k, '', false, depth);
        out += ' => ';
        write(v, '', false, depth);
      }
      out += '}';
    } else if (obj instanceof Set) {
      out += 'Set {';
      let first = true;
      for (const v of Set.prototype.values.call(obj)) {
        if (isFull()) break;
        if (!first) out += ', ';
        first = false;
        write(v, '', false, depth);
      }
      out += '}';
    } else {
      writeObject(obj, depth);
    }
  };

  /**
   * `key` is passed to toJSON as JSON.stringify does; `afterToJSON` is set
   * on the value toJSON returned, which is not converted again.
   */
  function write(
    value: unknown,
    key: string,
    afterToJSON: boolean,
    depth: number
  ): void {
    const start = out.length;
    try {
      switch (typeof value) {
        case 'undefined':
          out += 'undefined';
          return;
        case 'boolean':
          out += String(value);
          return;
        case 'number':
          out += Number.isFinite(value) ? JSON.stringify(value) : String(value);
          return;
        case 'bigint':
          out += `${value}n`;
          return;
        case 'string':
          out += quote(value);
          return;
        case 'symbol':
          out += String(value);
          return;
        case 'function': {
          const name = value.name;
          out +=
            typeof name === 'string' && name
              ? `[Function ${name}]`
              : '[Function]';
          return;
        }
      }
      if (value === null) {
        out += 'null';
        return;
      }
      const obj = value as object;
      if (!afterToJSON) {
        const toJSON = (obj as { toJSON?: unknown }).toJSON;
        if (typeof toJSON === 'function') {
          write(toJSON.call(obj, key), key, true, depth);
          return;
        }
      }
      if (obj instanceof Error) {
        out += `[${String(obj.name)}: ${String(obj.message)}]`;
        return;
      }
      if (ancestors.has(obj)) {
        out += '[Circular]';
        return;
      }
      ancestors.add(obj);
      try {
        writeContainer(obj, depth);
      } finally {
        ancestors.delete(obj);
      }
    } catch (e) {
      writeThrown(e, start, depth);
    }
  }

  write(value, '', false, 0);
  return isFull() ? out.slice(0, MAX_DISPLAY_LENGTH) + '…' : out;
}

/**
 * Error when the given input value does not match any included pattern
 * and .exhaustive() was specified
 */
export class NonExhaustiveError extends Error {
  constructor(public input: unknown) {
    super(
      `Pattern matching error: no pattern matches value ${displayValue(input)}`
    );
  }
}
