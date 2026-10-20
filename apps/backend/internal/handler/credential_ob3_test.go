package handler_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
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
	r.Get("/api/v1/badges/credentials/{id}/badge.svg", credHandler.GetBakedBadgeSVG)
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

	// Baked SVG (for Credly and image-based wallets): valid XML with the signed credential inside
	w = get(fmt.Sprintf("/api/v1/badges/credentials/%s/badge.svg", badge.ID))
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/svg+xml" {
		t.Fatalf("expected an SVG, got %d %s", w.Code, w.Header().Get("Content-Type"))
	}
	var baked struct {
		XMLName    xml.Name `xml:"svg"`
		Credential string   `xml:"https://purl.imsglobal.org/ob/v3p0 credential"`
	}
	if err := xml.Unmarshal(w.Body.Bytes(), &baked); err != nil {
		t.Fatalf("baked SVG is not valid XML: %v", err)
	}
	var embedded map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(baked.Credential)), &embedded); err != nil {
		t.Fatalf("embedded credential is not JSON: %v", err)
	}
	if err := openbadges.Verify(embedded, signer.PublicKey()); err != nil {
		t.Fatalf("embedded credential does not verify: %v", err)
	}
	w = get(fmt.Sprintf("/api/v1/badges/credentials/%s/badge.svg?version=2", badge.ID))
	var baked2 struct {
		Assertion struct {
			Verify string `xml:"verify,attr"`
			Body   string `xml:",chardata"`
		} `xml:"http://openbadges.org assertion"`
	}
	if err := xml.Unmarshal(w.Body.Bytes(), &baked2); err != nil || !strings.HasSuffix(baked2.Assertion.Verify, fmt.Sprintf("/api/v1/badges/assertions/%s.json", badge.ID)) {
		t.Fatalf("expected a 2.0 baked assertion, got %q (%v)", baked2.Assertion.Verify, err)
	}
	var assertion map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(baked2.Assertion.Body)), &assertion); err != nil || assertion["type"] != "Assertion" {
		t.Fatalf("expected the full 2.0 assertion inside the image, got %q", baked2.Assertion.Body)
	}

	// Revoked badges are gone
	if err := credRepo.RevokeBadge(ctx, badge.ID, time.Now()); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if w := get(fmt.Sprintf("/api/v1/badges/credentials/%s", badge.ID)); w.Code != http.StatusGone {
		t.Fatalf("expected 410 for a revoked badge, got %d", w.Code)
	}
}
