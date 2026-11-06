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
	return programFellows(ctx, h.applicantRepo, programID)
}

func programFellows(ctx context.Context, applicantRepo *repository.ApplicantRepository, programID uuid.UUID) []model.Applicant {
	if applicantRepo == nil {
		return nil
	}
	applicants, err := applicantRepo.ListByProgram(ctx, programID, "")
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

	programName, link := assignmentLink(ctx, h.programRepo, h.orgRepo, h.frontendURL, after)

	a := *after
	go func() {
		for _, f := range recipients {
			_ = h.emailSvc.SendAssignmentEmail(f.Email, f.FullName, programName, &a, link)
		}
	}()
}

// programInfo returns a program's name and its room address (empty if unknown).
func programInfo(ctx context.Context, programRepo *repository.ProgramRepository, orgRepo *repository.OrgRepository, frontendURL string, programID uuid.UUID) (name, roomURL string) {
	name = "your fellowship program"
	if programRepo == nil {
		return name, ""
	}
	prog, err := programRepo.GetByID(ctx, programID)
	if err != nil || prog == nil {
		return name, ""
	}
	if prog.Name != "" {
		name = prog.Name
	}
	if orgRepo != nil {
		if org, err := orgRepo.GetByID(ctx, prog.OrganizationID); err == nil && org != nil && org.Slug != "" {
			roomURL = fmt.Sprintf("%s/programs/%s/%s/room", frontendURL, org.Slug, prog.Slug)
		}
	}
	return name, roomURL
}

// assignmentLink returns the program's name and a link that opens the assignment in the room.
func assignmentLink(ctx context.Context, programRepo *repository.ProgramRepository, orgRepo *repository.OrgRepository, frontendURL string, a *model.ProgramAssignment) (programName, link string) {
	programName, roomURL := programInfo(ctx, programRepo, orgRepo, frontendURL, a.ProgramID)
	if roomURL == "" {
		return programName, fmt.Sprintf("%s/candidate/dashboard", frontendURL)
	}
	return programName, fmt.Sprintf("%s?section=assignments&item=%s", roomURL, a.ID)
}
