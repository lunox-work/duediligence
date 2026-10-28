// The contract: spec.md, "Interface: a command", and the TypeScript types of each name's arguments and result in tests/public/boundary.ts.
mod json;
mod patch;

use std::io::{Read, Write};

use json::Value;
use patch::{ApplyResult, Files};

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1);
}

fn files_value(files: Files) -> Value {
    Value::Object(files.into_iter().map(|(path, text)| (path, Value::String(text))).collect())
}

fn apply_patch(args: Vec<Value>) -> Result<Value, String> {
    let mut args = args.into_iter();
    let files = match args.next() {
        Some(Value::Object(members)) => members
            .into_iter()
            .map(|(path, text)| match text {
                Value::String(text) => Ok((path, text)),
                _ => Err(format!("the text of {path} is not a string")),
            })
            .collect::<Result<Files, String>>()?,
        _ => return Err("applyPatch: files must be an object".to_string()),
    };
    let diff = match args.next() {
        Some(Value::String(diff)) => diff,
        _ => return Err("applyPatch: diff must be a string".to_string()),
    };
    let result = match patch::apply_patch(&files, &diff)? {
        ApplyResult::Applied { files, hunks } => Value::Object(vec![
            ("ok".to_string(), Value::Bool(true)),
            ("files".to_string(), files_value(files)),
            (
                "hunks".to_string(),
                Value::Array(
                    hunks
                        .into_iter()
                        .map(|h| {
                            Value::Object(vec![
                                ("path".to_string(), Value::String(h.path)),
                                ("hunk".to_string(), Value::Number(h.hunk as f64)),
                                ("offset".to_string(), Value::Number(h.offset as f64)),
                            ])
                        })
                        .collect(),
                ),
            ),
        ]),
        ApplyResult::Rejected { files, rejected } => Value::Object(vec![
            ("ok".to_string(), Value::Bool(false)),
            ("files".to_string(), files_value(files)),
            (
                "rejected".to_string(),
                Value::Array(
                    rejected
                        .into_iter()
                        .map(|r| {
                            Value::Object(vec![
                                ("path".to_string(), Value::String(r.path)),
                                ("hunk".to_string(), Value::Number(r.hunk as f64)),
                                ("reason".to_string(), Value::String(r.reason.as_str().to_string())),
                            ])
                        })
                        .collect(),
                ),
            ),
        ]),
    };
    Ok(result)
}

fn main() {
    let name = std::env::args().nth(1).unwrap_or_default();
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        fail(&format!("cannot read stdin: {e}"));
    }
    let args = match json::parse(&input) {
        Ok(Value::Array(args)) => args,
        Ok(_) => fail("the arguments must be a JSON array"),
        Err(e) => fail(&e),
    };
    let result = match name.as_str() {
        "applyPatch" => apply_patch(args),
        _ => fail(&format!("unknown name: {name}")),
    };
    match result {
        Ok(value) => {
            let mut out = String::new();
            json::write(&value, &mut out);
            let mut stdout = std::io::stdout();
            if stdout.write_all(out.as_bytes()).and_then(|_| stdout.flush()).is_err() {
                std::process::exit(1);
            }
        }
        Err(message) => fail(&message),
    }
}
