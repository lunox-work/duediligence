package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
)

const csvPath = "/requisitions.csv"

// serve routes every request: POST /requisitions.csv is the export, other
// methods on that path are 405, and every other path is 404.
func serve(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != csvPath {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "the body could not be read"})
		return
	}
	items, msg := parseBody(body)
	if msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}
	rows := make([]row, 0, len(items))
	for _, item := range items {
		rw, msg := validate(item)
		if msg != "" {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": msg, "id": item.id})
			return
		}
		rows = append(rows, rw)
	}
	out := renderCSV(rows)
	h := w.Header()
	h.Set("Content-Type", "text/csv; charset=utf-8")
	h.Set("Content-Disposition", `attachment; filename="requisitions.csv"`)
	h.Set("Content-Length", strconv.Itoa(len(out)))
	w.WriteHeader(http.StatusOK)
	w.Write(out)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	data, _ := json.Marshal(v)
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	h.Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(status)
	w.Write(data)
}

// item is a request element known to be an object with a string id.
type item struct {
	id     string
	fields map[string]json.RawMessage
}

// parseBody checks the body is a JSON array of objects that each have a
// string "id", and returns them; otherwise it returns the 400 message.
func parseBody(body []byte) ([]item, string) {
	if !json.Valid(body) {
		return nil, "the body is not JSON"
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return nil, "the body is not an array of requisitions"
	}
	var raw []json.RawMessage
	if err := json.Unmarshal(trimmed, &raw); err != nil {
		return nil, "the body is not an array of requisitions"
	}
	items := make([]item, 0, len(raw))
	for i, el := range raw {
		if kind(el) != '{' {
			return nil, "item " + strconv.Itoa(i) + " is not an object"
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(el, &fields); err != nil {
			return nil, "item " + strconv.Itoa(i) + " is not an object"
		}
		idRaw, ok := fields["id"]
		var id string
		if !ok || kind(idRaw) != '"' || json.Unmarshal(idRaw, &id) != nil {
			return nil, "item " + strconv.Itoa(i) + " has no string id"
		}
		items = append(items, item{id: id, fields: fields})
	}
	return items, ""
}

// kind is the first byte of a JSON value: '{', '[', '"', 'n', 't', 'f', or
// the start of a number.
func kind(v json.RawMessage) byte {
	v = bytes.TrimSpace(v)
	if len(v) == 0 {
		return 0
	}
	return v[0]
}
