//! The requisitions CSV: reading the request body, refusing what cannot be written, writing the rows.

use crate::json::{self, Value};
use crate::time::{self, Instant};

pub enum Outcome {
    /// The CSV, byte order mark included.
    Csv(String),
    /// 400: the body is not a list of requisitions.
    BadRequest(String),
    /// 422: the first requisition, in the request's order, that cannot be written.
    Unprocessable { error: String, id: String },
}

const HEADER: &str = "Requisition ID,Title,Status,Openings,Filled,Created\r\n";

struct Row<'a> {
    id: &'a str,
    title: &'a str,
    status: &'static str,
    openings: f64,
    filled: f64,
    created: Instant,
}

pub fn export(body: &[u8]) -> Outcome {
    let Ok(text) = std::str::from_utf8(body) else {
        return Outcome::BadRequest("the body is not UTF-8 text".into());
    };
    let value = match json::parse(text) {
        Ok(value) => value,
        Err(e) => return Outcome::BadRequest(format!("the body is not JSON: {e}")),
    };
    let Value::Array(items) = &value else {
        return Outcome::BadRequest("the body is not an array of requisitions".into());
    };
    let mut ids = Vec::with_capacity(items.len());
    for (k, item) in items.iter().enumerate() {
        match (item, item.get("id")) {
            (Value::Object(_), Some(Value::String(id))) => ids.push(id.as_str()),
            _ => return Outcome::BadRequest(format!("item {k} is not an object with a string \"id\"")),
        }
    }
    let mut rows = Vec::with_capacity(items.len());
    for (item, id) in items.iter().zip(ids) {
        match row(item, id) {
            Ok(row) => rows.push(row),
            Err(error) => return Outcome::Unprocessable { error, id: id.to_string() },
        }
    }
    rows.sort_by(|a, b| a.created.cmp(&b.created).then_with(|| a.id.encode_utf16().cmp(b.id.encode_utf16())));
    let mut csv = String::from("\u{FEFF}");
    csv.push_str(HEADER);
    for r in &rows {
        csv.push_str(&field(r.id));
        csv.push(',');
        csv.push_str(&field(&defuse(r.title)));
        csv.push(',');
        csv.push_str(r.status);
        csv.push(',');
        csv.push_str(&whole(r.openings));
        csv.push(',');
        csv.push_str(&whole(r.filled));
        csv.push(',');
        csv.push_str(&r.created.utc_date());
        csv.push_str("\r\n");
    }
    Outcome::Csv(csv)
}

fn row<'a>(item: &'a Value, id: &'a str) -> Result<Row<'a>, String> {
    let status = match item.get("status") {
        Some(Value::String(s)) if s == "open" => "Open",
        Some(Value::String(s)) if s == "on_hold" => "On hold",
        Some(Value::String(s)) if s == "filled" => "Filled",
        Some(Value::String(s)) if s == "cancelled" => "Cancelled",
        _ => return Err("status is not one of \"open\", \"on_hold\", \"filled\" or \"cancelled\"".into()),
    };
    let title = match item.get("title") {
        None | Some(Value::Null) => "",
        Some(Value::String(s)) => s,
        Some(_) => return Err("title is neither a string nor null".into()),
    };
    let count = |name: &str| match item.get(name) {
        Some(Value::Number(n)) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Ok(*n + 0.0),
        _ => Err(format!("{name} is not a whole number of at least 0")),
    };
    let openings = count("openings")?;
    let filled = count("filled")?;
    if filled > openings {
        return Err("filled is greater than openings".into());
    }
    let created = match item.get("createdAt") {
        Some(Value::String(s)) => time::parse(s).map_err(String::from)?,
        _ => return Err("createdAt is not a string".into()),
    };
    Ok(Row { id, title, status, openings, filled, created })
}

/// A whole number as plain digits; f64's Display never uses an exponent.
fn whole(n: f64) -> String {
    format!("{n}")
}

/// A title that starts like a formula gets a single quote before it.
fn defuse(title: &str) -> std::borrow::Cow<'_, str> {
    match title.chars().next() {
        Some('=' | '+' | '-' | '@' | '\t' | '\r') => format!("'{title}").into(),
        _ => title.into(),
    }
}

/// A field, quoted when it holds a separator or starts or ends with a space.
fn field(text: &str) -> std::borrow::Cow<'_, str> {
    let needs = text.contains([',', '"', '\r', '\n']) || text.starts_with(' ') || text.ends_with(' ');
    if needs {
        format!("\"{}\"", text.replace('"', "\"\"")).into()
    } else {
        text.into()
    }
}
