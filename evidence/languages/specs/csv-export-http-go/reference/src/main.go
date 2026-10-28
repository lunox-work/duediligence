// The contract: spec.md, and the TypeScript types of the JSON bodies in tests/public/contract.ts.
package main

import (
	"net/http"
	"os"
)

func main() {
	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	http.ListenAndServe(host+":"+os.Getenv("PORT"), http.HandlerFunc(serve))
}
