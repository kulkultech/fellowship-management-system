package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/openbadges"
	"github.com/kulkul/backend/internal/repository"
)

// SetBadgeSigner sets the key used to sign Open Badges 3.0 credentials.
func (h *CredentialHandler) SetBadgeSigner(s *openbadges.Signer) { h.badgeSigner = s }

func (h *CredentialHandler) signer() *openbadges.Signer {
	if h.badgeSigner == nil {
		h.badgeSigner = openbadges.NewSigner("development-only")
	}
	return h.badgeSigner
}

// orgIssuerDID is the did:web of an organization's issuer, resolving to
// <api>/api/v1/badges/issuers/<orgId>/did.json.
func orgIssuerDID(r *http.Request, orgID uuid.UUID) string {
	return openbadges.DIDWeb(r.Host, "api", "v1", "badges", "issuers", orgID.String())
}

func credentialURL(base string, badgeID uuid.UUID) string {
	return fmt.Sprintf("%s/api/v1/badges/credentials/%s", base, badgeID)
}

// buildOpenBadgeCredential builds and signs the Open Badges 3.0 credential of a badge.
func (h *CredentialHandler) buildOpenBadgeCredential(r *http.Request, badge *model.Badge) (map[string]any, error) {
	base := apiBaseURL(r)
	class, err := h.programBadgeClass(r.Context(), base, badge.ProgramID, badge.BadgeType)
	if err != nil {
		return nil, err
	}
	org, err := h.orgRepo.GetByID(r.Context(), badge.OrganizationID)
	if err != nil || org == nil {
		return nil, errors.New("issuer not found")
	}
	email := org.ContactEmail
	if email == "" {
		email = org.AdminEmail
	}
	if email == "" {
		email = fallbackIssuerEmail
	}

	did := orgIssuerDID(r, org.ID)
	salt := strings.ReplaceAll(badge.ID.String(), "-", "")
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(badge.RecipientEmail)) + salt))
	issued := badge.IssuedAt.UTC().Truncate(time.Second)

	achievement := map[string]any{
		"id":              class.ID,
		"type":            []string{"Achievement"},
		"achievementType": "Badge",
		"name":            class.Name,
		"description":     class.Description,
		"criteria":        map[string]any{"narrative": class.Criteria.Narrative},
		"image":           map[string]any{"id": class.Image, "type": "Image"},
	}
	if len(class.Tags) > 0 {
		achievement["tag"] = class.Tags
	}

	credential := map[string]any{
		"@context":    []string{openbadges.ContextVCv2, openbadges.ContextOBv3},
		"id":          credentialURL(base, badge.ID),
		"type":        []string{"VerifiableCredential", "OpenBadgeCredential"},
		"name":        class.Name,
		"description": class.Description,
		"image":       map[string]any{"id": class.Image, "type": "Image"},
		"issuer": map[string]any{
			"id":          did,
			"type":        []string{"Profile"},
			"name":        org.Name,
			"url":         h.frontendURL,
			"email":       email,
			"description": fmt.Sprintf("%s issues fellowship credentials through FellowHire.", org.Name),
		},
		"validFrom": issued.Format(time.RFC3339),
		"credentialSubject": map[string]any{
			"type": []string{"AchievementSubject"},
			"identifier": []map[string]any{{
				"type":         "IdentityObject",
				"identityHash": "sha256$" + hex.EncodeToString(sum[:]),
				"identityType": "emailAddress",
				"hashed":       true,
				"salt":         salt,
			}},
			"achievement": achievement,
		},
		"evidence": []map[string]any{{
			"id":   fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, badge.ID),
			"type": []string{"Evidence"},
			"name": "Public verification page",
		}},
	}
	return h.signer().Sign(credential, openbadges.KeyID(did), issued)
}

// GetOpenBadgeCredential handles GET /api/v1/badges/credentials/{id}: the badge as a signed
// Open Badges 3.0 credential. Add ?download=1 to save it as a file.
func (h *CredentialHandler) GetOpenBadgeCredential(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(strings.TrimSuffix(chi.URLParam(r, "id"), ".json"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid credential id")
		return
	}
	badge, err := h.credentialRepo.GetBadgeByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrBadgeNotFound) {
			httpx.Error(w, http.StatusNotFound, "credential not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load credential")
		return
	}
	if badge.RevokedAt != nil {
		writeJSONLD(w, http.StatusGone, map[string]any{"id": credentialURL(apiBaseURL(r), badge.ID), "revoked": true})
		return
	}
	credential, err := h.buildOpenBadgeCredential(r, badge)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to build credential: "+err.Error())
		return
	}
	if r.URL.Query().Get("download") != "" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="open-badge-%s.json"`, badge.ID))
	}
	writeJSONLD(w, http.StatusOK, credential)
}

// GetIssuerDIDDocument handles GET /api/v1/badges/issuers/{orgId}/did.json, the did:web document
// that publishes the key Open Badges 3.0 credentials of this issuer are signed with.
func (h *CredentialHandler) GetIssuerDIDDocument(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "orgId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid issuer id")
		return
	}
	if org, err := h.orgRepo.GetByID(r.Context(), orgID); err != nil || org == nil {
		httpx.Error(w, http.StatusNotFound, "issuer not found")
		return
	}
	w.Header().Set("Content-Type", "application/did+json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	writeJSONBody(w, h.signer().DIDDocument(orgIssuerDID(r, orgID)))
}
