package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type MentorHandler struct {
	mentorRepo    *repository.MentorRepository
	userRepo      *repository.UserRepository
	programRepo   *repository.ProgramRepository
	applicantRepo *repository.ApplicantRepository
}

func NewMentorHandler(
	mentorRepo *repository.MentorRepository,
	userRepo *repository.UserRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
) *MentorHandler {
	return &MentorHandler{
		mentorRepo:    mentorRepo,
		userRepo:      userRepo,
		programRepo:   programRepo,
		applicantRepo: applicantRepo,
	}
}

// GetOverview handles GET /api/v1/mentor/overview
func (h *MentorHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), claims.UserID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "user profile not found")
		return
	}

	overview, err := h.mentorRepo.GetOverview(r.Context(), user)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load mentor overview: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, overview)
}

// ListPrograms handles GET /api/v1/mentor/programs
func (h *MentorHandler) ListPrograms(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Superadmins / Org admins can see programs for the organization
	if claims.Role == model.RoleSuperadmin || claims.Role == model.RoleOrgAdmin {
		programs, err := h.mentorRepo.ListProgramsByMentor(r.Context(), claims.UserID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to list mentor programs: "+err.Error())
			return
		}
		// If org admin has no specific mentor assignment, list their org programs as fallback
		if len(programs) == 0 && claims.OrganizationID != nil {
			orgPrograms, err := h.programRepo.ListByOrg(r.Context(), *claims.OrganizationID)
			if err == nil {
				for _, p := range orgPrograms {
					programs = append(programs, &model.MentorProgramSummary{
						ProgramID:      p.ID,
						ProgramSlug:    p.Slug,
						ProgramName:    p.Name,
						Description:    p.Description,
						ImageURL:       p.ImageURL,
						OrganizationID: p.OrganizationID,
						RoleTitle:      "Administrator / Lead Mentor",
						OpenDate:       p.OpenDate,
						EndDate:        p.EndDate,
					})
				}
			}
		}
		httpx.JSON(w, http.StatusOK, map[string]any{
			"programs": programs,
		})
		return
	}

	programs, err := h.mentorRepo.ListProgramsByMentor(r.Context(), claims.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list mentor programs: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"programs": programs,
	})
}

// ListFellows handles GET /api/v1/mentor/programs/{id}/fellows
func (h *MentorHandler) ListFellows(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	programIDStr := chi.URLParam(r, "id")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	ctx := r.Context()

	// Verify authorization: must be superadmin, org_admin of program org, or assigned mentor
	if claims.Role != model.RoleSuperadmin && claims.Role != model.RoleOrgAdmin {
		isMentor, err := h.mentorRepo.IsMentorOfProgram(ctx, claims.UserID, programID)
		if err != nil || !isMentor {
			httpx.Error(w, http.StatusForbidden, "you are not an assigned mentor for this program")
			return
		}
	}

	program, err := h.programRepo.GetByID(ctx, programID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "program not found")
		return
	}

	applicants, err := h.applicantRepo.ListByProgram(ctx, programID, "")
	if err != nil {
		if errors.Is(err, repository.ErrApplicantNotFound) {
			applicants = []model.Applicant{}
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to list fellows: "+err.Error())
			return
		}
	}

	// Filter for fellows: candidates who submitted application and are not deleted
	fellows := make([]model.Applicant, 0, len(applicants))
	for _, a := range applicants {
		if a.DeletedAt == nil {
			fellows = append(fellows, a)
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"program": map[string]any{
			"id":   program.ID,
			"slug": program.Slug,
			"name": program.Name,
		},
		"fellows": fellows,
		"count":   len(fellows),
	})
}
