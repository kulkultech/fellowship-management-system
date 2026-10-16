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

type feedbackItem struct {
	ApplicantID string    `json:"applicant_id,omitempty"`
	FellowName  string    `json:"fellow_name,omitempty"` // left out for mentors: fellows' feedback is anonymous to them
	AuthorName  string    `json:"author_name,omitempty"`
	Rating      *int      `json:"rating,omitempty"`
	Comment     string    `json:"comment"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type feedbackFellowRow struct {
	ApplicantID string        `json:"applicant_id"`
	FellowName  string        `json:"fellow_name"`
	FellowEmail string        `json:"fellow_email"`
	Feedback    *feedbackItem `json:"feedback,omitempty"`
}

type feedbackToMentorSummary struct {
	Average     float64        `json:"average"`
	Count       int            `json:"count"`
	FellowCount int            `json:"fellow_count"`
	Anonymous   bool           `json:"anonymous"`
	Items       []feedbackItem `json:"items"`
}

type sessionFeedbackResponse struct {
	Viewer       string `json:"viewer"` // "staff" or "fellow"
	MentorName   string `json:"mentor_name,omitempty"`
	FeedbackOpen bool   `json:"feedback_open"` // feedback opens when the session starts

	// Fellow view
	MyFeedback     *feedbackItem `json:"my_feedback,omitempty"`
	MentorFeedback *feedbackItem `json:"mentor_feedback,omitempty"`

	// Staff view
	ToMentor *feedbackToMentorSummary `json:"to_mentor,omitempty"`
	Fellows  []feedbackFellowRow      `json:"fellows,omitempty"`
}

type saveFeedbackRequest struct {
	Rating  *int   `json:"rating,omitempty"`
	Comment string `json:"comment"`
}

// feedbackContext loads the session and works out whether the caller is staff of its program
// or one of its fellows (returning that fellow's attendance row).
func (h *SessionHandler) feedbackContext(w http.ResponseWriter, r *http.Request) (*model.ProgramSession, *auth.Claims, bool, []model.SessionAttendance, *model.SessionAttendance, bool) {
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return nil, nil, false, nil, nil, false
	}
	claims := h.resolveClaims(r)
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, nil, false, nil, nil, false
	}
	session, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil || session == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return nil, nil, false, nil, nil, false
	}
	roster, err := h.sessionRepo.GetSessionAttendanceList(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session fellows")
		return nil, nil, false, nil, nil, false
	}

	if h.canEditWorkspaceDirectly(r.Context(), claims, session.ProgramID) {
		return session, claims, true, roster, nil, true
	}
	if claims.Email != "" {
		for i := range roster {
			if strings.EqualFold(roster[i].FellowEmail, claims.Email) {
				return session, claims, false, roster, &roster[i], true
			}
		}
	}
	httpx.Error(w, http.StatusForbidden, "you are not part of this session")
	return nil, nil, false, nil, nil, false
}

func toFeedbackItem(fb *model.SessionFeedback) *feedbackItem {
	if fb == nil {
		return nil
	}
	return &feedbackItem{
		ApplicantID: fb.ApplicantID.String(),
		AuthorName:  fb.AuthorName,
		Rating:      fb.Rating,
		Comment:     fb.Comment,
		UpdatedAt:   fb.UpdatedAt,
	}
}

// GetSessionFeedback handles GET /api/v1/sessions/{sessionId}/feedback.
// Fellows see their own feedback to the mentor and the mentor's feedback to them.
// Staff see every fellow's feedback to the mentor (anonymous for mentors) and their feedback to each fellow.
func (h *SessionHandler) GetSessionFeedback(w http.ResponseWriter, r *http.Request) {
	session, claims, isStaff, roster, me, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	all, err := h.feedbackRepo.ListBySession(r.Context(), session.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}

	resp := sessionFeedbackResponse{
		MentorName:   session.MentorName,
		FeedbackOpen: !time.Now().Before(session.StartTime),
	}

	if !isStaff {
		resp.Viewer = "fellow"
		for i := range all {
			if all[i].ApplicantID != me.ApplicantID {
				continue
			}
			switch all[i].Direction {
			case model.FeedbackToMentor:
				resp.MyFeedback = toFeedbackItem(&all[i])
				resp.MyFeedback.AuthorName = ""
			case model.FeedbackToFellow:
				resp.MentorFeedback = toFeedbackItem(&all[i])
			}
		}
		httpx.JSON(w, http.StatusOK, resp)
		return
	}

	resp.Viewer = "staff"
	anonymous := claims.Role == model.RoleMentor
	names := make(map[uuid.UUID]string, len(roster))
	for _, f := range roster {
		names[f.ApplicantID] = f.FellowName
	}
	toFellow := map[uuid.UUID]*model.SessionFeedback{}
	summary := &feedbackToMentorSummary{FellowCount: len(roster), Anonymous: anonymous, Items: []feedbackItem{}}
	ratingSum := 0
	for i := range all {
		fb := &all[i]
		if fb.Direction == model.FeedbackToFellow {
			toFellow[fb.ApplicantID] = fb
			continue
		}
		item := toFeedbackItem(fb)
		item.AuthorName = ""
		if anonymous {
			item.ApplicantID = ""
		} else {
			item.FellowName = names[fb.ApplicantID]
			if item.FellowName == "" {
				item.FellowName = fb.AuthorName
			}
		}
		summary.Items = append(summary.Items, *item)
		if fb.Rating != nil {
			summary.Count++
			ratingSum += *fb.Rating
		}
	}
	if summary.Count > 0 {
		summary.Average = math.Round(float64(ratingSum)/float64(summary.Count)*10) / 10
	}
	resp.ToMentor = summary

	resp.Fellows = make([]feedbackFellowRow, 0, len(roster))
	for _, f := range roster {
		resp.Fellows = append(resp.Fellows, feedbackFellowRow{
			ApplicantID: f.ApplicantID.String(),
			FellowName:  f.FellowName,
			FellowEmail: f.FellowEmail,
			Feedback:    toFeedbackItem(toFellow[f.ApplicantID]),
		})
	}
	httpx.JSON(w, http.StatusOK, resp)
}

func validateFeedback(w http.ResponseWriter, req *saveFeedbackRequest, ratingRequired, commentRequired bool) bool {
	req.Comment = strings.TrimSpace(req.Comment)
	if req.Rating != nil && *req.Rating == 0 {
		req.Rating = nil
	}
	if req.Rating == nil && ratingRequired {
		httpx.Error(w, http.StatusBadRequest, "please choose a rating from 1 to 5")
		return false
	}
	if req.Rating != nil && (*req.Rating < 1 || *req.Rating > 5) {
		httpx.Error(w, http.StatusBadRequest, "rating must be from 1 to 5")
		return false
	}
	if req.Comment == "" && commentRequired {
		httpx.Error(w, http.StatusBadRequest, "please write your feedback")
		return false
	}
	if len([]rune(req.Comment)) > maxFeedbackComment {
		httpx.Error(w, http.StatusBadRequest, "feedback is too long (max 2000 characters)")
		return false
	}
	return true
}

// SaveFeedbackToMentor handles PUT /api/v1/sessions/{sessionId}/feedback/mentor (fellows only).
func (h *SessionHandler) SaveFeedbackToMentor(w http.ResponseWriter, r *http.Request) {
	session, claims, isStaff, _, me, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	if isStaff || me == nil {
		httpx.Error(w, http.StatusForbidden, "only fellows of this session can give feedback to the mentor")
		return
	}
	if time.Now().Before(session.StartTime) {
		httpx.Error(w, http.StatusBadRequest, "feedback opens when the session starts")
		return
	}
	var req saveFeedbackRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if !validateFeedback(w, &req, true, false) {
		return
	}
	authorID := claims.UserID
	saved, err := h.feedbackRepo.Upsert(r.Context(), &model.SessionFeedback{
		SessionID: session.ID, ProgramID: session.ProgramID, Direction: model.FeedbackToMentor,
		ApplicantID: me.ApplicantID, AuthorUserID: &authorID, AuthorName: me.FellowName,
		Rating: req.Rating, Comment: req.Comment,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save feedback")
		return
	}
	item := toFeedbackItem(saved)
	item.AuthorName = ""
	httpx.JSON(w, http.StatusOK, item)
}

// SaveFeedbackToFellow handles PUT /api/v1/sessions/{sessionId}/feedback/fellows/{applicantId} (mentors and admins).
func (h *SessionHandler) SaveFeedbackToFellow(w http.ResponseWriter, r *http.Request) {
	session, claims, isStaff, roster, _, ok := h.feedbackContext(w, r)
	if !ok {
		return
	}
	if !isStaff {
		httpx.Error(w, http.StatusForbidden, "only mentors and admins can give feedback to fellows")
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
	if time.Now().Before(session.StartTime) {
		httpx.Error(w, http.StatusBadRequest, "feedback opens when the session starts")
		return
	}
	var req saveFeedbackRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if !validateFeedback(w, &req, false, true) {
		return
	}
	authorName := claims.Email
	if h.userRepo != nil {
		if u, err := h.userRepo.GetByID(r.Context(), claims.UserID); err == nil && u != nil && u.Name != "" {
			authorName = u.Name
		}
	}
	authorID := claims.UserID
	saved, err := h.feedbackRepo.Upsert(r.Context(), &model.SessionFeedback{
		SessionID: session.ID, ProgramID: session.ProgramID, Direction: model.FeedbackToFellow,
		ApplicantID: applicantID, AuthorUserID: &authorID, AuthorName: authorName,
		Rating: req.Rating, Comment: req.Comment,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save feedback")
		return
	}
	httpx.JSON(w, http.StatusOK, toFeedbackItem(saved))
}
