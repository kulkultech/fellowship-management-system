package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

const maxBodyBytes = 1 << 20 // 1 MB

type ErrorResponse struct {
	Error string `json:"error"`
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, `{"error":"internal json error"}`, http.StatusInternalServerError)
	}
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, ErrorResponse{Error: msg})
}

func Decode(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		var syntaxErr *json.SyntaxError
		var unmarshalTypeErr *json.UnmarshalTypeError
		switch {
		case errors.As(err, &syntaxErr):
			return fmt.Errorf("malformed JSON at byte %d", syntaxErr.Offset)
		case errors.As(err, &unmarshalTypeErr):
			return fmt.Errorf("invalid type for field %q", unmarshalTypeErr.Field)
		case errors.Is(err, io.EOF):
			return errors.New("request body must not be empty")
		case err.Error() == "http: request body too large":
			return errors.New("request body exceeds 1MB limit")
		default:
			return err
		}
	}
	return nil
}
