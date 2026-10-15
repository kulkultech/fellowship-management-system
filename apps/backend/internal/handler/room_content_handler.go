package handler

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

const (
	maxRoomItems       = 100
	maxRoomTitle       = 200
	maxRoomDescription = 2000
	maxRoomURL         = 2000
	roomDateLayout     = "2006-01-02"
)

var roomResourceCategories = map[string]bool{"channel": true, "repository": true, "document": true, "link": true}

// RoomContentHandler serves the curriculum and resources inside a program room.
// Fellows of the program can read them; the program's admins and mentors can edit them.
type RoomContentHandler struct {
	contentRepo   *repository.RoomContentRepository
	programRepo   *repository.ProgramRepository
	applicantRepo *repository.ApplicantRepository
	mentorRepo    *repository.MentorRepository
}

func NewRoomContentHandler(
	contentRepo *repository.RoomContentRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	mentorRepo *repository.MentorRepository,
) *RoomContentHandler {
	return &RoomContentHandler{contentRepo: contentRepo, programRepo: programRepo, applicantRepo: applicantRepo, mentorRepo: mentorRepo}
}

// canEdit: superadmins, admins/reviewers of the program's organization, and the program's mentors.
func (h *RoomContentHandler) canEdit(ctx context.Context, claims *auth.Claims, program *model.Program) bool {
	switch claims.Role {
	case model.RoleSuperadmin:
		return true
	case model.RoleOrgAdmin, model.RoleReviewer:
		return claims.OrganizationID != nil && *claims.OrganizationID == program.OrganizationID
	case model.RoleMentor:
		if h.mentorRepo == nil {
			return false
		}
		isMentor, err := h.mentorRepo.IsMentorOfProgram(ctx, claims.UserID, program.ID)
		return err == nil && isMentor
	}
	return false
}

// isFellow: an accepted (or room-invited) fellow of the program.
func (h *RoomContentHandler) isFellow(ctx context.Context, claims *auth.Claims, programID uuid.UUID) bool {
	if claims.Email == "" {
		return false
	}
	apps, err := h.applicantRepo.ListByEmail(ctx, claims.Email)
	if err != nil {
		return false
	}
	for _, app := range apps {
		if app.ProgramID != programID || app.DeletedAt != nil {
			continue
		}
		if app.CurrentStage == model.StageApprovedForLive || app.CurrentStage == model.StageCompleted || app.ProgramRoomInvitedAt != nil {
			return true
		}
	}
	return false
}

func (h *RoomContentHandler) loadProgram(w http.ResponseWriter, r *http.Request) (*model.Program, *auth.Claims, bool) {
	programID, err := uuid.Parse(chi.URLParam(r, "programId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return nil, nil, false
	}
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, nil, false
	}
	program, err := h.programRepo.GetByID(r.Context(), programID)
	if err != nil || program == nil {
		httpx.Error(w, http.StatusNotFound, "program not found")
		return nil, nil, false
	}
	return program, claims, true
}

// GetContent handles GET /api/v1/programs/{programId}/room-content
func (h *RoomContentHandler) GetContent(w http.ResponseWriter, r *http.Request) {
	program, claims, ok := h.loadProgram(w, r)
	if !ok {
		return
	}
	canEdit := h.canEdit(r.Context(), claims, program)
	if !canEdit && !h.isFellow(r.Context(), claims, program.ID) {
		httpx.Error(w, http.StatusForbidden, "only this program's fellows and staff can view the program room")
		return
	}
	content, err := h.contentRepo.Get(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load program room content")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"content": content, "can_edit": canEdit})
}

func cleanText(s string, max int) (string, bool) {
	s = strings.TrimSpace(s)
	return s, len([]rune(s)) <= max
}

func validRoomDate(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse(roomDateLayout, s)
	return err == nil
}

func roomItemID(raw string) string {
	if id, err := uuid.Parse(strings.TrimSpace(raw)); err == nil {
		return id.String()
	}
	return uuid.NewString()
}

// SaveCurriculum handles PUT /api/v1/programs/{programId}/room-content/curriculum
func (h *RoomContentHandler) SaveCurriculum(w http.ResponseWriter, r *http.Request) {
	program, claims, ok := h.loadProgram(w, r)
	if !ok {
		return
	}
	if !h.canEdit(r.Context(), claims, program) {
		httpx.Error(w, http.StatusForbidden, "only this program's admins and mentors can edit the curriculum")
		return
	}
	var req struct {
		Items []model.CurriculumItem `json:"items"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.Items) > maxRoomItems {
		httpx.Error(w, http.StatusBadRequest, "too many curriculum items")
		return
	}
	items := make([]model.CurriculumItem, 0, len(req.Items))
	for _, it := range req.Items {
		title, okTitle := cleanText(it.Title, maxRoomTitle)
		desc, okDesc := cleanText(it.Description, maxRoomDescription)
		start, end := strings.TrimSpace(it.StartDate), strings.TrimSpace(it.EndDate)
		switch {
		case title == "":
			httpx.Error(w, http.StatusBadRequest, "every curriculum item needs a title")
			return
		case !okTitle || !okDesc:
			httpx.Error(w, http.StatusBadRequest, "curriculum title or description is too long")
			return
		case !validRoomDate(start) || !validRoomDate(end):
			httpx.Error(w, http.StatusBadRequest, "curriculum dates must be YYYY-MM-DD")
			return
		case start != "" && end != "" && end < start:
			httpx.Error(w, http.StatusBadRequest, "a curriculum item cannot end before it starts")
			return
		}
		items = append(items, model.CurriculumItem{ID: roomItemID(it.ID), Title: title, Description: desc, StartDate: start, EndDate: end})
	}
	content, err := h.contentRepo.SaveCurriculum(r.Context(), program.ID, claims.UserID, items)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save curriculum")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"content": content})
}

// SaveResources handles PUT /api/v1/programs/{programId}/room-content/resources
func (h *RoomContentHandler) SaveResources(w http.ResponseWriter, r *http.Request) {
	program, claims, ok := h.loadProgram(w, r)
	if !ok {
		return
	}
	if !h.canEdit(r.Context(), claims, program) {
		httpx.Error(w, http.StatusForbidden, "only this program's admins and mentors can edit resources")
		return
	}
	var req struct {
		Items []model.RoomResource `json:"items"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.Items) > maxRoomItems {
		httpx.Error(w, http.StatusBadRequest, "too many resources")
		return
	}
	items := make([]model.RoomResource, 0, len(req.Items))
	for _, it := range req.Items {
		title, okTitle := cleanText(it.Title, maxRoomTitle)
		desc, okDesc := cleanText(it.Description, maxRoomDescription)
		link := strings.TrimSpace(it.URL)
		category := strings.ToLower(strings.TrimSpace(it.Category))
		if category == "" {
			category = "link"
		}
		parsed, urlErr := url.Parse(link)
		switch {
		case title == "":
			httpx.Error(w, http.StatusBadRequest, "every resource needs a title")
			return
		case !okTitle || !okDesc:
			httpx.Error(w, http.StatusBadRequest, "resource title or description is too long")
			return
		case link == "" || len(link) > maxRoomURL || urlErr != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "":
			httpx.Error(w, http.StatusBadRequest, "every resource needs a valid http(s) link")
			return
		case !roomResourceCategories[category]:
			httpx.Error(w, http.StatusBadRequest, "resource category must be channel, repository, document, or link")
			return
		}
		items = append(items, model.RoomResource{ID: roomItemID(it.ID), Title: title, URL: link, Description: desc, Category: category})
	}
	content, err := h.contentRepo.SaveResources(r.Context(), program.ID, claims.UserID, items)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save resources")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"content": content})
}
