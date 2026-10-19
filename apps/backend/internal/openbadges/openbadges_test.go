package openbadges

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func sampleCredential(did string) map[string]any {
	return map[string]any{
		"@context":  []any{ContextVCv2, ContextOBv3},
		"id":        "https://example.test/api/v1/badges/credentials/123",
		"type":      []any{"VerifiableCredential", "OpenBadgeCredential"},
		"name":      "Rust Fellowship Graduate",
		"issuer":    map[string]any{"id": did, "type": []any{"Profile"}, "name": "Acme Academy"},
		"validFrom": "2026-10-01T10:00:00Z",
		"credentialSubject": map[string]any{
			"type": []any{"AchievementSubject"},
			"identifier": []any{map[string]any{
				"type": "IdentityObject", "identityHash": "sha256$abc", "identityType": "emailAddress", "hashed": true, "salt": "s",
			}},
			"achievement": map[string]any{
				"id": "https://example.test/achievements/1", "type": []any{"Achievement"}, "name": "Graduate",
				"description": "Completed the cohort", "criteria": map[string]any{"narrative": "Did the work"},
			},
		},
	}
}

func TestSignAndVerify(t *testing.T) {
	s := NewSigner("test-secret")
	did := DIDWeb("example.test", "api", "v1", "badges", "issuers", "org-1")
	if did != "did:web:example.test:api:v1:badges:issuers:org-1" {
		t.Fatalf("unexpected did %s", did)
	}
	if !strings.HasPrefix(s.PublicKeyMultibase(), "z6Mk") {
		t.Fatalf("expected an Ed25519 Multikey (z6Mk...), got %s", s.PublicKeyMultibase())
	}

	signed, err := s.Sign(sampleCredential(did), KeyID(did), time.Date(2026, 10, 1, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if err := Verify(signed, s.PublicKey()); err != nil {
		t.Fatalf("verify: %v", err)
	}

	// Same input, same signature (Ed25519 is deterministic), so the hosted credential is stable
	again, _ := s.Sign(sampleCredential(did), KeyID(did), time.Date(2026, 10, 1, 10, 0, 0, 0, time.UTC))
	if again["proof"].(map[string]any)["proofValue"] != signed["proof"].(map[string]any)["proofValue"] {
		t.Fatalf("expected a stable signature")
	}

	// Any change breaks the proof
	signed["name"] = "Something Else"
	if err := Verify(signed, s.PublicKey()); err == nil {
		t.Fatalf("expected a tampered credential to fail")
	}

	// Hand the signed credential to an external verifier when asked (see scratchpad cross-check)
	if out := os.Getenv("OB3_DUMP"); out != "" {
		signed["name"] = "Rust Fellowship Graduate"
		body, _ := json.MarshalIndent(map[string]any{"credential": signed, "did": s.DIDDocument(did)}, "", "  ")
		_ = os.WriteFile(out, body, 0o644)
	}
}
