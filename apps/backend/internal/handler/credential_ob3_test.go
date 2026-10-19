package handler_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/openbadges"
)

func TestOpenBadges3Credential(t *testing.T) {
	credRepo, _, _, _, credHandler, _, orgID, _, applicant := setupCredentialTestEnv(t)
	ctx := context.Background()
	signer := openbadges.NewSigner("ob3-test")
	credHandler.SetBadgeSigner(signer)

	badge, err := credHandler.AutoAwardCompletionBadge(ctx, applicant, "LIT Fellowship 2026", "https://fellowhire.com")
	if err != nil {
		t.Fatalf("failed to award badge: %v", err)
	}

	r := chi.NewRouter()
	r.Get("/api/v1/badges/credentials/{id}", credHandler.GetOpenBadgeCredential)
	r.Get("/api/v1/badges/issuers/{orgId}/did.json", credHandler.GetIssuerDIDDocument)
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		req.Host = "fellowhire.example"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	w := get(fmt.Sprintf("/api/v1/badges/credentials/%s", badge.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var cred map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &cred); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	issuer := cred["issuer"].(map[string]any)
	wantDID := fmt.Sprintf("did:web:fellowhire.example:api:v1:badges:issuers:%s", orgID)
	if issuer["id"] != wantDID || issuer["name"] != "KulKul Tech" {
		t.Fatalf("unexpected issuer %v", issuer)
	}
	subject := cred["credentialSubject"].(map[string]any)
	ident := subject["identifier"].([]any)[0].(map[string]any)
	sum := sha256.Sum256([]byte(applicant.Email + ident["salt"].(string)))
	if ident["identityHash"] != "sha256$"+hex.EncodeToString(sum[:]) || ident["identityType"] != "emailAddress" {
		t.Fatalf("recipient should be a salted email hash, got %v", ident)
	}
	if subject["achievement"].(map[string]any)["name"] != "LIT Fellowship 2026 Graduate" {
		t.Fatalf("unexpected achievement %v", subject["achievement"])
	}
	if err := openbadges.Verify(cred, signer.PublicKey()); err != nil {
		t.Fatalf("credential does not verify: %v", err)
	}

	// The issuer's did:web document publishes the same key
	w = get(fmt.Sprintf("/api/v1/badges/issuers/%s/did.json", orgID))
	var did map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &did)
	vm := did["verificationMethod"].([]any)[0].(map[string]any)
	if w.Code != http.StatusOK || did["id"] != wantDID || vm["publicKeyMultibase"] != signer.PublicKeyMultibase() {
		t.Fatalf("unexpected DID document %d %v", w.Code, did)
	}
	if cred["proof"].(map[string]any)["verificationMethod"] != wantDID+"#key-1" {
		t.Fatalf("proof should point at the issuer key")
	}

	// Revoked badges are gone
	if err := credRepo.RevokeBadge(ctx, badge.ID, time.Now()); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if w := get(fmt.Sprintf("/api/v1/badges/credentials/%s", badge.ID)); w.Code != http.StatusGone {
		t.Fatalf("expected 410 for a revoked badge, got %d", w.Code)
	}
}
