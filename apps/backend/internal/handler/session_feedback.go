package handler

import (
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
)

const maxFeedbackComment = 2000

// Who is looking at a session's feedback
const (
	feedbackViewerFellow = "fellow"
	feedbackViewerMentor = "mentor"
	feedbackViewerAdmin  = "admin" // the program's organizers
)

type feedbackEntry struct {
	ApplicantID string         `json:"applicant_id,omitempty"`
	AuthorName  string         `json:"author_name,omitempty"`
	AuthorRole  string         `json:"author_role,omitempty"` // "fellow" or "mentor"
	Scores      map[string]int `json:"scores"`
	Comment     string         `json:"comment,omitempty"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type feedbackSummary struct {
	Averages map[string]float64 `json:"averages"` // question key -> average score
	Count    int                `json:"count"`
	Items    []feedbackEntry    `json:"items"`
}

type feedbackFellowRow struct {
	ApplicantID string         `json:"applicant_id"`
	FellowName  string         `json:"fellow_name"`
	FellowEmail string         `json:"fellow_email"`
	Feedback    *feedbackEntry `json:"feedback,omitempty"`
}

type sessionFeedbackResponse struct {
	Viewer       string                                                `json:"viewer"` // fellow, mentor or admin
	MentorName   string                                                `json:"mentor_name,omitempty"`
	FeedbackOpen bool                                                  `json:"feedback_open"` // opens when a mentor ends the session
	FellowCount  int                                                   `json:"fellow_count"`
	Forms        map[model.SessionFeedbackDirection]model.FeedbackForm `json:"forms"`
	// The viewer's own feedback, by direction
	Mine map[model.SessionFeedbackDirection]*feedbackEntry `json:"mine"`

	// Fellow: only the scores the mentor gave them
	MyResults *feedbackEntry `json:"my_results,omitempty"`

	// Mentor and organizers: what fellows said about the mentor, with names
	AboutMentor *feedbackSummary `json:"about_mentor,omitempty"`
	// Mentor and organizers: feedback to each fellow
	Fellows []feedbackFellowRow `json:"fellows,omitempty"`
	// Organizers: feedback to the organizers from fellows and from mentors
	ToOrganizersFromFellows *feedbackSummary `json:"to_organizers_from_fellows,omitempty"`
	ToOrganizersFromMentors *feedbackSummary `json:"to_organizers_from_mentors,omitempty"`
}

type saveFeedbackRequest struct {
	Scores  map[string]int `json:"scores"`
	Comment string         `json:"comment"`
}

// feedbackContext loads the session and works out whether the caller is a fellow of it, one of
// its program's mentors, or an organizer.
func (h *SessionHandler) feedbackContext(w http.ResponseWriter, r *http.Request) (*model.ProgramSession, *auth.Claims, string, []model.SessionAttendance, *model.SessionAttendance, bool) {
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return nil, nil, "", nil, nil, false
	}
	claims := h.resolveClaims(r)
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, nil, "", nil, nil, false
	}
	session, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil || session == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return nil, nil, "", nil, nil, false
	}
	roster, err := h.sessionRepo.GetSessionAttendanceList(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session fellows")
		return nil, nil, "", nil, nil, false
	}

	if h.canEditWorkspaceDirectly(r.Context(), claims, session.ProgramID) {
		viewer := feedbackViewerAdmin
		if claims.Role == model.RoleMentor {
			viewer = feedbackViewerMentor
		}
		return session, claims, viewer, roster, nil, true
	}
	if claims.Email != "" {
		for i := range roster {
			if strings.EqualFold(roster[i].FellowEmail, claims.Email) {
				return session, claims, feedbackViewerFellow, roster, &roster[i], true
			}
		}
	}
	httpx.Error(w, http.StatusForbidden, "you are not part of this session")
	return nil, nil, "", nil, nil, false
}

func entryOf(fb *model.SessionFeedback, role string) *feedbackEntry {
	if fb == nil {
		return nil
	}
	e := &feedbackEntry{AuthorName: fb.AuthorName, AuthorRole: role, Scores: fb.Scores, Comment: fb.Comment, UpdatedAt: fb.UpdatedAt}
	if fb.ApplicantID != uuid.Nil {
		e.ApplicantID = fb.ApplicantID.String()
	}
	if e.Scores == nil {
		e.Scores = map[string]int{}
	}
	return e
}

func summarize(items []*model.SessionFeedback, role string) *feedbackSummary {
	sum := &feedbackSummary{Averages: map[string]float64{}, Items: []feedbackEntry{}}
	totals, counts := map[string]int{}, map[string]int{}
	for _, fb := range items {
		sum.Items = append(sum.Items, *entryOf(fb, role))
		for k, v := range fb.Scores {
			totals[k] += v
			counts[k]++
		}
	}
	for k, t := range totals {
		sum.Averages[k] = math.Round(float64(t)/float64(counts[k])*10) / 10
	}
	sum.Count = len(items)
	return sum
}

// GetSessionFeedback handles GET /api/v1/sessions/{sessionId}/feedback.
//   - Fellows see their own feedback and only the scores their mentor gave them.
//   - Mentors see what fellows said about the mentor (with names) and their feedback to each fellow.
//   - Organizers see everything, including the feedback to the organizers.
func (h *SessionHandler) GetSessionFeedback(w http.ResponseWriter, r *http.Request) {
	session, claims, viewer, roster, me, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	all, err := h.feedbackRepo.ListBySession(r.Context(), session.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}

	resp := sessionFeedbackResponse{
		Viewer:       viewer,
		MentorName:   session.MentorName,
		FeedbackOpen: session.EndedAt != nil,
		FellowCount:  len(roster),
		Forms:        model.FeedbackForms,
		Mine:         map[model.SessionFeedbackDirection]*feedbackEntry{},
	}

	byDirection := map[model.SessionFeedbackDirection][]*model.SessionFeedback{}
	for i := range all {
		byDirection[all[i].Direction] = append(byDirection[all[i].Direction], &all[i])
	}

	if viewer == feedbackViewerFellow {
		for _, d := range []model.SessionFeedbackDirection{model.FeedbackToMentor, model.FeedbackFellowToOrganizer} {
			for _, fb := range byDirection[d] {
				if fb.ApplicantID == me.ApplicantID {
					resp.Mine[d] = entryOf(fb, feedbackViewerFellow)
				}
			}
		}
		for _, fb := range byDirection[model.FeedbackToFellow] {
			if fb.ApplicantID == me.ApplicantID {
				// Only the scores: not the mentor's notes, and not who wrote them
				resp.MyResults = &feedbackEntry{Scores: fb.Scores, UpdatedAt: fb.UpdatedAt}
			}
		}
		httpx.JSON(w, http.StatusOK, resp)
		return
	}

	// Mentors and organizers
	resp.AboutMentor = summarize(byDirection[model.FeedbackToMentor], feedbackViewerFellow)
	toFellow := map[uuid.UUID]*model.SessionFeedback{}
	for _, fb := range byDirection[model.FeedbackToFellow] {
		toFellow[fb.ApplicantID] = fb
	}
	resp.Fellows = make([]feedbackFellowRow, 0, len(roster))
	for _, f := range roster {
		resp.Fellows = append(resp.Fellows, feedbackFellowRow{
			ApplicantID: f.ApplicantID.String(),
			FellowName:  f.FellowName,
			FellowEmail: f.FellowEmail,
			Feedback:    entryOf(toFellow[f.ApplicantID], feedbackViewerMentor),
		})
	}

	if viewer == feedbackViewerMentor {
		for _, fb := range byDirection[model.FeedbackMentorToOrganizer] {
			if fb.AuthorUserID != nil && *fb.AuthorUserID == claims.UserID {
				resp.Mine[model.FeedbackMentorToOrganizer] = entryOf(fb, feedbackViewerMentor)
			}
		}
	} else {
		resp.ToOrganizersFromFellows = summarize(byDirection[model.FeedbackFellowToOrganizer], feedbackViewerFellow)
		resp.ToOrganizersFromMentors = summarize(byDirection[model.FeedbackMentorToOrganizer], feedbackViewerMentor)
	}
	httpx.JSON(w, http.StatusOK, resp)
}

// validateFeedback checks that every question of the form has a 1-5 score.
func validateFeedback(w http.ResponseWriter, req *saveFeedbackRequest, direction model.SessionFeedbackDirection) (*int, bool) {
	form := model.FeedbackForms[direction]
	req.Comment = strings.TrimSpace(req.Comment)
	scores := map[string]int{}
	total := 0
	for _, q := range form.Questions {
		v, ok := req.Scores[q.Key]
		if !ok || v < 1 || v > 5 {
			httpx.Error(w, http.StatusBadRequest, "please rate every question from 1 to 5 ("+q.Label+" is missing)")
			return nil, false
		}
		scores[q.Key] = v
		total += v
	}
	req.Scores = scores // drop anything that is not a question of this form
	if len([]rune(req.Comment)) > maxFeedbackComment {
		httpx.Error(w, http.StatusBadRequest, "feedback is too long (max 2000 characters)")
		return nil, false
	}
	avg := int(math.Round(float64(total) / float64(len(form.Questions))))
	return &avg, true
}

func (h *SessionHandler) authorName(r *http.Request, claims *auth.Claims) string {
	if h.userRepo != nil {
		if u, err := h.userRepo.GetByID(r.Context(), claims.UserID); err == nil && u != nil && u.Name != "" {
			return u.Name
		}
	}
	return claims.Email
}

func (h *SessionHandler) saveFeedback(w http.ResponseWriter, r *http.Request, session *model.ProgramSession, fb *model.SessionFeedback) {
	if session.EndedAt == nil {
		httpx.Error(w, http.StatusBadRequest, "feedback opens when the mentor ends the session")
		return
	}
	var req saveFeedbackRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	rating, ok := validateFeedback(w, &req, fb.Direction)
	if !ok {
		return
	}
	fb.SessionID, fb.ProgramID = session.ID, session.ProgramID
	fb.Scores, fb.Rating, fb.Comment = req.Scores, rating, req.Comment
	saved, err := h.feedbackRepo.Upsert(r.Context(), fb)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save feedback")
		return
	}
	httpx.JSON(w, http.StatusOK, entryOf(saved, ""))
}

// SaveFeedbackToMentor handles PUT /api/v1/sessions/{sessionId}/feedback/mentor (fellows only).
func (h *SessionHandler) SaveFeedbackToMentor(w http.ResponseWriter, r *http.Request) {
	session, claims, viewer, _, me, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	if viewer != feedbackViewerFellow {
		httpx.Error(w, http.StatusForbidden, "only fellows of this session can give feedback to the mentor")
		return
	}
	authorID := claims.UserID
	h.saveFeedback(w, r, session, &model.SessionFeedback{
		Direction: model.FeedbackToMentor, ApplicantID: me.ApplicantID, AuthorUserID: &authorID, AuthorName: me.FellowName,
	})
}

// SaveFeedbackToOrganizer handles PUT /api/v1/sessions/{sessionId}/feedback/organizer (fellows and mentors).
func (h *SessionHandler) SaveFeedbackToOrganizer(w http.ResponseWriter, r *http.Request) {
	session, claims, viewer, _, me, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	authorID := claims.UserID
	switch viewer {
	case feedbackViewerFellow:
		h.saveFeedback(w, r, session, &model.SessionFeedback{
			Direction: model.FeedbackFellowToOrganizer, ApplicantID: me.ApplicantID, AuthorUserID: &authorID, AuthorName: me.FellowName,
		})
	case feedbackViewerMentor:
		h.saveFeedback(w, r, session, &model.SessionFeedback{
			Direction: model.FeedbackMentorToOrganizer, AuthorUserID: &authorID, AuthorName: h.authorName(r, claims),
		})
	default:
		httpx.Error(w, http.StatusForbidden, "organizers receive this feedback; they do not give it")
	}
}

// SaveFeedbackToFellow handles PUT /api/v1/sessions/{sessionId}/feedback/fellows/{applicantId} (mentors and organizers).
func (h *SessionHandler) SaveFeedbackToFellow(w http.ResponseWriter, r *http.Request) {
	session, claims, viewer, roster, _, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	if viewer == feedbackViewerFellow {
		httpx.Error(w, http.StatusForbidden, "only mentors and organizers can give feedback to fellows")
		return
	}
	applicantID, err := uuid.Parse(chi.URLParam(r, "applicantId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid fellow id")
		return
	}
	inSession := false
	for _, f := range roster {
		if f.ApplicantID == applicantID {
			inSession = true
			break
		}
	}
	if !inSession {
		httpx.Error(w, http.StatusBadRequest, "this fellow is not part of the session")
		return
	}
	authorID := claims.UserID
	h.saveFeedback(w, r, session, &model.SessionFeedback{
		Direction: model.FeedbackToFellow, ApplicantID: applicantID, AuthorUserID: &authorID, AuthorName: h.authorName(r, claims),
	})
}
