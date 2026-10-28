//! A strict JSON (RFC 8259) parser, and the writing of JSON strings.

#[allow(dead_code)] // the boolean is kept though no field reads it
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Value>),
    Object(Vec<(String, Value)>),
}

impl Value {
    /// The value of a member of an object; the last one when a name is repeated.
    pub fn get(&self, name: &str) -> Option<&Value> {
        match self {
            Value::Object(members) => members.iter().rev().find(|(k, _)| k == name).map(|(_, v)| v),
            _ => None,
        }
    }
}

pub fn parse(text: &str) -> Result<Value, String> {
    let mut parser = Parser { bytes: text.as_bytes(), pos: 0 };
    parser.skip_whitespace();
    let value = parser.value(0)?;
    parser.skip_whitespace();
    if parser.pos != parser.bytes.len() {
        return Err(format!("unexpected text at offset {}", parser.pos));
    }
    Ok(value)
}

/// Writes the text as a JSON string, quotes included.
pub fn quote(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

const MAX_DEPTH: usize = 512;

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn error<T>(&self, what: &str) -> Result<T, String> {
        Err(format!("{what} at offset {}", self.pos))
    }

    fn skip_whitespace(&mut self) {
        while let Some(b' ' | b'\t' | b'\n' | b'\r') = self.peek() {
            self.pos += 1;
        }
    }

    fn literal(&mut self, word: &str, value: Value) -> Result<Value, String> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Ok(value)
        } else {
            self.error("unexpected text")
        }
    }

    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > MAX_DEPTH {
            return self.error("too deeply nested");
        }
        match self.peek() {
            None => self.error("unexpected end of input"),
            Some(b'n') => self.literal("null", Value::Null),
            Some(b't') => self.literal("true", Value::Bool(true)),
            Some(b'f') => self.literal("false", Value::Bool(false)),
            Some(b'"') => self.string().map(Value::String),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(b'[') => {
                self.pos += 1;
                let mut items = Vec::new();
                self.skip_whitespace();
                if self.peek() == Some(b']') {
                    self.pos += 1;
                    return Ok(Value::Array(items));
                }
                loop {
                    self.skip_whitespace();
                    items.push(self.value(depth + 1)?);
                    self.skip_whitespace();
                    match self.peek() {
                        Some(b',') => self.pos += 1,
                        Some(b']') => {
                            self.pos += 1;
                            return Ok(Value::Array(items));
                        }
                        _ => return self.error("expected ',' or ']'"),
                    }
                }
            }
            Some(b'{') => {
                self.pos += 1;
                let mut members = Vec::new();
                self.skip_whitespace();
                if self.peek() == Some(b'}') {
                    self.pos += 1;
                    return Ok(Value::Object(members));
                }
                loop {
                    self.skip_whitespace();
                    if self.peek() != Some(b'"') {
                        return self.error("expected a member name");
                    }
                    let name = self.string()?;
                    self.skip_whitespace();
                    if self.peek() != Some(b':') {
                        return self.error("expected ':'");
                    }
                    self.pos += 1;
                    self.skip_whitespace();
                    let value = self.value(depth + 1)?;
                    members.push((name, value));
                    self.skip_whitespace();
                    match self.peek() {
                        Some(b',') => self.pos += 1,
                        Some(b'}') => {
                            self.pos += 1;
                            return Ok(Value::Object(members));
                        }
                        _ => return self.error("expected ',' or '}'"),
                    }
                }
            }
            Some(_) => self.error("unexpected character"),
        }
    }

    fn digits(&mut self) -> usize {
        let start = self.pos;
        while let Some(b'0'..=b'9') = self.peek() {
            self.pos += 1;
        }
        self.pos - start
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        match self.peek() {
            Some(b'0') => self.pos += 1,
            Some(b'1'..=b'9') => {
                self.digits();
            }
            _ => return self.error("expected a digit"),
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            if self.digits() == 0 {
                return self.error("expected a digit");
            }
        }
        if let Some(b'e' | b'E') = self.peek() {
            self.pos += 1;
            if let Some(b'+' | b'-') = self.peek() {
                self.pos += 1;
            }
            if self.digits() == 0 {
                return self.error("expected a digit");
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).expect("ascii");
        text.parse::<f64>().map(Value::Number).or_else(|_| self.error("bad number"))
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let Some(hex) = self.bytes.get(self.pos..self.pos + 4) else {
            return self.error("bad \\u escape");
        };
        let hex = std::str::from_utf8(hex).ok().filter(|h| h.bytes().all(|b| b.is_ascii_hexdigit()));
        let Some(code) = hex.and_then(|h| u32::from_str_radix(h, 16).ok()) else {
            return self.error("bad \\u escape");
        };
        self.pos += 4;
        Ok(code)
    }

    fn string(&mut self) -> Result<String, String> {
        self.pos += 1; // the opening quote
        let mut out = String::new();
        loop {
            let start = self.pos;
            while let Some(b) = self.peek() {
                if b == b'"' || b == b'\\' || b < 0x20 {
                    break;
                }
                self.pos += 1;
            }
            out.push_str(std::str::from_utf8(&self.bytes[start..self.pos]).expect("utf-8 input"));
            match self.peek() {
                None => return self.error("unterminated string"),
                Some(b'"') => {
                    self.pos += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    self.pos += 1;
                    let Some(escape) = self.peek() else {
                        return self.error("unterminated string");
                    };
                    self.pos += 1;
                    match escape {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let high = self.hex4()?;
                            let mut code = high;
                            if (0xD800..0xDC00).contains(&high) && self.bytes[self.pos..].starts_with(b"\\u") {
                                let save = self.pos;
                                self.pos += 2;
                                let low = self.hex4()?;
                                if (0xDC00..0xE000).contains(&low) {
                                    code = 0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00);
                                } else {
                                    self.pos = save;
                                }
                            }
                            // A lone surrogate has no character of its own.
                            out.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
                        }
                        _ => {
                            self.pos -= 1;
                            return self.error("bad escape");
                        }
                    }
                }
                Some(_) => return self.error("control character in string"),
            }
        }
    }
}
