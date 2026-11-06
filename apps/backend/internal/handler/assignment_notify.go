package handler

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

// WithEmail lets the handler email fellows about assignments they are given.
func (h *AssignmentHandler) WithEmail(emailSvc email.Service, orgRepo *repository.OrgRepository, frontendURL string) *AssignmentHandler {
	h.emailSvc, h.orgRepo, h.frontendURL = emailSvc, orgRepo, frontendURL
	return h
}

// programFellows lists the fellows admitted to a program's room.
func (h *AssignmentHandler) programFellows(ctx context.Context, programID uuid.UUID) []model.Applicant {
	if h.applicantRepo == nil {
		return nil
	}
	applicants, err := h.applicantRepo.ListByProgram(ctx, programID, "")
	if err != nil {
		return nil
	}
	fellows := make([]model.Applicant, 0, len(applicants))
	for _, a := range applicants {
		if isProgramFellow(a) {
			fellows = append(fellows, a)
		}
	}
	return fellows
}

// assignmentRecipients returns the fellows an assignment is for now but was not for before
// (before is nil for a new assignment), so each fellow hears about it once.
func assignmentRecipients(fellows []model.Applicant, before, after *model.ProgramAssignment) []model.Applicant {
	var out []model.Applicant
	for _, f := range fellows {
		if f.Email == "" || !assignmentIsFor(f, after) {
			continue
		}
		if before != nil && assignmentIsFor(f, before) {
			continue
		}
		out = append(out, f)
	}
	return out
}

// notifyAssignment emails the fellows who were just given an assignment, in the background.
func (h *AssignmentHandler) notifyAssignment(ctx context.Context, before, after *model.ProgramAssignment) {
	if h.emailSvc == nil || after == nil || after.Status == model.AssignmentStatusDraft {
		return
	}
	recipients := assignmentRecipients(h.programFellows(ctx, after.ProgramID), before, after)
	if len(recipients) == 0 {
		return
	}

	programName := "your fellowship program"
	link := fmt.Sprintf("%s/candidate/dashboard", h.frontendURL)
	if prog, err := h.programRepo.GetByID(ctx, after.ProgramID); err == nil && prog != nil {
		if prog.Name != "" {
			programName = prog.Name
		}
		if h.orgRepo != nil {
			if org, err := h.orgRepo.GetByID(ctx, prog.OrganizationID); err == nil && org != nil && org.Slug != "" {
				link = fmt.Sprintf("%s/programs/%s/%s/room?section=assignments&item=%s", h.frontendURL, org.Slug, prog.Slug, after.ID)
			}
		}
	}

	a := *after
	go func() {
		for _, f := range recipients {
			_ = h.emailSvc.SendAssignmentEmail(f.Email, f.FullName, programName, &a, link)
		}
	}()
}
