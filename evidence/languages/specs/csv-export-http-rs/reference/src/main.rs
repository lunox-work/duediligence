// The contract: spec.md, and the TypeScript types of the JSON bodies in tests/public/contract.ts.
mod export;
mod json;
mod time;

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

use export::Outcome;

fn main() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("PORT").expect("PORT");
    let listener = TcpListener::bind(format!("{host}:{port}")).expect("bind");
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        std::thread::spawn(move || serve(stream));
    }
}

struct Request {
    method: String,
    path: String,
    body: Vec<u8>,
}

/// Reads one request: its request line, its headers, and its body (by Content-Length or chunked).
fn read_request(reader: &mut impl BufRead) -> Option<Request> {
    let mut line = String::new();
    if reader.read_line(&mut line).ok()? == 0 {
        return None;
    }
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?;
    let path = target.split(['?', '#']).next().unwrap_or("").to_string();
    let mut length = 0;
    let mut chunked = false;
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => return None,
            Ok(_) if line == "\r\n" || line == "\n" => break,
            Ok(_) => {
                if let Some((name, value)) = line.split_once(':') {
                    let value = value.trim();
                    if name.eq_ignore_ascii_case("content-length") {
                        length = value.parse().ok()?;
                    } else if name.eq_ignore_ascii_case("transfer-encoding") {
                        chunked = value.to_ascii_lowercase().contains("chunked");
                    }
                }
            }
        }
    }
    let mut body = Vec::new();
    if chunked {
        loop {
            let mut size = String::new();
            reader.read_line(&mut size).ok()?;
            let size = usize::from_str_radix(size.trim().split(';').next()?.trim(), 16).ok()?;
            if size == 0 {
                // The trailer section, up to its blank line.
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).ok()? == 0 || line == "\r\n" || line == "\n" {
                        break;
                    }
                }
                break;
            }
            let start = body.len();
            body.resize(start + size, 0);
            reader.read_exact(&mut body[start..]).ok()?;
            let mut end = String::new();
            reader.read_line(&mut end).ok()?;
        }
    } else {
        body.resize(length, 0);
        reader.read_exact(&mut body).ok()?;
    }
    Some(Request { method, path, body })
}

fn serve(mut stream: TcpStream) {
    let Ok(clone) = stream.try_clone() else { return };
    let mut reader = BufReader::new(clone);
    let Some(request) = read_request(&mut reader) else { return };
    let (head, body) = respond(&request);
    let _ = stream.write_all(&head);
    // A HEAD answer has the headers of the answer to a GET, without its body.
    if request.method != "HEAD" {
        let _ = stream.write_all(body.as_bytes());
    }
    let _ = stream.flush();
}

fn respond(request: &Request) -> (Vec<u8>, String) {
    if request.path != "/requisitions.csv" {
        return answer("404 Not Found", &[("Content-Type", JSON)], &error_body("not found", None));
    }
    if request.method != "POST" {
        let headers = [("Allow", "POST"), ("Content-Type", JSON)];
        return answer("405 Method Not Allowed", &headers, &error_body("method not allowed", None));
    }
    match export::export(&request.body) {
        Outcome::Csv(csv) => answer(
            "200 OK",
            &[
                ("Content-Type", "text/csv; charset=utf-8"),
                ("Content-Disposition", "attachment; filename=\"requisitions.csv\""),
            ],
            &csv,
        ),
        Outcome::BadRequest(error) => answer("400 Bad Request", &[("Content-Type", JSON)], &error_body(&error, None)),
        Outcome::Unprocessable { error, id } => {
            answer("422 Unprocessable Entity", &[("Content-Type", JSON)], &error_body(&error, Some(&id)))
        }
    }
}

const JSON: &str = "application/json; charset=utf-8";

fn error_body(error: &str, id: Option<&str>) -> String {
    match id {
        Some(id) => format!("{{\"error\":{},\"id\":{}}}", json::quote(error), json::quote(id)),
        None => format!("{{\"error\":{}}}", json::quote(error)),
    }
}

fn head(status: &str, headers: &[(&str, &str)], length: usize) -> Vec<u8> {
    let mut out = format!("HTTP/1.1 {status}\r\n");
    for (name, value) in headers {
        out.push_str(&format!("{name}: {value}\r\n"));
    }
    out.push_str(&format!("Content-Length: {length}\r\nConnection: close\r\n\r\n"));
    out.into_bytes()
}

fn answer(status: &str, headers: &[(&str, &str)], body: &str) -> (Vec<u8>, String) {
    (head(status, headers, body.len()), body.to_string())
}
