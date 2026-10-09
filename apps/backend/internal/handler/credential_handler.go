package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type CredentialHandler struct {
	credentialRepo *repository.CredentialRepository
	applicantRepo  *repository.ApplicantRepository
	programRepo    *repository.ProgramRepository
	orgRepo        *repository.OrgRepository
	trackRepo      *repository.TrackRepository
	userRepo       *repository.UserRepository
	emailSvc       email.Service
	frontendURL    string
}

func NewCredentialHandler(
	credentialRepo *repository.CredentialRepository,
	applicantRepo *repository.ApplicantRepository,
	programRepo *repository.ProgramRepository,
	orgRepo *repository.OrgRepository,
	trackRepo *repository.TrackRepository,
	userRepo *repository.UserRepository,
	emailSvc email.Service,
	frontendURL string,
) *CredentialHandler {
	return &CredentialHandler{
		credentialRepo: credentialRepo,
		applicantRepo:  applicantRepo,
		programRepo:    programRepo,
		orgRepo:        orgRepo,
		trackRepo:      trackRepo,
		userRepo:       userRepo,
		emailSvc:       emailSvc,
		frontendURL:    strings.TrimRight(frontendURL, "/"),
	}
}

// ---------------------------------------------------------------------
// PUBLIC OPEN BADGES v2.0 SPECIFICATION ENDPOINTS
// ---------------------------------------------------------------------

// fallbackIssuerEmail is used when an organization has no contact or admin email.
const fallbackIssuerEmail = "support@fellowhire.kul.to"

// apiBaseURL returns the public origin of the API for building Open Badges IRIs.
func apiBaseURL(r *http.Request) string {
	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s", scheme, r.Host)
}

// badgeClassSlug maps a badge type to its BadgeClass path segment.
func badgeClassSlug(t model.BadgeType) string {
	if t == model.BadgeTypeCompletion {
		return "graduate"
	}
	return "member"
}

// programBadgeClassURL is the BadgeClass for a program's member or graduate badge.
func programBadgeClassURL(base string, programID uuid.UUID, t model.BadgeType) string {
	return fmt.Sprintf("%s/api/v1/badges/classes/%s/%s.json", base, programID, badgeClassSlug(t))
}

// orgIssuerURL is the issuer Profile of the organization that runs the program.
func orgIssuerURL(base string, orgID uuid.UUID) string {
	return fmt.Sprintf("%s/api/v1/badges/issuers/%s.json", base, orgID)
}

func assertionURL(base string, badgeID uuid.UUID) string {
	return fmt.Sprintf("%s/api/v1/badges/assertions/%s.json", base, badgeID)
}

// hashedEmailRecipient hides the recipient email as recommended by Open Badges 2.0:
// identity = "sha256$" + hex(sha256(lowercase(email) + salt)).
func hashedEmailRecipient(email, salt string) model.OpenBadgeRecipient {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email)) + salt))
	return model.OpenBadgeRecipient{
		Type:     "email",
		Hashed:   true,
		Identity: "sha256$" + hex.EncodeToString(sum[:]),
		Salt:     salt,
	}
}

func writeJSONLD(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/ld+json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// GetBadgeAssertionJSON handles GET /api/v1/badges/assertions/{id}.json
func (h *CredentialHandler) GetBadgeAssertionJSON(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	// Strip .json suffix if client appended it
	idStr = strings.TrimSuffix(idStr, ".json")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid badge assertion id")
		return
	}

	badge, err := h.credentialRepo.GetBadgeByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrBadgeNotFound) {
			httpx.Error(w, http.StatusNotFound, "badge assertion not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to get badge assertion")
		return
	}

	baseURL := apiBaseURL(r)

	// Open Badges 2.0: a revoked hosted assertion returns 410 Gone with revoked: true
	if badge.RevokedAt != nil {
		writeJSONLD(w, http.StatusGone, model.OpenBadgeRevokedAssertion{
			Context: "https://w3id.org/openbadges/v2",
			ID:      assertionURL(baseURL, badge.ID),
			Type:    "Assertion",
			Revoked: true,
		})
		return
	}

	writeJSONLD(w, http.StatusOK, model.OpenBadgeAssertion{
		Context:   "https://w3id.org/openbadges/v2",
		ID:        assertionURL(baseURL, badge.ID),
		Type:      "Assertion",
		Recipient: hashedEmailRecipient(badge.RecipientEmail, strings.ReplaceAll(badge.ID.String(), "-", "")),
		Badge:     programBadgeClassURL(baseURL, badge.ProgramID, badge.BadgeType),
		Verification: model.OpenBadgeVerification{
			Type: "hosted",
		},
		IssuedOn:  badge.IssuedAt.UTC().Format(time.RFC3339),
		Evidence:  fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, badge.ID.String()),
		Narrative: badge.Description,
	})
}

// GetProgramBadgeClassJSON handles GET /api/v1/badges/classes/{programId}/{type}.json
func (h *CredentialHandler) GetProgramBadgeClassJSON(w http.ResponseWriter, r *http.Request) {
	programID, err := uuid.Parse(chi.URLParam(r, "programId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}
	badgeType := model.BadgeTypeMember
	switch strings.TrimSuffix(chi.URLParam(r, "type"), ".json") {
	case "member":
	case "graduate":
		badgeType = model.BadgeTypeCompletion
	default:
		httpx.Error(w, http.StatusNotFound, "badge class not found")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), programID)
	if err != nil || program == nil {
		httpx.Error(w, http.StatusNotFound, "badge class not found")
		return
	}
	orgName := "the fellowship organization"
	if org, err := h.orgRepo.GetByID(r.Context(), program.OrganizationID); err == nil && org != nil {
		orgName = org.Name
	}

	baseURL := apiBaseURL(r)
	class := model.OpenBadgeClass{
		Context: "https://w3id.org/openbadges/v2",
		ID:      programBadgeClassURL(baseURL, program.ID, badgeType),
		Type:    "BadgeClass",
		Issuer:  orgIssuerURL(baseURL, program.OrganizationID),
	}
	if badgeType == model.BadgeTypeCompletion {
		class.Name = fmt.Sprintf("%s Graduate", program.Name)
		class.Description = fmt.Sprintf("Awarded by %s to fellows who completed the %s cohort, including its live sessions, assignments, and final milestones.", orgName, program.Name)
		class.Image = fmt.Sprintf("%s/api/v1/badges/images/completion.svg", baseURL)
		class.Criteria = model.OpenBadgeCriteria{
			Narrative: "Attended the scheduled cohort sessions, submitted assignments that met the grading standards, and completed the final program milestones.",
		}
		class.Tags = []string{"fellowship", "graduate", "certificate"}
	} else {
		class.Name = fmt.Sprintf("%s Cohort Member", program.Name)
		class.Description = fmt.Sprintf("Awarded by %s to fellows admitted into the %s cohort after its selection process.", orgName, program.Name)
		class.Image = fmt.Sprintf("%s/api/v1/badges/images/member.svg", baseURL)
		class.Criteria = model.OpenBadgeCriteria{
			Narrative: "Passed the program's application screening and assessments and was admitted into the live fellowship cohort.",
		}
		class.Tags = []string{"fellowship", "member", "cohort"}
	}
	writeJSONLD(w, http.StatusOK, class)
}

// GetOrgIssuerJSON handles GET /api/v1/badges/issuers/{orgId}.json
func (h *CredentialHandler) GetOrgIssuerJSON(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(strings.TrimSuffix(chi.URLParam(r, "orgId"), ".json"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid issuer id")
		return
	}
	org, err := h.orgRepo.GetByID(r.Context(), orgID)
	if err != nil || org == nil {
		httpx.Error(w, http.StatusNotFound, "issuer not found")
		return
	}

	email := org.ContactEmail
	if email == "" {
		email = org.AdminEmail
	}
	if email == "" {
		email = fallbackIssuerEmail
	}
	writeJSONLD(w, http.StatusOK, model.OpenBadgeIssuer{
		Context:     "https://w3id.org/openbadges/v2",
		ID:          orgIssuerURL(apiBaseURL(r), org.ID),
		Type:        "Issuer",
		Name:        org.Name,
		URL:         h.frontendURL,
		Email:       email,
		Description: fmt.Sprintf("%s issues fellowship credentials through FellowHire.", org.Name),
	})
}

// GetBadgeClassJSON handles GET /api/v1/badges/classes/{slug}.json.
// Legacy platform-wide classes, kept so previously shared links keep resolving.
func (h *CredentialHandler) GetBadgeClassJSON(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	slug = strings.TrimSuffix(slug, ".json")
	baseURL := apiBaseURL(r)

	var class model.OpenBadgeClass
	if slug == "completion" || slug == "program-graduate" || slug == "graduate" {
		class = model.OpenBadgeClass{
			Context:     "https://w3id.org/openbadges/v2",
			ID:          fmt.Sprintf("%s/api/v1/badges/classes/program-graduate.json", baseURL),
			Type:        "BadgeClass",
			Name:        "Fellowship Program Graduate",
			Description: "Recognizes the successful completion of all cohort coursework, mentor-led live sessions, technical milestones, and practical projects in the fellowship program.",
			Image:       fmt.Sprintf("%s/api/v1/badges/images/completion.svg", baseURL),
			Criteria: model.OpenBadgeCriteria{
				Narrative: "Fellow attended scheduled cohort sessions, submitted assignments meeting grading standards, and completed final program milestones.",
			},
			Issuer: fmt.Sprintf("%s/api/v1/badges/issuer.json", baseURL),
			Tags:   []string{"fellowship", "graduate", "certificate", "engineering", "fellowhire"},
		}
	} else {
		class = model.OpenBadgeClass{
			Context:     "https://w3id.org/openbadges/v2",
			ID:          fmt.Sprintf("%s/api/v1/badges/classes/cohort-member.json", baseURL),
			Type:        "BadgeClass",
			Name:        "Fellowship Cohort Member",
			Description: "Awarded to fellows who passed rigorous competitive assessments and AI interviews, earning official admission into the live fellowship cohort.",
			Image:       fmt.Sprintf("%s/api/v1/badges/images/member.svg", baseURL),
			Criteria: model.OpenBadgeCriteria{
				Narrative: "Candidate cleared logic assessments, technical evaluations, AI interview screening, and was officially admitted to the live fellowship cohort.",
			},
			Issuer: fmt.Sprintf("%s/api/v1/badges/issuer.json", baseURL),
			Tags:   []string{"fellowship", "member", "cohort", "admitted", "fellowhire"},
		}
	}
	writeJSONLD(w, http.StatusOK, class)
}

// GetBadgeIssuerJSON handles GET /api/v1/badges/issuer.json.
// Legacy platform-wide issuer, kept so previously shared links keep resolving.
func (h *CredentialHandler) GetBadgeIssuerJSON(w http.ResponseWriter, r *http.Request) {
	writeJSONLD(w, http.StatusOK, model.OpenBadgeIssuer{
		Context:     "https://w3id.org/openbadges/v2",
		ID:          fmt.Sprintf("%s/api/v1/badges/issuer.json", apiBaseURL(r)),
		Type:        "Issuer",
		Name:        "KulKul Fellowship / FellowHire Credentials Board",
		URL:         h.frontendURL,
		Email:       fallbackIssuerEmail,
		Description: "Official certifying authority for FellowHire and KulKul Fellowship engineering talent credentials.",
	})
}

// GetBadgeImageSVG handles GET /api/v1/badges/images/{type}.svg
func (h *CredentialHandler) GetBadgeImageSVG(w http.ResponseWriter, r *http.Request) {
	badgeType := chi.URLParam(r, "type")
	badgeType = strings.TrimSuffix(badgeType, ".svg")

	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if badgeType == "completion" || badgeType == "program-graduate" || badgeType == "graduate" {
		// Program Graduate / Completion Medallion (Gold & Royal Purple)
		svg := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b116b" />
      <stop offset="50%" stop-color="#220745" />
      <stop offset="100%" stop-color="#14022a" />
    </linearGradient>
    <filter id="badgeShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#1e0939" flood-opacity="0.4" />
    </filter>
  </defs>

  <!-- Outer Starburst / Hexagon Ring -->
  <circle cx="200" cy="190" r="175" fill="none" stroke="url(#goldGrad)" stroke-width="4" stroke-dasharray="6,4" opacity="0.8"/>
  <circle cx="200" cy="190" r="162" fill="url(#goldGrad)" filter="url(#badgeShadow)" />
  <circle cx="200" cy="190" r="148" fill="url(#purpleGrad)" stroke="#fde68a" stroke-width="2.5" />

  <!-- Inner Decorative Ring -->
  <circle cx="200" cy="190" r="138" fill="none" stroke="#fbbf24" stroke-width="1.2" stroke-opacity="0.6"/>

  <!-- Five Stars -->
  <g fill="#fbbf24" transform="translate(0, -5)">
    <polygon points="150,110 153,119 162,119 155,124 157,133 150,128 143,133 145,124 138,119 147,119" />
    <polygon points="175,98 178,107 187,107 180,112 182,121 175,116 168,121 170,112 163,107 172,107" />
    <polygon points="200,92 203,101 212,101 205,106 207,115 200,110 193,115 195,106 188,101 197,101" />
    <polygon points="225,98 228,107 237,107 230,112 232,121 225,116 218,121 220,112 213,107 222,107" />
    <polygon points="250,110 253,119 262,119 255,124 257,133 250,128 243,133 245,124 238,119 247,119" />
  </g>

  <!-- Graduation Cap Icon -->
  <g fill="#fde68a" stroke="#d97706" stroke-width="1.5" stroke-linejoin="round">
    <path d="M 200,140 L 265,165 L 200,190 L 135,165 Z" fill="#fbbf24" />
    <path d="M 160,178 L 160,208 C 160,222 240,222 240,208 L 240,178" fill="#d97706" />
    <path d="M 260,167 L 275,195 L 272,215" fill="none" stroke="#fde68a" stroke-width="2.5" />
    <circle cx="272" cy="216" r="3.5" fill="#fde68a" />
  </g>

  <!-- Center Text -->
  <text x="200" y="244" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="#ffffff" letter-spacing="2">FELLOWSHIP</text>
  <text x="200" y="262" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#fde68a" letter-spacing="3.5">GRADUATE</text>

  <!-- Bottom Ribbon -->
  <g filter="url(#badgeShadow)">
    <path d="M 80,315 L 120,305 L 110,340 Z" fill="#92400e" />
    <path d="M 320,315 L 280,305 L 290,340 Z" fill="#92400e" />
    <rect x="95" y="295" width="210" height="38" rx="8" fill="url(#goldGrad)" stroke="#fef3c7" stroke-width="1.5" />
    <text x="200" y="319" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="900" fill="#2b0d52" letter-spacing="1.5">VERIFIED CREDENTIAL</text>
  </g>
</svg>`
		_, _ = w.Write([]byte(svg))
		return
	}

	// Cohort Member Shield Badge (Royal Purple & Emerald)
	svg := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="purpleShield" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#401b70" />
      <stop offset="60%" stop-color="#2a0d50" />
      <stop offset="100%" stop-color="#180432" />
    </linearGradient>
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <filter id="shieldShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#14022a" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Outer Glowing Shield -->
  <path d="M 200,30 L 330,85 L 330,220 C 330,295 200,360 200,360 C 200,360 70,295 70,220 L 70,85 Z"
        fill="url(#emeraldGrad)" filter="url(#shieldShadow)" />

  <!-- Inner Purple Shield -->
  <path d="M 200,42 L 318,92 L 318,216 C 318,283 200,344 200,344 C 200,344 82,283 82,216 L 82,92 Z"
        fill="url(#purpleShield)" stroke="#a7f3d0" stroke-width="2" />

  <!-- Shield Highlights -->
  <path d="M 200,52 L 305,98 L 305,210 C 305,268 200,324 200,324"
        fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" />

  <!-- Center Star Emblem -->
  <circle cx="200" cy="165" r="56" fill="rgba(16, 185, 129, 0.15)" stroke="#34d399" stroke-width="2" stroke-dasharray="4,3"/>
  <polygon points="200,125 212,154 243,154 218,172 227,202 200,183 173,202 182,172 157,154 188,154"
           fill="#34d399" stroke="#a7f3d0" stroke-width="1.5" />

  <!-- Top Title -->
  <text x="200" y="105" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="#a7f3d0" letter-spacing="3">FELLOWSHIP</text>

  <!-- Banner -->
  <g filter="url(#shieldShadow)">
    <rect x="85" y="245" width="230" height="42" rx="10" fill="#047857" stroke="#6ee7b7" stroke-width="1.5" />
    <text x="200" y="271" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="#ffffff" letter-spacing="2">COHORT MEMBER</text>
  </g>

  <!-- Subtitle -->
  <text x="200" y="315" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#d1fae5" letter-spacing="1.5">OFFICIAL ADMISSION</text>
</svg>`
	_, _ = w.Write([]byte(svg))
}

// ---------------------------------------------------------------------
// PUBLIC VERIFICATION ENDPOINTS
// ---------------------------------------------------------------------

// VerifyCertificatePublic handles GET /api/v1/certificates/verify/{certificateNumber}
func (h *CredentialHandler) VerifyCertificatePublic(w http.ResponseWriter, r *http.Request) {
	certNumber := chi.URLParam(r, "certificateNumber")
	if strings.TrimSpace(certNumber) == "" {
		httpx.Error(w, http.StatusBadRequest, "certificate number required")
		return
	}

	cert, err := h.credentialRepo.GetCertificateByNumber(r.Context(), certNumber)
	if err != nil {
		if errors.Is(err, repository.ErrCertificateNotFound) {
			httpx.JSON(w, http.StatusOK, model.PublicCertificateVerification{
				Valid:             false,
				CertificateNumber: certNumber,
				Status:            "not_found",
			})
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to verify certificate")
		return
	}

	// Fetch badges awarded to this fellow
	badges, _ := h.credentialRepo.ListBadgesByApplicant(r.Context(), cert.ApplicantID)

	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	for _, b := range badges {
		b.AssertionURL = fmt.Sprintf("%s/api/v1/badges/assertions/%s.json", baseURL, b.ID.String())
		b.VerificationURL = fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, b.ID.String())
		// This endpoint is public: never expose the recipient's email address
		b.RecipientEmail = ""
	}

	cert.VerificationURL = fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
	cert.LinkedInURL = h.buildLinkedInCertificationURL(cert)
	cert.RecipientEmail = ""

	httpx.JSON(w, http.StatusOK, model.PublicCertificateVerification{
		Valid:             cert.Status == model.CertificateStatusIssued,
		CertificateNumber: cert.CertificateNumber,
		RecipientName:     cert.RecipientName,
		ProgramName:       cert.ProgramName,
		TrackName:         cert.TrackName,
		OrganizationName:  cert.OrganizationName,
		IssueDate:         cert.IssueDate,
		CompletionDate:    cert.CompletionDate,
		Status:            string(cert.Status),
		VerificationCode:  cert.VerificationCode,
		VerificationURL:   cert.VerificationURL,
		LinkedInURL:       cert.LinkedInURL,
		Badges:            badges,
		Certificate:       cert,
	})
}

// VerifyBadgePublic handles GET /api/v1/badges/verify/{id}
func (h *CredentialHandler) VerifyBadgePublic(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid badge id")
		return
	}

	badge, err := h.credentialRepo.GetBadgeByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrBadgeNotFound) {
			httpx.JSON(w, http.StatusOK, model.PublicBadgeVerification{
				Valid:   false,
				BadgeID: idStr,
			})
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to verify badge")
		return
	}

	baseURL := apiBaseURL(r)
	badge.AssertionURL = assertionURL(baseURL, badge.ID)
	badge.VerificationURL = fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, badge.ID.String())
	// This endpoint is public: never expose the recipient's email address
	badge.RecipientEmail = ""

	httpx.JSON(w, http.StatusOK, model.PublicBadgeVerification{
		Valid:            badge.RevokedAt == nil,
		BadgeID:          badge.ID.String(),
		BadgeType:        string(badge.BadgeType),
		Name:             badge.Name,
		Description:      badge.Description,
		ImageURL:         badge.ImageURL,
		RecipientName:    badge.RecipientName,
		ProgramName:      badge.ProgramName,
		OrganizationName: badge.OrganizationName,
		IssuedAt:         badge.IssuedAt,
		AssertionURL:     badge.AssertionURL,
		BadgeClassURL:    programBadgeClassURL(baseURL, badge.ProgramID, badge.BadgeType),
		IssuerURL:        orgIssuerURL(baseURL, badge.OrganizationID),
		Badge:            badge,
	})
}

// ---------------------------------------------------------------------
// ADMIN & MENTOR MANAGEMENT ENDPOINTS
// ---------------------------------------------------------------------

type GenerateCertificateRequest struct {
	SendEmail bool `json:"send_email"`

	// Optional display details. Nil means "leave unchanged"; an empty list clears the signatories.
	RecipientName   *string                       `json:"recipient_name,omitempty"`
	IntroText       *string                       `json:"intro_text,omitempty"`
	DescriptionText *string                       `json:"description_text,omitempty"`
	Signatories     *[]model.CertificateSignatory `json:"signatories,omitempty"`
}

// maxSignatureImageBytes caps each signature data URL stored in certificate metadata.
const maxSignatureImageBytes = 512 * 1024

// maxCertificateSignatories caps how many signatories fit on the certificate.
const maxCertificateSignatories = 4

var allowedSignatureImagePrefixes = []string{
	"data:image/png;base64,",
	"data:image/jpeg;base64,",
	"data:image/webp;base64,",
}

func validateSignatureImage(img string) error {
	if img == "" {
		return nil
	}
	if len(img) > maxSignatureImageBytes {
		return fmt.Errorf("signature image is too large (max %d KB)", maxSignatureImageBytes/1024)
	}
	for _, prefix := range allowedSignatureImagePrefixes {
		if strings.HasPrefix(img, prefix) {
			return nil
		}
	}
	return errors.New("signature image must be a PNG, JPEG, or WebP data URL")
}

// normalizeSignatories trims and validates signatories, dropping fully empty entries.
func normalizeSignatories(in []model.CertificateSignatory) ([]model.CertificateSignatory, error) {
	out := make([]model.CertificateSignatory, 0, len(in))
	for _, s := range in {
		s.Name = strings.TrimSpace(s.Name)
		s.Role = strings.TrimSpace(s.Role)
		s.SignatureImage = strings.TrimSpace(s.SignatureImage)
		if s.Name == "" && s.Role == "" && s.SignatureImage == "" {
			continue
		}
		if s.Name == "" {
			return nil, errors.New("each signatory needs a name")
		}
		if len(s.Name) > 255 || len(s.Role) > 255 {
			return nil, errors.New("signatory name and role must be at most 255 characters")
		}
		if err := validateSignatureImage(s.SignatureImage); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if len(out) > maxCertificateSignatories {
		return nil, fmt.Errorf("a certificate can have at most %d signatories", maxCertificateSignatories)
	}
	return out, nil
}

// GenerateOrUpdateCertificate handles POST /api/v1/applicants/{applicantId}/certificate
func (h *CredentialHandler) GenerateOrUpdateCertificate(w http.ResponseWriter, r *http.Request) {
	applicantIDStr := chi.URLParam(r, "applicantId")
	applicantID, err := uuid.Parse(applicantIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), applicantID)
	if err != nil || applicant == nil {
		httpx.Error(w, http.StatusNotFound, "applicant not found")
		return
	}

	// Verify organization ownership
	claims, _ := middleware.GetUser(r.Context())
	if claims != nil && claims.Role != "superadmin" {
		if claims.OrganizationID != nil && *claims.OrganizationID != applicant.OrganizationID {
			httpx.Error(w, http.StatusForbidden, "unauthorized to manage credentials for this applicant")
			return
		}
	}

	var req GenerateCertificateRequest
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&req)

	if req.RecipientName != nil && len(strings.TrimSpace(*req.RecipientName)) > 255 {
		httpx.Error(w, http.StatusBadRequest, "recipient name must be at most 255 characters")
		return
	}

	if req.IntroText != nil && len(strings.TrimSpace(*req.IntroText)) > 255 {
		httpx.Error(w, http.StatusBadRequest, "intro text must be at most 255 characters")
		return
	}
	if req.DescriptionText != nil && len(strings.TrimSpace(*req.DescriptionText)) > 1000 {
		httpx.Error(w, http.StatusBadRequest, "description must be at most 1000 characters")
		return
	}

	metadata := map[string]interface{}{}
	if req.IntroText != nil {
		metadata[model.CertMetaIntroText] = strings.TrimSpace(*req.IntroText)
	}
	if req.DescriptionText != nil {
		metadata[model.CertMetaDescriptionText] = strings.TrimSpace(*req.DescriptionText)
	}
	if req.Signatories != nil {
		signatories, err := normalizeSignatories(*req.Signatories)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		metadata[model.CertMetaSignatories] = signatories
	}

	// Recipient name shown on the certificate: explicit input > existing certificate > applicant name
	recipientName := applicant.FullName
	if existing, _ := h.credentialRepo.GetCertificateByApplicantAndProgram(r.Context(), applicant.ID, applicant.ProgramID); existing != nil && existing.RecipientName != "" {
		recipientName = existing.RecipientName
	}
	if req.RecipientName != nil && strings.TrimSpace(*req.RecipientName) != "" {
		recipientName = strings.TrimSpace(*req.RecipientName)
	}

	program, _ := h.programRepo.GetByID(r.Context(), applicant.ProgramID)
	programName := "Fellowship Program"
	if program != nil {
		programName = program.Name
	}

	trackName := ""
	if applicant.TrackID != nil {
		if tr, _ := h.trackRepo.GetByID(r.Context(), *applicant.TrackID); tr != nil {
			trackName = tr.Name
		}
	}

	org, _ := h.orgRepo.GetByID(r.Context(), applicant.OrganizationID)
	orgName := "KulKul Tech"
	if org != nil {
		orgName = org.Name
	}

	now := time.Now()

	// 1. Award Completion Badge if not already awarded
	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	completionBadge, _ := h.credentialRepo.AwardBadge(r.Context(), &model.Badge{
		ApplicantID:    applicant.ID,
		ProgramID:      applicant.ProgramID,
		OrganizationID: applicant.OrganizationID,
		BadgeType:      model.BadgeTypeCompletion,
		Name:           fmt.Sprintf("%s Graduate Badge", programName),
		Description:    fmt.Sprintf("Recognizes the successful graduation and completion of the %s cohort.", programName),
		ImageURL:       fmt.Sprintf("%s/api/v1/badges/images/completion.svg", baseURL),
		CriteriaURL:    fmt.Sprintf("%s/api/v1/badges/classes/program-graduate.json", baseURL),
		IssuedAt:       now,
	})

	// Also ensure Member Badge is present
	_, _ = h.credentialRepo.AwardBadge(r.Context(), &model.Badge{
		ApplicantID:    applicant.ID,
		ProgramID:      applicant.ProgramID,
		OrganizationID: applicant.OrganizationID,
		BadgeType:      model.BadgeTypeMember,
		Name:           fmt.Sprintf("%s Member Badge", programName),
		Description:    fmt.Sprintf("Recognizes official admission into the %s fellowship cohort.", programName),
		ImageURL:       fmt.Sprintf("%s/api/v1/badges/images/member.svg", baseURL),
		CriteriaURL:    fmt.Sprintf("%s/api/v1/badges/classes/cohort-member.json", baseURL),
		IssuedAt:       applicant.CreatedAt,
	})

	// 2. Generate or update Certificate
	certNumber := fmt.Sprintf("CERT-%d-%s", now.Year(), strings.ToUpper(uuid.New().String()[:8]))
	verificationCode := strings.ReplaceAll(uuid.New().String(), "-", "")

	cert, err := h.credentialRepo.CreateOrUpdateCertificate(r.Context(), &model.Certificate{
		CertificateNumber: certNumber,
		ApplicantID:       applicant.ID,
		ProgramID:         applicant.ProgramID,
		OrganizationID:    applicant.OrganizationID,
		RecipientName:     recipientName,
		RecipientEmail:    applicant.Email,
		ProgramName:       programName,
		TrackName:         trackName,
		IssueDate:         now,
		CompletionDate:    now,
		Status:            model.CertificateStatusIssued,
		VerificationCode:  verificationCode,
		Metadata:          metadata,
		OrganizationName:  orgName,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to generate certificate")
		return
	}

	// Hydrate URLs
	cert.VerificationURL = fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
	cert.LinkedInURL = h.buildLinkedInCertificationURL(cert)

	// 3. Send email if requested or if candidate hasn't received email yet
	if req.SendEmail && h.emailSvc != nil && applicant.Email != "" {
		badgeURL := ""
		if completionBadge != nil {
			badgeURL = fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, completionBadge.ID.String())
		}
		_ = h.emailSvc.SendCertificateEmail(
			applicant.Email,
			cert.RecipientName,
			programName,
			trackName,
			cert.CertificateNumber,
			cert.VerificationURL,
			badgeURL,
			cert.IssueDate,
		)
		_ = h.credentialRepo.RecordCertificateEmailSent(r.Context(), cert.ID, now)
		cert.EmailSentAt = &now
	}

	// 4. Update applicant stage to completed if not already
	if applicant.CurrentStage != model.StageCompleted {
		_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageCompleted)
	}

	httpx.JSON(w, http.StatusOK, cert)
}

// SendCertificateEmail handles POST /api/v1/certificates/{certificateId}/send-email
func (h *CredentialHandler) SendCertificateEmail(w http.ResponseWriter, r *http.Request) {
	certIDStr := chi.URLParam(r, "certificateId")
	certID, err := uuid.Parse(certIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid certificate id")
		return
	}

	cert, err := h.credentialRepo.GetCertificateByID(r.Context(), certID)
	if err != nil || cert == nil {
		httpx.Error(w, http.StatusNotFound, "certificate not found")
		return
	}

	claims, _ := middleware.GetUser(r.Context())
	if claims != nil && claims.Role != "superadmin" {
		if claims.OrganizationID != nil && *claims.OrganizationID != cert.OrganizationID {
			httpx.Error(w, http.StatusForbidden, "unauthorized to email this certificate")
			return
		}
	}

	if h.emailSvc == nil {
		httpx.Error(w, http.StatusBadRequest, "email service not configured")
		return
	}

	certURL := fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
	badgeURL := fmt.Sprintf("%s/candidate/dashboard", h.frontendURL)

	now := time.Now()
	if err := h.emailSvc.SendCertificateEmail(
		cert.RecipientEmail,
		cert.RecipientName,
		cert.ProgramName,
		cert.TrackName,
		cert.CertificateNumber,
		certURL,
		badgeURL,
		cert.IssueDate,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to dispatch certificate email")
		return
	}

	_ = h.credentialRepo.RecordCertificateEmailSent(r.Context(), cert.ID, now)
	cert.EmailSentAt = &now

	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"message":       fmt.Sprintf("Certificate successfully emailed to %s", cert.RecipientEmail),
		"email_sent_at": now,
	})
}

// ListProgramCertificates handles GET /api/v1/programs/{programId}/certificates
func (h *CredentialHandler) ListProgramCertificates(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	list, err := h.credentialRepo.ListCertificatesByProgram(r.Context(), programID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list certificates")
		return
	}

	for _, cert := range list {
		cert.VerificationURL = fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
		cert.LinkedInURL = h.buildLinkedInCertificationURL(cert)
	}

	httpx.JSON(w, http.StatusOK, list)
}

// GetApplicantCredentials handles GET /api/v1/applicants/{applicantId}/credentials
func (h *CredentialHandler) GetApplicantCredentials(w http.ResponseWriter, r *http.Request) {
	applicantIDStr := chi.URLParam(r, "applicantId")
	applicantID, err := uuid.Parse(applicantIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), applicantID)
	if err != nil || applicant == nil {
		httpx.Error(w, http.StatusNotFound, "applicant not found")
		return
	}

	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	// Auto-award member badge if applicant is approved for live or completed, and doesn't have it yet
	if applicant.CurrentStage == model.StageApprovedForLive || applicant.CurrentStage == model.StageCompleted || applicant.ProgramRoomInvitedAt != nil {
		prog, _ := h.programRepo.GetByID(r.Context(), applicant.ProgramID)
		progName := "Fellowship Program"
		if prog != nil {
			progName = prog.Name
		}
		_, _ = h.credentialRepo.AwardBadge(r.Context(), &model.Badge{
			ApplicantID:    applicant.ID,
			ProgramID:      applicant.ProgramID,
			OrganizationID: applicant.OrganizationID,
			BadgeType:      model.BadgeTypeMember,
			Name:           fmt.Sprintf("%s Member Badge", progName),
			Description:    fmt.Sprintf("Recognizes official admission into the %s fellowship cohort.", progName),
			ImageURL:       fmt.Sprintf("%s/api/v1/badges/images/member.svg", baseURL),
			CriteriaURL:    fmt.Sprintf("%s/api/v1/badges/classes/cohort-member.json", baseURL),
			IssuedAt:       applicant.CreatedAt,
		})
	}

	badges, _ := h.credentialRepo.ListBadgesByApplicant(r.Context(), applicantID)
	for _, b := range badges {
		b.AssertionURL = fmt.Sprintf("%s/api/v1/badges/assertions/%s.json", baseURL, b.ID.String())
		b.VerificationURL = fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, b.ID.String())
	}

	cert, _ := h.credentialRepo.GetCertificateByApplicantAndProgram(r.Context(), applicantID, applicant.ProgramID)
	if cert != nil {
		cert.VerificationURL = fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
		cert.LinkedInURL = h.buildLinkedInCertificationURL(cert)
	}

	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"badges":      badges,
		"certificate": cert,
	})
}

// ---------------------------------------------------------------------
// CANDIDATE PORTAL CREDENTIALS
// ---------------------------------------------------------------------

// GetMyCredentials handles GET /api/v1/candidate/my-credentials
func (h *CredentialHandler) GetMyCredentials(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUser(r.Context())
	if claims == nil || claims.Email == "" {
		httpx.Error(w, http.StatusUnauthorized, "candidate authentication required")
		return
	}

	// Lookup all applicant records belonging to this candidate's email
	applicants, err := h.applicantRepo.ListByEmail(r.Context(), claims.Email)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load candidate applications")
		return
	}

	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	var allBadges []*model.Badge
	var allCertificates []*model.Certificate

	for _, app := range applicants {
		// Auto-award member badge if approved for live or completed
		if app.CurrentStage == model.StageApprovedForLive || app.CurrentStage == model.StageCompleted || app.ProgramRoomInvitedAt != nil {
			prog, _ := h.programRepo.GetByID(r.Context(), app.ProgramID)
			progName := "Fellowship Program"
			if prog != nil {
				progName = prog.Name
			}
			_, _ = h.credentialRepo.AwardBadge(r.Context(), &model.Badge{
				ApplicantID:    app.ID,
				ProgramID:      app.ProgramID,
				OrganizationID: app.OrganizationID,
				BadgeType:      model.BadgeTypeMember,
				Name:           fmt.Sprintf("%s Member Badge", progName),
				Description:    fmt.Sprintf("Recognizes official admission into the %s fellowship cohort.", progName),
				ImageURL:       fmt.Sprintf("%s/api/v1/badges/images/member.svg", baseURL),
				CriteriaURL:    fmt.Sprintf("%s/api/v1/badges/classes/cohort-member.json", baseURL),
				IssuedAt:       app.CreatedAt,
			})
		}

		badges, _ := h.credentialRepo.ListBadgesByApplicant(r.Context(), app.ID)
		for _, b := range badges {
			b.AssertionURL = fmt.Sprintf("%s/api/v1/badges/assertions/%s.json", baseURL, b.ID.String())
			b.VerificationURL = fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, b.ID.String())
			allBadges = append(allBadges, b)
		}

		cert, _ := h.credentialRepo.GetCertificateByApplicantAndProgram(r.Context(), app.ID, app.ProgramID)
		if cert != nil {
			cert.VerificationURL = fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
			cert.LinkedInURL = h.buildLinkedInCertificationURL(cert)
			allCertificates = append(allCertificates, cert)
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"badges":       allBadges,
		"certificates": allCertificates,
	})
}

// ---------------------------------------------------------------------
// HELPER METHODS
// ---------------------------------------------------------------------

func (h *CredentialHandler) buildLinkedInCertificationURL(cert *model.Certificate) string {
	certURL := fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)

	params := url.Values{}
	params.Set("startTask", "CERTIFICATION_NAME")
	params.Set("name", fmt.Sprintf("%s Certificate of Completion", cert.ProgramName))
	params.Set("organizationName", cert.OrganizationName)
	params.Set("issueYear", fmt.Sprintf("%d", cert.IssueDate.Year()))
	params.Set("issueMonth", fmt.Sprintf("%d", int(cert.IssueDate.Month())))
	params.Set("certUrl", certURL)
	params.Set("certId", cert.CertificateNumber)

	return "https://www.linkedin.com/profile/add?" + params.Encode()
}

// AutoAwardMemberBadge awards a member badge to an applicant when accepted
func (h *CredentialHandler) AutoAwardMemberBadge(ctx context.Context, applicant *model.Applicant, programName string, baseURL string) (*model.Badge, error) {
	if applicant == nil {
		return nil, errors.New("nil applicant")
	}
	if programName == "" {
		programName = "Fellowship Program"
	}
	if baseURL == "" {
		baseURL = h.frontendURL
	}
	return h.credentialRepo.AwardBadge(ctx, &model.Badge{
		ApplicantID:    applicant.ID,
		ProgramID:      applicant.ProgramID,
		OrganizationID: applicant.OrganizationID,
		BadgeType:      model.BadgeTypeMember,
		RecipientName:  applicant.FullName,
		RecipientEmail: applicant.Email,
		Name:           fmt.Sprintf("%s Member Badge", programName),
		Description:    fmt.Sprintf("Recognizes official admission into the %s fellowship cohort.", programName),
		ImageURL:       fmt.Sprintf("%s/api/v1/badges/images/member.svg", baseURL),
		CriteriaURL:    fmt.Sprintf("%s/api/v1/badges/classes/cohort-member.json", baseURL),
		IssuedAt:       time.Now(),
	})
}

// AutoAwardCompletionBadge awards a completion badge to an applicant when graduated
func (h *CredentialHandler) AutoAwardCompletionBadge(ctx context.Context, applicant *model.Applicant, programName string, baseURL string) (*model.Badge, error) {
	if applicant == nil {
		return nil, errors.New("nil applicant")
	}
	if programName == "" {
		programName = "Fellowship Program"
	}
	if baseURL == "" {
		baseURL = h.frontendURL
	}
	return h.credentialRepo.AwardBadge(ctx, &model.Badge{
		ApplicantID:    applicant.ID,
		ProgramID:      applicant.ProgramID,
		OrganizationID: applicant.OrganizationID,
		BadgeType:      model.BadgeTypeCompletion,
		RecipientName:  applicant.FullName,
		RecipientEmail: applicant.Email,
		Name:           fmt.Sprintf("%s Graduate Badge", programName),
		Description:    fmt.Sprintf("Recognizes the successful graduation and completion of the %s cohort.", programName),
		ImageURL:       fmt.Sprintf("%s/api/v1/badges/images/completion.svg", baseURL),
		CriteriaURL:    fmt.Sprintf("%s/api/v1/badges/classes/program-graduate.json", baseURL),
		IssuedAt:       time.Now(),
	})
}
