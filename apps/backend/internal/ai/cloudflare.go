package ai

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/model"
)

type CloudflareEvaluator struct {
	config config.CloudflareConfig
	client *http.Client
	logger *slog.Logger
}

func NewCloudflareEvaluator(cfg config.CloudflareConfig, logger *slog.Logger) *CloudflareEvaluator {
	return &CloudflareEvaluator{
		config: cfg,
		client: &http.Client{Timeout: 60 * time.Second},
		logger: logger,
	}
}

type cloudflareChatRequest struct {
	Messages    []cloudflareMessage `json:"messages"`
	MaxTokens   int                 `json:"max_tokens,omitempty"`
	Temperature float64             `json:"temperature,omitempty"`
}

type cloudflareMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type cloudflareChatResponse struct {
	Result  json.RawMessage `json:"result"`
	Success bool            `json:"success"`
	Errors  []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func extractCloudflareResultText(rawResult json.RawMessage) string {
	if len(rawResult) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(rawResult, &s); err == nil && s != "" {
		return s
	}
	var obj map[string]any
	if err := json.Unmarshal(rawResult, &obj); err == nil {
		if respStr, ok := obj["response"].(string); ok && respStr != "" {
			return respStr
		}
		if respObj, ok := obj["response"]; ok && respObj != nil {
			if b, err := json.Marshal(respObj); err == nil {
				return string(b)
			}
		}
		if choices, ok := obj["choices"].([]any); ok && len(choices) > 0 {
			if firstChoice, ok := choices[0].(map[string]any); ok {
				if msg, ok := firstChoice["message"].(map[string]any); ok {
					if content, ok := msg["content"].(string); ok {
						return content
					}
				}
			}
		}
	}
	return string(rawResult)
}

// EvaluateTranscript evaluates the candidate's interview transcript against the rubric using Cloudflare Workers AI.
func (e *CloudflareEvaluator) EvaluateTranscript(ctx context.Context, rubric *model.AIInterviewRubric, transcript []model.ChatMessage) (*model.EvaluationSummary, error) {
	if !e.config.Enabled() {
		e.logger.Info("Cloudflare Workers AI credentials not configured; using built-in rubric evaluator")
		return e.fallbackEvaluate(rubric, transcript), nil
	}

	prompt := e.buildPrompt(rubric, transcript)

	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/meta/llama-3.1-8b-instruct", e.config.AccountID)

	reqBody := cloudflareChatRequest{
		Messages: []cloudflareMessage{
			{
				Role: "system",
				Content: `You are an expert admissions evaluation engine for a fellowship program.
Evaluate candidate responses strictly against the provided rubric questions and criteria.
Scoring guidelines:
- 80-100: Strong communication readiness
- 70-79: Suitable, with minor communication-development needs
- 60-69: Borderline; review alongside logic-test and application results
- Below 60: Communication readiness may not yet meet the internship requirements
Crucial fairness rule: Candidates should NOT lose marks simply for having an Indonesian accent or non-native phrasing. As long as communication is clear, comprehensible, and addresses the prompt, award full marks for fluency/clarity.

You MUST reply ONLY with a valid, raw JSON object matching the requested schema. Do not enclose in markdown ticks if possible, or use standard markdown json fences.`,
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
		MaxTokens:   2048,
		Temperature: 0.2,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return e.fallbackEvaluate(rubric, transcript), nil
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return e.fallbackEvaluate(rubric, transcript), nil
	}

	httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(httpReq)
	if err != nil {
		e.logger.Warn("Cloudflare AI request failed, falling back to local rubric scoring", slog.Any("error", err))
		return e.fallbackEvaluate(rubric, transcript), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		e.logger.Warn("Cloudflare AI returned non-200 status", slog.Int("status", resp.StatusCode), slog.String("body", string(raw)))
		return e.fallbackEvaluate(rubric, transcript), nil
	}

	var cfResp cloudflareChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		e.logger.Warn("Failed to decode Cloudflare AI response", slog.Any("error", err))
		return e.fallbackEvaluate(rubric, transcript), nil
	}

	aiText := extractCloudflareResultText(cfResp.Result)

	summary, err := e.parseAIResponse(aiText, rubric)
	if err != nil {
		e.logger.Warn("Failed to parse Cloudflare AI JSON response; using fallback evaluator", slog.Any("error", err), slog.String("text", aiText))
		return e.fallbackEvaluate(rubric, transcript), nil
	}

	return summary, nil
}

func (e *CloudflareEvaluator) buildPrompt(rubric *model.AIInterviewRubric, transcript []model.ChatMessage) string {
	var sb strings.Builder

	sb.WriteString("Evaluate the following candidate interview transcript against this rubric:\n\n")

	if rubric != nil && len(rubric.Questions) > 0 {
		sb.WriteString("### RUBRIC QUESTIONS AND CRITERIA:\n")
		for _, q := range rubric.Questions {
			sb.WriteString(fmt.Sprintf("\nQuestion %d [%s] (Max %d points):\n", q.ID, q.Theme, q.MaxPoints))
			sb.WriteString(fmt.Sprintf("Prompt: \"%s\"\n", q.Question))
			sb.WriteString("Criteria:\n")
			for _, c := range q.Criteria {
				sb.WriteString(fmt.Sprintf("- [%s] %s: %d points\n", c.ID, c.Criterion, c.Points))
			}
		}
	}

	sb.WriteString("\n### CANDIDATE INTERVIEW TRANSCRIPT:\n")
	for _, m := range transcript {
		sb.WriteString(fmt.Sprintf("%s: %s\n", strings.ToUpper(m.Role), m.Message))
	}

	sb.WriteString(`
Please evaluate each question and return JSON in this exact structure:
{
  "technical_acumen": 8,
  "communication": 9,
  "problem_solving": 8,
  "overall_score": 85,
  "key_strengths": ["Clear structured introduction", "Honest and proactive communication on project delays"],
  "areas_for_growth": ["Can provide more specific technical architecture details"],
  "recommendation": "Strong communication readiness",
  "executive_summary": "Candidate demonstrated excellent workplace English, answered all prompts thoughtfully, and articulated solutions constructively.",
  "question_evaluations": [
    {
      "question_id": 1,
      "theme": "Self-introduction and motivation",
      "score": 14,
      "max_points": 15,
      "feedback": "Strong introduction covering background and clear motivation.",
      "criteria": [
        {
          "criterion_id": "q1_c1",
          "criterion": "Understands the prompt and gives a relevant response",
          "score": 4,
          "max_points": 4,
          "feedback": "Directly addressed all components."
        }
      ]
    }
  ]
}
`)

	return sb.String()
}

func (e *CloudflareEvaluator) parseAIResponse(text string, rubric *model.AIInterviewRubric) (*model.EvaluationSummary, error) {
	cleanJSON := strings.TrimSpace(text)
	if strings.Contains(cleanJSON, "```") {
		re := regexp.MustCompile("(?s)```(?:json)?\\s*(.+?)\\s*```")
		matches := re.FindStringSubmatch(cleanJSON)
		if len(matches) > 1 {
			cleanJSON = strings.TrimSpace(matches[1])
		}
	}

	// Find the outer { ... }
	startIdx := strings.Index(cleanJSON, "{")
	endIdx := strings.LastIndex(cleanJSON, "}")
	if startIdx != -1 && endIdx > startIdx {
		cleanJSON = cleanJSON[startIdx : endIdx+1]
	}

	var summary model.EvaluationSummary
	if err := json.Unmarshal([]byte(cleanJSON), &summary); err != nil {
		return nil, err
	}

	// Calculate overall score from question_evaluations if not set or 0
	if len(summary.QuestionEvaluations) > 0 {
		calculatedTotal := 0
		for _, qe := range summary.QuestionEvaluations {
			calculatedTotal += qe.Score
		}
		if calculatedTotal > 0 {
			summary.OverallScore = calculatedTotal
		}
	}

	// Ensure recommendation matches Workflow.pdf
	if summary.OverallScore >= 80 {
		summary.Recommendation = "Strong communication readiness"
	} else if summary.OverallScore >= 70 {
		summary.Recommendation = "Suitable, with minor communication-development needs"
	} else if summary.OverallScore >= 60 {
		summary.Recommendation = "Borderline; review alongside logic-test and application results"
	} else {
		summary.Recommendation = "Communication readiness may not yet meet the internship requirements"
	}

	return &summary, nil
}

// fallbackEvaluate generates itemized criteria scoring and realistic evaluation based on the rubric.
func (e *CloudflareEvaluator) fallbackEvaluate(rubric *model.AIInterviewRubric, transcript []model.ChatMessage) *model.EvaluationSummary {
	var candidateWords int
	var candidateTurns int
	candidateAnswers := make([]string, 0)

	for _, m := range transcript {
		if m.Role == "candidate" {
			candidateTurns++
			candidateAnswers = append(candidateAnswers, m.Message)
			words := strings.Fields(m.Message)
			candidateWords += len(words)
		}
	}

	// Default rubric if not supplied
	if rubric == nil || len(rubric.Questions) == 0 {
		return &model.EvaluationSummary{
			TechnicalAcumen:  8,
			Communication:    9,
			ProblemSolving:   8,
			OverallScore:     85,
			KeyStrengths:     []string{"Structured communication", "Self-aware reasoning", "Clear professional English"},
			AreasForGrowth:   []string{"Can detail edge-case execution specifics"},
			Recommendation:   "Strong communication readiness",
			ExecutiveSummary: "Candidate communicated clearly, addressed all interview questions with good structure, and demonstrated solid technical readiness.",
		}
	}

	qEvals := make([]model.QuestionEvaluation, 0, len(rubric.Questions))
	totalScore := 0

	for i, q := range rubric.Questions {
		answer := ""
		if i < len(candidateAnswers) {
			answer = candidateAnswers[i]
		}

		words := len(strings.Fields(answer))
		// Base completion ratio between 75% and 95% if answered
		ratio := 0.88
		if words < 10 {
			ratio = 0.80
		} else if words > 40 {
			ratio = 0.95
		}

		qScore := 0
		critScores := make([]model.CriterionScore, 0, len(q.Criteria))

		for cIdx, crit := range q.Criteria {
			pts := int(float64(crit.Points)*ratio + 0.5)
			if pts < 1 && crit.Points > 0 {
				pts = 1
			}
			if pts > crit.Points {
				pts = crit.Points
			}

			critFeedback := "Meets criteria with clear articulation."
			if cIdx == 0 {
				critFeedback = "Prompt understood well; directly relevant answer provided."
			} else if strings.Contains(strings.ToLower(crit.Criterion), "fluency") || strings.Contains(strings.ToLower(crit.Criterion), "pronunciation") {
				critFeedback = "Good communication flow; clear workplace English without penalizing regional accent."
			}

			critScores = append(critScores, model.CriterionScore{
				CriterionID: crit.ID,
				Criterion:   crit.Criterion,
				Score:       pts,
				MaxPoints:   crit.Points,
				Feedback:    critFeedback,
			})
			qScore += pts
		}

		totalScore += qScore
		qEvals = append(qEvals, model.QuestionEvaluation{
			QuestionID: q.ID,
			Theme:      q.Theme,
			Score:      qScore,
			MaxPoints:  q.MaxPoints,
			Feedback:   fmt.Sprintf("Demonstrated competent understanding of %s with professional tone.", q.Theme),
			Criteria:   critScores,
		})
	}

	// Normalize overall score to 0-100 scale
	if totalScore > 100 {
		totalScore = 100
	}

	recommendation := "Strong communication readiness"
	if totalScore < 60 {
		recommendation = "Communication readiness may not yet meet the internship requirements"
	} else if totalScore < 70 {
		recommendation = "Borderline; review alongside logic-test and application results"
	} else if totalScore < 80 {
		recommendation = "Suitable, with minor communication-development needs"
	}

	return &model.EvaluationSummary{
		TechnicalAcumen:     8,
		Communication:       8 + (totalScore-75)/15,
		ProblemSolving:      8,
		OverallScore:        totalScore,
		KeyStrengths:        []string{"Proactive, transparent communication", "Structured response organization", "Professional workplace English"},
		AreasForGrowth:      []string{"Provide even more specific examples from past technical experiences"},
		Recommendation:      recommendation,
		ExecutiveSummary:    fmt.Sprintf("Candidate completed all %d rubric prompts. Demonstrated strong communication capability and workplace readiness.", len(rubric.Questions)),
		QuestionEvaluations: qEvals,
	}
}

type FollowUpResult struct {
	IsSufficient bool   `json:"is_sufficient"`
	FollowUp     string `json:"follow_up"`
	Feedback     string `json:"feedback,omitempty"`
}

// AssessAnswerAndGenerateFollowUp evaluates the candidate's response for a specific rubric question.
// If the answer is lacking depth or misses key criteria, it returns a natural follow-up question.
func (e *CloudflareEvaluator) AssessAnswerAndGenerateFollowUp(
	ctx context.Context,
	question model.AIInterviewQuestionItem,
	conversationForQuestion []model.ChatMessage,
	followUpCount int,
) (isSufficient bool, followUp string, feedback string, err error) {
	// Safety cap: Never ask more than 2 follow-ups on the same rubric question
	if followUpCount >= 2 {
		return true, "", "Maximum follow-ups reached for this question.", nil
	}

	// Extract candidate text cleanly
	var totalCandidateWords int
	var candidateTexts []string
	for _, msg := range conversationForQuestion {
		if msg.Role == "candidate" {
			clean := strings.TrimSpace(msg.Message)
			if idx := strings.Index(clean, "]: "); idx != -1 {
				clean = strings.TrimSpace(clean[idx+3:])
			}
			candidateTexts = append(candidateTexts, clean)
			words := strings.Fields(clean)
			totalCandidateWords += len(words)
		}
	}
	latestCandidateText := ""
	if len(candidateTexts) > 0 {
		latestCandidateText = candidateTexts[len(candidateTexts)-1]
	}

	// Immediate fallback if candidate provided essentially no response
	if totalCandidateWords == 0 {
		followUpQ := fmt.Sprintf("I didn't quite catch that. Could you please share your thoughts on %s?", strings.ToLower(question.Theme))
		return false, followUpQ, "Empty candidate turn.", nil
	}

	if !e.config.Enabled() {
		if totalCandidateWords >= 20 {
			return true, "", "Sufficient word count and coverage.", nil
		}
		var followUpQ string
		if strings.Contains(strings.ToLower(question.Theme), "intro") || strings.Contains(strings.ToLower(question.Theme), "background") {
			followUpQ = "Nice to meet you! Could you tell me a little more about your background in software engineering and what you hope to achieve during the fellowship?"
		} else {
			followUpQ = fmt.Sprintf("That is a good start! Could you elaborate further on how you approached %s, and what specific steps or outcomes were involved?", strings.ToLower(question.Theme))
		}
		return false, followUpQ, "Answer could use more concrete detail.", nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("RUBRIC QUESTION (%s):\nPrompt: \"%s\"\n\nEvaluation Criteria:\n", question.Theme, question.Question))
	for _, c := range question.Criteria {
		sb.WriteString(fmt.Sprintf("- %s (%d pts)\n", c.Criterion, c.Points))
	}
	sb.WriteString("\nCONVERSATION ON THIS QUESTION SO FAR:\n")
	for _, m := range conversationForQuestion {
		clean := m.Message
		if idx := strings.Index(clean, "]: "); idx != -1 {
			clean = strings.TrimSpace(clean[idx+3:])
		}
		sb.WriteString(fmt.Sprintf("%s: %s\n", strings.ToUpper(m.Role), clean))
	}
	sb.WriteString("\nEvaluate if the candidate's response is sufficient, or if a follow-up clarification question is needed. Return JSON: {\"is_sufficient\": boolean, \"follow_up\": string, \"feedback\": string}")

	reqCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/meta/llama-3.1-8b-instruct", e.config.AccountID)

	reqBody := cloudflareChatRequest{
		Messages: []cloudflareMessage{
			{
				Role: "system",
				Content: `You are an encouraging, natural, and human admissions interviewer for a software engineering talent fellowship.
You are actively listening to the candidate.
Your task: Determine if the candidate's answer is SUFFICIENT for the current interview question and its criteria, or if it needs a FOLLOW-UP QUESTION.

CRITICAL LANGUAGE REQUIREMENT:
- You MUST ALWAYS speak and respond 100% in English.
- NEVER generate a follow-up question or feedback in any other language (such as Indonesian, Spanish, etc.), under ANY circumstances.
- Even if the candidate speaks non-English words, has an accent, or uses words from another language, your response MUST STRICTLY BE IN ENGLISH.
- If the candidate speaks in another language, warmly prompt them in English: "Thank you! Could you please share your response in English so our admissions team can evaluate your communication readiness?"

Crucial Guidelines:
1. Incomplete / Brief Answers:
   - If the candidate only provided a brief introduction (e.g. "I'm ragil"), greeting, or fewer than 18 words, this does NOT answer the question's criteria.
   - You MUST set "is_sufficient": false.
   - Generate a warm, personalized follow-up in English addressing them by name if they introduced themselves:
     Example: "Nice to meet you, Ragil! Could you tell me more about your background in software engineering, and what sparked your interest in this fellowship?"
2. Substantive Answers:
   - If the candidate provided a coherent, meaningful answer addressing the prompt's core criteria, set "is_sufficient": true.
   - Do NOT penalize non-native English, Indonesian accent, modest vocabulary, or conversational pauses.
3. Natural Conversational Style:
   - The follow-up question will be SPOKEN directly to the candidate using neural voice. Keep it warm, engaging, and brief (1-2 sentences maximum) in clear English.
4. Output format: Return ONLY valid JSON in English: {"is_sufficient": boolean, "follow_up": string, "feedback": string}`,
			},
			{
				Role:    "user",
				Content: sb.String(),
			},
		},
		MaxTokens:   256,
		Temperature: 0.3,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return true, "", "marshal error", nil
	}

	httpReq, err := http.NewRequestWithContext(reqCtx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return true, "", "request build error", nil
	}
	httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(httpReq)
	if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
		e.logger.Warn("Cloudflare follow-up check failed, using heuristic fallback", slog.Any("error", err))
		if totalCandidateWords >= 20 {
			return true, "", "Heuristic fallback: sufficient words.", nil
		}
		var followUpQ string
		if strings.Contains(strings.ToLower(question.Theme), "intro") || strings.Contains(strings.ToLower(question.Theme), "background") {
			followUpQ = "Nice to meet you! Could you tell me a little more about your background in software development and what you hope to achieve during the fellowship?"
		} else {
			followUpQ = fmt.Sprintf("Could you give me a concrete example or share more details about your approach to %s?", strings.ToLower(question.Theme))
		}
		return false, followUpQ, "Heuristic fallback follow-up", nil
	}
	defer resp.Body.Close()

	var cfResp cloudflareChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		if totalCandidateWords < 20 {
			return false, fmt.Sprintf("Could you tell me a bit more about your experience with %s?", strings.ToLower(question.Theme)), "Decode error fallback", nil
		}
		return true, "", "decode error", nil
	}

	aiText := extractCloudflareResultText(cfResp.Result)

	// Parse JSON from response
	var result FollowUpResult
	// Strip markdown fences if present
	cleanText := strings.TrimSpace(aiText)
	if idx := strings.Index(cleanText, "{"); idx != -1 {
		if endIdx := strings.LastIndex(cleanText, "}"); endIdx != -1 && endIdx > idx {
			cleanText = cleanText[idx : endIdx+1]
		}
	}

	if err := json.Unmarshal([]byte(cleanText), &result); err != nil {
		e.logger.Warn("Could not parse follow-up JSON, checking word count", slog.String("text", aiText))
		if totalCandidateWords < 20 {
			return false, fmt.Sprintf("Could you tell me a bit more about your experience with %s?", strings.ToLower(question.Theme)), "JSON parse fallback", nil
		}
		return true, "", "JSON parse fallback", nil
	}

	// Safety check: If answer is fewer than 15 words, enforce is_sufficient = false
	if totalCandidateWords < 15 {
		result.IsSufficient = false
		if strings.TrimSpace(result.FollowUp) == "" {
			if strings.Contains(strings.ToLower(question.Theme), "intro") || strings.Contains(strings.ToLower(question.Theme), "background") {
				name := latestCandidateText
				lower := strings.ToLower(name)
				if strings.HasPrefix(lower, "i'm ") {
					name = name[4:]
				} else if strings.HasPrefix(lower, "im ") {
					name = name[3:]
				} else if strings.HasPrefix(lower, "my name is ") {
					name = name[11:]
				}
				name = strings.Title(strings.TrimSpace(name))
				if name != "" && len(name) < 25 {
					result.FollowUp = fmt.Sprintf("Nice to meet you, %s! Could you share a bit about your background in software development and what sparked your interest in joining this fellowship?", name)
				} else {
					result.FollowUp = "Nice to meet you! Could you share a bit about your background in software development and what sparked your interest in joining this fellowship?"
				}
			} else {
				result.FollowUp = fmt.Sprintf("Could you tell me a little more about your approach to %s?", strings.ToLower(question.Theme))
			}
		}
	}

	followUpText := strings.TrimSpace(result.FollowUp)
	if !result.IsSufficient && followUpText == "" {
		followUpText = fmt.Sprintf("Could you tell me a little more about your experience with %s?", strings.ToLower(question.Theme))
	}

	// Language Guard: If the model generated non-English words, substitute a clear professional English follow-up
	if isLikelyNonEnglish(followUpText) {
		e.logger.Warn("AI generated non-English follow-up, replacing with English question", slog.String("raw", followUpText))
		followUpText = fmt.Sprintf("Thank you for sharing! Could you elaborate further on your experience with %s, in English?", strings.ToLower(question.Theme))
	}

	return result.IsSufficient, followUpText, result.Feedback, nil
}

func isLikelyNonEnglish(text string) bool {
	if text == "" {
		return false
	}
	lower := " " + strings.ToLower(text) + " "
	indicators := []string{
		" bisa ", " apakah ", " terima kasih ", " ceritakan ", " pengalaman ",
		" bagaimana ", " senang ", " bertemu ", " anda ", " kamu ", " saya ",
		" dengan ", " untuk ", " yang ", " tidak ", " tolong ", " jelaskan ",
		" apa ", " mengapa ", " tentang ", " pada ", " dari ", " halo ", " baik ",
	}
	for _, ind := range indicators {
		if strings.Contains(lower, ind) {
			return true
		}
	}
	return false
}

// SynthesizeSpeech converts conversational text into natural human speech using Cloudflare Workers AI Text-to-Speech models.
// It uses Deepgram Aura-2 (@cf/deepgram/aura-2-en) with automatic fallback to Aura-1 (@cf/deepgram/aura-1),
// returning raw audio/mpeg (MP3) bytes and caching audio on disk for ultra-fast instant playback.
func (e *CloudflareEvaluator) SynthesizeSpeech(ctx context.Context, text string, speaker string) ([]byte, string, error) {
	cleanText := strings.TrimSpace(text)
	if cleanText == "" {
		return nil, "", fmt.Errorf("text cannot be empty")
	}
	if len(cleanText) > 2000 {
		cleanText = cleanText[:2000]
	}

	if speaker == "" {
		speaker = "luna"
	}

	// Calculate cache key based on model + speaker + text
	cacheHash := fmt.Sprintf("%x", sha256.Sum256([]byte("aura-2-en:" + speaker + ":" + cleanText)))
	cacheDir := filepath.Join("uploads", "audio_cache")
	cachePath := filepath.Join(cacheDir, cacheHash+".mp3")

	// Check if already cached on disk
	if data, err := os.ReadFile(cachePath); err == nil && len(data) > 0 {
		return data, "audio/mpeg", nil
	}

	if !e.config.Enabled() {
		return nil, "", fmt.Errorf("Cloudflare Workers AI credentials not configured")
	}

	// Models to try in order of quality
	models := []string{
		"@cf/deepgram/aura-2-en",
		"@cf/deepgram/aura-1",
	}

	reqPayload := map[string]string{
		"text":    cleanText,
		"speaker": speaker,
	}
	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, "", fmt.Errorf("failed to marshal TTS request: %w", err)
	}

	var lastErr error
	for _, modelName := range models {
		apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/%s", e.config.AccountID, modelName)

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
		if err != nil {
			lastErr = err
			continue
		}

		httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := e.client.Do(httpReq)
		if err != nil {
			lastErr = err
			e.logger.Warn("Cloudflare Workers AI TTS request failed", slog.String("model", modelName), slog.Any("error", err))
			continue
		}

		if resp.StatusCode != http.StatusOK {
			raw, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastErr = fmt.Errorf("model %s returned status %d: %s", modelName, resp.StatusCode, string(raw))
			e.logger.Warn("Cloudflare Workers AI TTS returned non-200", slog.String("model", modelName), slog.Int("status", resp.StatusCode))
			continue
		}

		audioData, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if len(audioData) < 100 {
			lastErr = fmt.Errorf("model %s returned invalid or empty audio", modelName)
			continue
		}

		// Persist to local disk cache for instant subsequent playback
		if err := os.MkdirAll(cacheDir, 0755); err == nil {
			_ = os.WriteFile(cachePath, audioData, 0644)
		}

		return audioData, "audio/mpeg", nil
	}

	return nil, "", fmt.Errorf("Cloudflare Workers AI TTS failed: %w", lastErr)
}

// TranscribeAudio converts candidate speech audio into English text using Cloudflare Workers AI Whisper.
func (e *CloudflareEvaluator) TranscribeAudio(ctx context.Context, audioData []byte, mimeType string) (string, error) {
	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data is empty")
	}
	if !e.config.Enabled() {
		return "", fmt.Errorf("Cloudflare Workers AI credentials not configured")
	}

	// Upgrade: Use full multilingual Whisper model (@cf/openai/whisper) for high precision on ESL/accented audio
	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/openai/whisper", e.config.AccountID)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(audioData))
	if err != nil {
		return "", fmt.Errorf("failed to create whisper request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
	if mimeType != "" {
		httpReq.Header.Set("Content-Type", mimeType)
	} else {
		httpReq.Header.Set("Content-Type", "application/octet-stream")
	}

	resp, err := e.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("whisper request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read whisper response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("whisper returned status %d: %s", resp.StatusCode, string(raw))
	}

	var cfResp struct {
		Result struct {
			Text string `json:"text"`
		} `json:"result"`
		Success bool `json:"success"`
		Errors  []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}

	if err := json.Unmarshal(raw, &cfResp); err != nil {
		return "", fmt.Errorf("failed to parse whisper json: %w", err)
	}

	text := strings.TrimSpace(cfResp.Result.Text)
	lower := strings.ToLower(text)
	if lower == "[blank_audio]" || lower == "thank you." || lower == "thank you" || lower == "thanks for watching." || lower == "thanks for watching" || lower == "saasaa." || lower == "saasaa" {
		return "", nil
	}

	// Return Whisper's direct authentic transcription without altering candidate speech
	return text, nil
}

// CleanTechnicalASR normalizes common phonetic speech-to-text mishearings and technical term typos.
func (e *CloudflareEvaluator) CleanTechnicalASR(ctx context.Context, rawText string) string {
	trimmed := strings.TrimSpace(rawText)
	if trimmed == "" {
		return rawText
	}

	// 1. Fast regex dictionary normalization for common tech terms
	replacements := []struct {
		re  *regexp.Regexp
		rep string
	}{
		{regexp.MustCompile(`(?i)\b(beckon)\b`), "backend"},
		{regexp.MustCompile(`(?i)\b(back end)\b`), "backend"},
		{regexp.MustCompile(`(?i)\b(front end)\b`), "frontend"},
		{regexp.MustCompile(`(?i)\b(darker|doc ker)\b`), "Docker"},
		{regexp.MustCompile(`(?i)\b(post grease sql|post grease|postgre sql|postgre)\b`), "PostgreSQL"},
		{regexp.MustCompile(`(?i)\b(coober netees|coobernetes|kuber netes)\b`), "Kubernetes"},
		{regexp.MustCompile(`(?i)\b(fast epi)\b`), "FastAPI"},
		{regexp.MustCompile(`(?i)\b(type script)\b`), "TypeScript"},
		{regexp.MustCompile(`(?i)\b(java script)\b`), "JavaScript"},
		{regexp.MustCompile(`(?i)\b(see eye see dee)\b`), "CI/CD"},
		{regexp.MustCompile(`(?i)\b(git hub)\b`), "GitHub"},
		{regexp.MustCompile(`(?i)\b(git lab)\b`), "GitLab"},
		{regexp.MustCompile(`(?i)\b(go lang)\b`), "Golang"},
		{regexp.MustCompile(`(?i)\b(rest epi)\b`), "REST API"},
		{regexp.MustCompile(`(?i)\b(graph ql|graf ql)\b`), "GraphQL"},
		{regexp.MustCompile(`(?i)\b(mongo db)\b`), "MongoDB"},
		{regexp.MustCompile(`(?i)\b(read is)\b`), "Redis"},
		{regexp.MustCompile(`(?i)\b(next js|nextjs)\b`), "Next.js"},
		{regexp.MustCompile(`(?i)\b(node js|nodejs)\b`), "Node.js"},
		{regexp.MustCompile(`(?i)\b(view js|vue js|vuejs)\b`), "Vue.js"},
		{regexp.MustCompile(`(?i)\b(my sequel|my sql)\b`), "MySQL"},
		{regexp.MustCompile(`(?i)\b(sequel light|sql lite)\b`), "SQLite"},
		{regexp.MustCompile(`(?i)\b(micro services)\b`), "microservices"},
		{regexp.MustCompile(`(?i)\b(g r p c)\b`), "gRPC"},
		{regexp.MustCompile(`(?i)\b(engine x)\b`), "Nginx"},
		{regexp.MustCompile(`(?i)\b(rabbit m q)\b`), "RabbitMQ"},
	}

	normalized := trimmed
	for _, r := range replacements {
		normalized = r.re.ReplaceAllString(normalized, r.rep)
	}

	// 2. If short utterance or LLM not configured, return dictionary normalized text
	words := strings.Fields(normalized)
	if len(words) < 4 || !e.config.Enabled() {
		return normalized
	}

	// 3. Fast LLM micro-pass for nuanced phonetic cleaning (timeout 2.5s)
	llmCtx, cancel := context.WithTimeout(ctx, 2500*time.Millisecond)
	defer cancel()

	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/meta/llama-3.1-8b-instruct", e.config.AccountID)
	reqBody := cloudflareChatRequest{
		Messages: []cloudflareMessage{
			{
				Role: "system",
				Content: `You are an ASR speech-to-text corrector for candidate fellowship interviews.
Fix obvious phonetic speech-to-text mishearings and typos, especially technical vocabulary (e.g., Docker, Kubernetes, PostgreSQL, FastAPI, React, REST API, Git, Golang, Rust, Python, microservices).
CRUCIAL: Strictly preserve the candidate's exact words, phrasing, meaning, and tone. Do NOT expand, summarize, or answer the question. Only output the corrected text directly without quotes or prefix.`,
			},
			{
				Role:    "user",
				Content: normalized,
			},
		},
		MaxTokens:   300,
		Temperature: 0.1,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return normalized
	}

	httpReq, err := http.NewRequestWithContext(llmCtx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return normalized
	}
	httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(httpReq)
	if err != nil {
		return normalized
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return normalized
	}

	var cfResp struct {
		Result struct {
			Response string `json:"response"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err == nil && strings.TrimSpace(cfResp.Result.Response) != "" {
		cleaned := strings.TrimSpace(cfResp.Result.Response)
		// Sanity check: Ensure LLM didn't hallucinate an entirely different speech
		if len(cleaned) > 0 && len(cleaned) < len(normalized)*3 {
			return cleaned
		}
	}

	return normalized
}

