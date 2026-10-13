package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

const maxFellowGroupNameLength = 120

// FellowGroupHandler manages named groups of fellows used to target sessions and assignments.
type FellowGroupHandler struct {
	groupRepo     *repository.FellowGroupRepository
	programRepo   *repository.ProgramRepository
	applicantRepo *repository.ApplicantRepository
	mentorRepo    *repository.MentorRepository
}

func NewFellowGroupHandler(
	groupRepo *repository.FellowGroupRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	mentorRepo *repository.MentorRepository,
) *FellowGroupHandler {
	return &FellowGroupHandler{groupRepo: groupRepo, programRepo: programRepo, applicantRepo: applicantRepo, mentorRepo: mentorRepo}
}

// authorizeProgram allows superadmins, admins/reviewers of the program's organization, and the program's mentors.
func (h *FellowGroupHandler) authorizeProgram(w http.ResponseWriter, r *http.Request) (*model.Program, *uuid.UUID, bool) {
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

	allowed := false
	switch claims.Role {
	case model.RoleSuperadmin:
		allowed = true
	case model.RoleOrgAdmin, model.RoleReviewer:
		allowed = claims.OrganizationID != nil && *claims.OrganizationID == program.OrganizationID
	case model.RoleMentor:
		if h.mentorRepo != nil {
			isMentor, err := h.mentorRepo.IsMentorOfProgram(r.Context(), claims.UserID, programID)
			allowed = err == nil && isMentor
		}
	}
	if !allowed {
		httpx.Error(w, http.StatusForbidden, "you do not have access to this program")
		return nil, nil, false
	}
	userID := claims.UserID
	return program, &userID, true
}

type fellowGroupRequest struct {
	Name      string   `json:"name"`
	MemberIDs []string `json:"member_ids"`
}

// parseGroupRequest validates the name and that every member is a fellow of the program.
func (h *FellowGroupHandler) parseGroupRequest(w http.ResponseWriter, r *http.Request, programID uuid.UUID) (string, []uuid.UUID, bool) {
	var req fellowGroupRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return "", nil, false
	}
	name := strings.Join(strings.Fields(req.Name), " ")
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "group name is required")
		return "", nil, false
	}
	if len([]rune(name)) > maxFellowGroupNameLength {
		httpx.Error(w, http.StatusBadRequest, "group name is too long")
		return "", nil, false
	}
	if len(req.MemberIDs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "select at least one fellow")
		return "", nil, false
	}

	fellows, err := h.applicantRepo.ListByProgram(r.Context(), programID, "")
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load program fellows")
		return "", nil, false
	}
	inProgram := make(map[uuid.UUID]bool, len(fellows))
	for _, f := range fellows {
		if f.DeletedAt == nil {
			inProgram[f.ID] = true
		}
	}

	seen := map[uuid.UUID]bool{}
	var members []uuid.UUID
	for _, raw := range req.MemberIDs {
		id, err := uuid.Parse(strings.TrimSpace(raw))
		if err != nil || !inProgram[id] {
			httpx.Error(w, http.StatusBadRequest, "every member must be a fellow of this program")
			return "", nil, false
		}
		if !seen[id] {
			seen[id] = true
			members = append(members, id)
		}
	}
	return name, members, true
}

func writeFellowGroupError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repository.ErrFellowGroupNameExists):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, repository.ErrFellowGroupNotFound):
		httpx.Error(w, http.StatusNotFound, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "failed to save fellow group")
	}
}

// ListGroups handles GET /api/v1/programs/{programId}/fellow-groups
func (h *FellowGroupHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	program, _, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	groups, err := h.groupRepo.ListByProgram(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list fellow groups")
		return
	}
	if groups == nil {
		groups = []*model.FellowGroup{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"groups": groups})
}

// CreateGroup handles POST /api/v1/programs/{programId}/fellow-groups
func (h *FellowGroupHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	program, userID, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	name, members, ok := h.parseGroupRequest(w, r, program.ID)
	if !ok {
		return
	}
	group, err := h.groupRepo.Create(r.Context(), &model.FellowGroup{
		ProgramID: program.ID,
		Name:      name,
		MemberIDs: members,
		CreatedBy: userID,
	})
	if err != nil {
		writeFellowGroupError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"group": group})
}

// UpdateGroup handles PUT /api/v1/programs/{programId}/fellow-groups/{groupId}
func (h *FellowGroupHandler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	program, _, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	groupID, err := uuid.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid group id")
		return
	}
	name, members, ok := h.parseGroupRequest(w, r, program.ID)
	if !ok {
		return
	}
	group, err := h.groupRepo.Update(r.Context(), program.ID, groupID, name, members)
	if err != nil {
		writeFellowGroupError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"group": group})
}

// DeleteGroup handles DELETE /api/v1/programs/{programId}/fellow-groups/{groupId}
func (h *FellowGroupHandler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	program, _, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	groupID, err := uuid.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid group id")
		return
	}
	if err := h.groupRepo.Delete(r.Context(), program.ID, groupID); err != nil {
		writeFellowGroupError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "fellow group deleted"})
}
