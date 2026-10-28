// The contract: spec.md, and the TypeScript types of the JSON bodies in tests/public/contract.ts.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;

fn main() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("PORT").expect("PORT");
    let listener = TcpListener::bind(format!("{host}:{port}")).expect("bind");
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let mut reader = BufReader::new(stream.try_clone().expect("clone"));
        let mut length = 0;
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) if line == "\r\n" => break,
                Ok(_) => {
                    if let Some((name, value)) = line.split_once(':') {
                        if name.eq_ignore_ascii_case("content-length") {
                            length = value.trim().parse().unwrap_or(0);
                        }
                    }
                }
            }
        }
        let mut body = vec![0; length];
        let _ = reader.read_exact(&mut body);
        let _ = stream.write_all(b"HTTP/1.1 501 Not Implemented\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
    }
}
