package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestSessionLookupErrorOnlyExpiresMissingSessions(t *testing.T) {
	outage := errors.New("database unavailable")
	wrappedOutage := fmt.Errorf("query session: %w", outage)
	for _, test := range []struct {
		name string
		err  error
		code string
	}{
		{"missing", pgx.ErrNoRows, "session_expired"},
		{"wrapped missing", fmt.Errorf("query session: %w", pgx.ErrNoRows), "session_expired"},
		{"outage", outage, ""},
		{"wrapped outage", wrappedOutage, ""},
		{"success", nil, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := sessionLookupError(test.err)
			if test.code == "" {
				if got != test.err {
					t.Fatalf("lookup error identity changed: got %v, want original %v", got, test.err)
				}
				return
			}
			if got != apiError(test.code) {
				t.Fatalf("got %v, want %s", got, test.code)
			}
		})
	}
}

func TestSessionLookupHTTPStatus(t *testing.T) {
	for _, test := range []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"expired", pgx.ErrNoRows, http.StatusUnauthorized, "session_expired"},
		{"database failure", fmt.Errorf("query session: %w", errors.New("connection lost")), http.StatusInternalServerError, "server_error"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			fail(response, sessionLookupError(test.err))
			var body struct {
				Error string `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if response.Code != test.status || body.Error != test.code {
				t.Fatalf("got %d %q, want %d %q", response.Code, body.Error, test.status, test.code)
			}
		})
	}
}

func TestDecodeJSONRequiresOneKnownObjectWithinLimit(t *testing.T) {
	const object = `{"handle":"visitante"}`
	for _, test := range []struct {
		name string
		body string
		code apiError
	}{
		{"valid object", object, ""},
		{"valid whitespace", " \n" + object + "\t\r\n", ""},
		{"exact 16 KiB", object + strings.Repeat(" ", (16<<10)-len(object)), ""},
		{"one byte oversized whitespace", object + strings.Repeat(" ", (16<<10)+1-len(object)), "payload_too_large"},
		{"oversized value", `{"handle":"` + strings.Repeat("a", 32<<10) + `"}`, "payload_too_large"},
		{"unknown field", `{"handle":"visitante","role":"admin"}`, "invalid_json"},
		{"second object", object + object, "invalid_json"},
		{"second scalar", object + " true", "invalid_json"},
		{"trailing malformed input", object + " !", "invalid_json"},
		{"malformed object", `{"handle":`, "invalid_json"},
		{"empty", "", "invalid_json"},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(test.body))
			body := &countingRequestBody{Reader: request.Body}
			request.Body = body
			var input struct {
				Handle string `json:"handle"`
			}
			err := decodeJSON(request, &input)
			if test.code == "" {
				if err != nil || input.Handle != "visitante" {
					t.Fatalf("got input %#v and error %v", input, err)
				}
			} else if err != test.code {
				t.Fatalf("got %v, want %s", err, test.code)
			}
			if body.bytesRead > (16<<10)+1 || !body.closed {
				t.Fatalf("body read was not bounded and closed: bytes=%d closed=%t", body.bytesRead, body.closed)
			}
		})
	}
}

func TestDecodeJSONRejectsReadFailure(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	body := &countingRequestBody{Reader: failingBodyReader{}}
	request.Body = body
	if err := decodeJSON(request, new(any)); err != apiError("invalid_json") || !body.closed {
		t.Fatalf("got %v, closed=%t", err, body.closed)
	}
}

func TestOversizedJSONResponseIs413(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{}`+strings.Repeat(" ", 16<<10)))
	response := httptest.NewRecorder()
	fail(response, decodeJSON(request, new(any)))
	if response.Code != http.StatusRequestEntityTooLarge || response.Body.String() != "{\"error\":\"payload_too_large\"}\n" {
		t.Fatalf("got %d %s", response.Code, response.Body.String())
	}
}

type countingRequestBody struct {
	io.Reader
	bytesRead int
	closed    bool
}

func (body *countingRequestBody) Read(buffer []byte) (int, error) {
	n, err := body.Reader.Read(buffer)
	body.bytesRead += n
	return n, err
}

func (body *countingRequestBody) Close() error {
	body.closed = true
	if closer, ok := body.Reader.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

type failingBodyReader struct{}

func (failingBodyReader) Read([]byte) (int, error) {
	return 0, errors.New("body interrupted")
}
