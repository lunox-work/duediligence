//! A minimal JSON reader and writer, enough for the command's arguments and results.

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Value>),
    /// Members in their order in the text.
    Object(Vec<(String, Value)>),
}

pub fn parse(text: &str) -> Result<Value, String> {
    let mut parser = Parser { chars: text.chars().collect(), pos: 0 };
    parser.skip_ws();
    let value = parser.value()?;
    parser.skip_ws();
    if parser.pos != parser.chars.len() {
        return Err("invalid JSON: trailing characters".to_string());
    }
    Ok(value)
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn next(&mut self) -> Result<char, String> {
        let c = self.peek().ok_or("invalid JSON: unexpected end")?;
        self.pos += 1;
        Ok(c)
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(' ' | '\t' | '\n' | '\r')) {
            self.pos += 1;
        }
    }

    fn expect_word(&mut self, word: &str, value: Value) -> Result<Value, String> {
        for expected in word.chars() {
            if self.next()? != expected {
                return Err(format!("invalid JSON: expected {word}"));
            }
        }
        Ok(value)
    }

    fn value(&mut self) -> Result<Value, String> {
        match self.peek().ok_or("invalid JSON: unexpected end")? {
            '{' => self.object(),
            '[' => self.array(),
            '"' => Ok(Value::String(self.string()?)),
            't' => self.expect_word("true", Value::Bool(true)),
            'f' => self.expect_word("false", Value::Bool(false)),
            'n' => self.expect_word("null", Value::Null),
            _ => self.number(),
        }
    }

    fn object(&mut self) -> Result<Value, String> {
        self.pos += 1;
        let mut members = Vec::new();
        self.skip_ws();
        if self.peek() == Some('}') {
            self.pos += 1;
            return Ok(Value::Object(members));
        }
        loop {
            self.skip_ws();
            if self.peek() != Some('"') {
                return Err("invalid JSON: expected a key".to_string());
            }
            let key = self.string()?;
            self.skip_ws();
            if self.next()? != ':' {
                return Err("invalid JSON: expected ':'".to_string());
            }
            self.skip_ws();
            let value = self.value()?;
            members.push((key, value));
            self.skip_ws();
            match self.next()? {
                ',' => continue,
                '}' => return Ok(Value::Object(members)),
                _ => return Err("invalid JSON: expected ',' or '}'".to_string()),
            }
        }
    }

    fn array(&mut self) -> Result<Value, String> {
        self.pos += 1;
        let mut items = Vec::new();
        self.skip_ws();
        if self.peek() == Some(']') {
            self.pos += 1;
            return Ok(Value::Array(items));
        }
        loop {
            self.skip_ws();
            items.push(self.value()?);
            self.skip_ws();
            match self.next()? {
                ',' => continue,
                ']' => return Ok(Value::Array(items)),
                _ => return Err("invalid JSON: expected ',' or ']'".to_string()),
            }
        }
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let mut code = 0;
        for _ in 0..4 {
            let digit = self.next()?.to_digit(16).ok_or("invalid JSON: bad \\u escape")?;
            code = code * 16 + digit;
        }
        Ok(code)
    }

    fn string(&mut self) -> Result<String, String> {
        self.pos += 1;
        let mut out = String::new();
        loop {
            match self.next()? {
                '"' => return Ok(out),
                '\\' => match self.next()? {
                    '"' => out.push('"'),
                    '\\' => out.push('\\'),
                    '/' => out.push('/'),
                    'b' => out.push('\u{8}'),
                    'f' => out.push('\u{c}'),
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    'u' => {
                        let mut code = self.hex4()?;
                        if (0xD800..0xDC00).contains(&code)
                            && self.chars.get(self.pos) == Some(&'\\')
                            && self.chars.get(self.pos + 1) == Some(&'u')
                        {
                            let save = self.pos;
                            self.pos += 2;
                            let low = self.hex4()?;
                            if (0xDC00..0xE000).contains(&low) {
                                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                            } else {
                                self.pos = save;
                            }
                        }
                        out.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
                    }
                    _ => return Err("invalid JSON: bad escape".to_string()),
                },
                c => out.push(c),
            }
        }
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.pos;
        while matches!(self.peek(), Some('-' | '+' | '.' | 'e' | 'E' | '0'..='9')) {
            self.pos += 1;
        }
        let text: String = self.chars[start..self.pos].iter().collect();
        text.parse::<f64>()
            .map(Value::Number)
            .map_err(|_| format!("invalid JSON: unexpected '{text}'"))
    }
}

pub fn write(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                out.push_str(&format!("{}", *n as i64));
            } else {
                out.push_str(&format!("{n}"));
            }
        }
        Value::String(s) => write_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(item, out);
            }
            out.push(']');
        }
        Value::Object(members) => {
            out.push('{');
            for (i, (key, item)) in members.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(key, out);
                out.push(':');
                write(item, out);
            }
            out.push('}');
        }
    }
}

fn write_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
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
}
