package handler

import (
	"context"
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

	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	badgeTypeSlug := "cohort-member"
	if badge.BadgeType == model.BadgeTypeCompletion {
		badgeTypeSlug = "program-graduate"
	}

	assertion := model.OpenBadgeAssertion{
		Context: "https://w3id.org/openbadges/v2",
		ID:      fmt.Sprintf("%s/api/v1/badges/assertions/%s.json", baseURL, badge.ID.String()),
		Type:    "Assertion",
		Recipient: model.OpenBadgeRecipient{
			Type:     "email",
			Hashed:   false,
			Identity: badge.RecipientEmail,
		},
		Badge: fmt.Sprintf("%s/api/v1/badges/classes/%s.json", baseURL, badgeTypeSlug),
		Verification: model.OpenBadgeVerification{
			Type: "hosted",
		},
		IssuedOn:  badge.IssuedAt.UTC().Format(time.RFC3339),
		Evidence:  fmt.Sprintf("%s/verify/badge/%s", h.frontendURL, badge.ID.String()),
		Narrative: badge.Description,
	}

	w.Header().Set("Content-Type", "application/ld+json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	_ = json.NewEncoder(w).Encode(assertion)
}

// GetBadgeClassJSON handles GET /api/v1/badges/classes/{slug}.json
func (h *CredentialHandler) GetBadgeClassJSON(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	slug = strings.TrimSuffix(slug, ".json")

	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

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

	w.Header().Set("Content-Type", "application/ld+json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	_ = json.NewEncoder(w).Encode(class)
}

// GetBadgeIssuerJSON handles GET /api/v1/badges/issuer.json
func (h *CredentialHandler) GetBadgeIssuerJSON(w http.ResponseWriter, r *http.Request) {
	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	issuer := model.OpenBadgeIssuer{
		Context:     "https://w3id.org/openbadges/v2",
		ID:          fmt.Sprintf("%s/api/v1/badges/issuer.json", baseURL),
		Type:        "Issuer",
		Name:        "KulKul Fellowship / FellowHire Credentials Board",
		URL:         h.frontendURL,
		Email:       "credentials@fellowhire.com",
		Description: "Official certifying authority for FellowHire and KulKul Fellowship engineering talent credentials.",
	}

	w.Header().Set("Content-Type", "application/ld+json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	_ = json.NewEncoder(w).Encode(issuer)
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
	}

	cert.VerificationURL = fmt.Sprintf("%s/verify/certificate/%s", h.frontendURL, cert.CertificateNumber)
	cert.LinkedInURL = h.buildLinkedInCertificationURL(cert)

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

	scheme := "https"
	if r.TLS == nil && !strings.HasPrefix(r.Header.Get("X-Forwarded-Proto"), "https") && strings.Contains(r.Host, "localhost") {
		scheme = "http"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	badgeTypeSlug := "cohort-member"
	if badge.BadgeType == model.BadgeTypeCompletion {
		badgeTypeSlug = "program-graduate"
	}

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
		AssertionURL:     fmt.Sprintf("%s/api/v1/badges/assertions/%s.json", baseURL, badge.ID.String()),
		BadgeClassURL:    fmt.Sprintf("%s/api/v1/badges/classes/%s.json", baseURL, badgeTypeSlug),
		IssuerURL:        fmt.Sprintf("%s/api/v1/badges/issuer.json", baseURL),
	})
}

// ---------------------------------------------------------------------
// ADMIN & MENTOR MANAGEMENT ENDPOINTS
// ---------------------------------------------------------------------

type GenerateCertificateRequest struct {
	SendEmail bool `json:"send_email"`
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
	_ = json.NewDecoder(r.Body).Decode(&req)

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
		RecipientName:     applicant.FullName,
		RecipientEmail:    applicant.Email,
		ProgramName:       programName,
		TrackName:         trackName,
		IssueDate:         now,
		CompletionDate:    now,
		Status:            model.CertificateStatusIssued,
		VerificationCode:  verificationCode,
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
			applicant.FullName,
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
