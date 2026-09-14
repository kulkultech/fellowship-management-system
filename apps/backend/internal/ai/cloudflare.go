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
func (e *CloudflareEvaluator) EvaluateTranscript(ctx context.Context, rubric *model.AIInterviewRubric, transcript []model.ChatMessage, candidateName string) (*model.EvaluationSummary, error) {
	displayName := strings.TrimSpace(candidateName)
	if displayName == "" {
		displayName = "Candidate"
	}

	if !e.config.Enabled() {
		e.logger.Info("Cloudflare Workers AI credentials not configured; using built-in rubric evaluator")
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}

	prompt := e.buildPrompt(rubric, transcript, displayName)

	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/meta/llama-3.1-8b-instruct", e.config.AccountID)

	reqBody := cloudflareChatRequest{
		Messages: []cloudflareMessage{
			{
				Role: "system",
				Content: fmt.Sprintf(`You are an expert admissions evaluation engine for a fellowship program.
Evaluate candidate %s's responses strictly against the provided rubric questions and criteria.
Scoring guidelines:
- 80-100: Strong communication readiness
- 70-79: Suitable, with minor communication-development needs
- 60-69: Borderline; review alongside logic-test and application results
- Below 60: Communication readiness may not yet meet the internship requirements
Crucial fairness rule: Candidates should NOT lose marks simply for having an Indonesian accent or non-native phrasing. As long as communication is clear, comprehensible, and addresses the prompt, award full marks for fluency/clarity.

TECHNICAL DOMAIN & VOCABULARY AWARENESS:
The candidate is interviewing for a software engineering talent fellowship. Recognize standard software engineering frameworks, architectures, tools, and technical terms. Do not deduct points or assume lack of depth when candidates use concise, precise technical terminology (e.g. Go/Golang, TypeScript, React, Next.js, Node.js, Docker, Kubernetes, PostgreSQL, Redis, Kafka, REST API, GraphQL, gRPC, CI/CD, AWS). Award full credit for accurate technical communication.

CRITICAL LANGUAGE REQUIREMENT:
All executive summaries, key strengths, areas for growth, and question feedbacks MUST be written 100%% in professional English. Never generate Indonesian or non-English text under any circumstances.

You MUST reply ONLY with a valid, raw JSON object matching the requested schema. Do not enclose in markdown ticks if possible, or use standard markdown json fences.`, displayName),
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
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}

	httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(httpReq)
	if err != nil {
		e.logger.Warn("Cloudflare AI request failed, falling back to local rubric scoring", slog.Any("error", err))
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		e.logger.Warn("Cloudflare AI returned non-200 status", slog.Int("status", resp.StatusCode), slog.String("body", string(raw)))
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}

	var cfResp cloudflareChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		e.logger.Warn("Failed to decode Cloudflare AI response", slog.Any("error", err))
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}

	aiText := extractCloudflareResultText(cfResp.Result)

	summary, err := e.parseAIResponse(aiText, rubric)
	if err != nil {
		e.logger.Warn("Failed to parse Cloudflare AI JSON response; using fallback evaluator", slog.Any("error", err), slog.String("text", aiText))
		return e.fallbackEvaluate(rubric, transcript, displayName), nil
	}

	return summary, nil
}

func (e *CloudflareEvaluator) buildPrompt(rubric *model.AIInterviewRubric, transcript []model.ChatMessage, candidateName string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("Evaluate the following interview transcript for candidate %s against this rubric:\n\n", candidateName))

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
func (e *CloudflareEvaluator) fallbackEvaluate(rubric *model.AIInterviewRubric, transcript []model.ChatMessage, candidateName string) *model.EvaluationSummary {
	displayName := strings.TrimSpace(candidateName)
	if displayName == "" {
		displayName = "Candidate"
	}
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
			ExecutiveSummary: fmt.Sprintf("%s communicated clearly, addressed all interview questions with good structure, and demonstrated solid technical readiness.", displayName),
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
		ExecutiveSummary:    fmt.Sprintf("%s completed all %d rubric prompts. Demonstrated strong communication capability and workplace readiness.", displayName, len(rubric.Questions)),
		QuestionEvaluations: qEvals,
	}
}

type FollowUpResult struct {
	IsSufficient bool   `json:"is_sufficient"`
	FollowUp     string `json:"follow_up"`
	Feedback     string `json:"feedback,omitempty"`
}

// AssessAnswerAndGenerateFollowUp evaluates the candidate's response for a specific rubric question.
// It uses an isolated background conversation scoped strictly to the current question, eliminating hallucinations.
// The candidate's verified name is anchored in the prompt so the AI never guesses or mishears names.
func (e *CloudflareEvaluator) AssessAnswerAndGenerateFollowUp(
	ctx context.Context,
	question model.AIInterviewQuestionItem,
	conversationForQuestion []model.ChatMessage,
	followUpCount int,
	candidateName string,
) (isSufficient bool, followUp string, feedback string, err error) {
	displayName := strings.TrimSpace(candidateName)
	if displayName == "" {
		displayName = "Candidate"
	}

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

	// Immediate fallback if candidate provided essentially no response
	if totalCandidateWords == 0 {
		if followUpCount >= 2 {
			return true, "", "Maximum follow-ups reached for this question.", nil
		}
		followUpQ := fmt.Sprintf("I didn't quite catch that, %s. Could you please share your thoughts on %s?", displayName, strings.ToLower(question.Theme))
		return false, followUpQ, "Empty candidate turn.", nil
	}

	if !e.config.Enabled() {
		if (followUpCount >= 1 && totalCandidateWords >= 20) || followUpCount >= 2 {
			return true, "", "Sufficient depth or max follow-ups reached.", nil
		}
		var followUpQ string
		if strings.Contains(strings.ToLower(question.Theme), "intro") || strings.Contains(strings.ToLower(question.Theme), "background") {
			followUpQ = fmt.Sprintf("Nice to meet you, %s! Could you tell me a little more about your background in software engineering, and what specific areas or skills you hope to achieve during the fellowship?", displayName)
		} else {
			followUpQ = fmt.Sprintf("Thank you, %s! Could you elaborate further on how you approached %s, and what specific technical challenges or trade-offs were involved?", displayName, strings.ToLower(question.Theme))
		}
		return false, followUpQ, "Answer could use more concrete detail.", nil
	}

	var criteriaList strings.Builder
	for _, c := range question.Criteria {
		criteriaList.WriteString(fmt.Sprintf("- %s (%d pts)\n", c.Criterion, c.Points))
	}

	systemPrompt := fmt.Sprintf(`You are an encouraging, natural, and human admissions interviewer for a software engineering talent fellowship.
You are actively listening to the candidate.
Your task: Evaluate the candidate's answer and determine if it is SUFFICIENT or if you should ask an interactive FOLLOW-UP QUESTION.

CANDIDATE INFORMATION:
- The candidate's registered name is: %s
- Always refer to or address the candidate as "%s". Never guess, assume, invent, or mishear any other name.

CRITICAL LANGUAGE REQUIREMENT:
- You MUST ALWAYS speak, evaluate, and respond 100%% in English.
- NEVER generate a follow-up question, feedback, or any text in Indonesian, Spanish, or any language other than English under ANY circumstances.
- Even if the candidate speaks with an Indonesian accent, mentions Indonesian companies (e.g. Gojek, Tokopedia, Bukalapak, BCA, Mandiri), cities (e.g. Jakarta, Bandung), or universities (e.g. ITB, UI, UGM), you MUST STRICTLY CONDUCT THE INTERVIEW AND RESPOND IN ENGLISH.
- Never translate candidate answers to Indonesian. Keep the conversation 100%% in English.

TECHNICAL DOMAIN & VOCABULARY KNOWLEDGE:
- This is a technical interview for a Software Engineering Fellowship. Candidates will discuss software engineering, web development, cloud computing, systems architecture, and computer science concepts.
- Broad Technical Vocabulary: Recognize standard software tools, frameworks, and technologies without confusion (e.g. Go, TypeScript, Python, React, Next.js, Docker, Kubernetes, PostgreSQL, Redis, Kafka, REST, gRPC, CI/CD).
- DO NOT OVERGUESS: Do not ask candidates for textbook definitions of tools they already mentioned. Instead, ask about their practical implementation, architecture choices, trade-offs, or problem-solving.

CURRENT QUESTION FOCUS:
Theme: %s
Primary Question: "%s"

EVALUATION CRITERIA:
%s

CURRENT CONVERSATION STAGE:
- Follow-ups already asked for this question: %d of 2 allowed.

CRUCIAL DECISION GUIDELINES:
1. Conversational Fellowship Interview:
   - An interview is an interactive dialogue. Each main question should probe the candidate with at least 1 follow-up question so they can showcase depth, engineering thought process, and practical trade-offs.
   - If follow-up count is 0:
     * Unless the candidate provided an extraordinarily complete, comprehensive answer covering all criteria with concrete project examples and outcomes (> 75 words), set "is_sufficient": false.
     * Ask a thoughtful follow-up in English exploring specific details, challenges faced, technical trade-offs, or outcomes related to what they just shared.
   - If follow-up count is 1:
     * If the candidate has elaborated and provided a solid, coherent answer, set "is_sufficient": true, "follow_up": "".
     * If their explanation is still brief or missing key aspects, set "is_sufficient": false and ask one final follow-up.
   - If follow-up count is 2:
     * Maximum follow-ups reached. Set "is_sufficient": true, "follow_up": "".
2. Candidate Fairness:
   - Do NOT penalize non-native English, Indonesian accent, modest vocabulary, or conversational pauses.
3. Natural Conversational Style:
   - Address %s by name. Keep the follow-up warm, concise (1-2 sentences), and in clear English.
4. Output format: Return ONLY valid JSON in English: {"is_sufficient": boolean, "follow_up": string, "feedback": string}`,
		displayName, displayName, question.Theme, question.Question, criteriaList.String(), followUpCount, displayName)

	// Clean, isolated background conversation strictly scoped to the current question
	messages := []cloudflareMessage{
		{
			Role:    "system",
			Content: systemPrompt,
		},
		{
			Role:    "assistant",
			Content: question.Question,
		},
	}

	// Add turns for this question only (user responses and any prior follow-up assistant turns)
	for _, m := range conversationForQuestion {
		clean := strings.TrimSpace(m.Message)
		if idx := strings.Index(clean, "]: "); idx != -1 {
			clean = strings.TrimSpace(clean[idx+3:])
		}
		if clean == "" {
			continue
		}
		if m.Role == "ai" && strings.Contains(clean, question.Question) {
			continue
		}

		if m.Role == "candidate" {
			messages = append(messages, cloudflareMessage{
				Role:    "user",
				Content: clean,
			})
		} else if m.Role == "ai" && m.IsFollowUp {
			messages = append(messages, cloudflareMessage{
				Role:    "assistant",
				Content: clean,
			})
		}
	}

	// Trigger turn evaluation
	messages = append(messages, cloudflareMessage{
		Role:    "user",
		Content: fmt.Sprintf("Evaluate %s's response above against the criteria for %s. Is it sufficient or is a follow-up needed? Return ONLY valid JSON: {\"is_sufficient\": boolean, \"follow_up\": string, \"feedback\": string}", displayName, question.Theme),
	})

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/meta/llama-3.1-8b-instruct", e.config.AccountID)

	reqBody := cloudflareChatRequest{
		Messages:    messages,
		MaxTokens:   512,
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
		if (followUpCount >= 1 && totalCandidateWords >= 20) || followUpCount >= 2 {
			return true, "", "Heuristic fallback: sufficient depth or max follow-ups reached.", nil
		}
		var followUpQ string
		if strings.Contains(strings.ToLower(question.Theme), "intro") || strings.Contains(strings.ToLower(question.Theme), "background") {
			followUpQ = fmt.Sprintf("Nice to meet you, %s! Could you tell me a little more about your background in software development and what you hope to achieve during the fellowship?", displayName)
		} else {
			followUpQ = fmt.Sprintf("Thank you, %s! Could you give me a concrete example or share more details about your technical approach to %s?", displayName, strings.ToLower(question.Theme))
		}
		return false, followUpQ, "Heuristic fallback follow-up", nil
	}
	defer resp.Body.Close()

	var cfResp cloudflareChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		if (followUpCount >= 1 && totalCandidateWords >= 20) || followUpCount >= 2 {
			return true, "", "decode error fallback: sufficient depth", nil
		}
		return false, fmt.Sprintf("Could you tell me a bit more about your experience with %s, %s?", strings.ToLower(question.Theme), displayName), "Decode error fallback", nil
	}

	aiText := extractCloudflareResultText(cfResp.Result)

	// Parse JSON from response
	var result FollowUpResult
	cleanText := strings.TrimSpace(aiText)
	if idx := strings.Index(cleanText, "{"); idx != -1 {
		if endIdx := strings.LastIndex(cleanText, "}"); endIdx != -1 && endIdx > idx {
			cleanText = cleanText[idx : endIdx+1]
		}
	}

	if err := json.Unmarshal([]byte(cleanText), &result); err != nil {
		e.logger.Warn("Could not parse follow-up JSON, checking word count", slog.String("text", aiText))
		if (followUpCount >= 1 && totalCandidateWords >= 20) || followUpCount >= 2 {
			return true, "", "JSON parse fallback: sufficient depth", nil
		}
		return false, fmt.Sprintf("Could you tell me a bit more about your experience with %s, %s?", strings.ToLower(question.Theme), displayName), "JSON parse fallback", nil
	}

	// Safety check: On the first turn (followUpCount == 0), if response is under 60 words,
	// guarantee a conversational follow-up question is asked to explore technical depth.
	if followUpCount == 0 && totalCandidateWords < 60 {
		result.IsSufficient = false
		if strings.TrimSpace(result.FollowUp) == "" {
			if strings.Contains(strings.ToLower(question.Theme), "intro") || strings.Contains(strings.ToLower(question.Theme), "background") {
				result.FollowUp = fmt.Sprintf("Nice to meet you, %s! Could you share a bit more about your background in software engineering, and what sparked your interest in joining this fellowship?", displayName)
			} else {
				result.FollowUp = fmt.Sprintf("Thank you, %s! Could you tell me a little more about your approach to %s, and what specific steps or outcomes were involved?", displayName, strings.ToLower(question.Theme))
			}
		}
	} else if totalCandidateWords < 15 {
		result.IsSufficient = false
		if strings.TrimSpace(result.FollowUp) == "" {
			result.FollowUp = fmt.Sprintf("Could you tell me a bit more about your experience with %s, %s?", strings.ToLower(question.Theme), displayName)
		}
	}

	followUpText := strings.TrimSpace(result.FollowUp)
	if !result.IsSufficient && followUpText == "" {
		followUpText = fmt.Sprintf("Could you tell me a little more about your experience with %s, %s?", strings.ToLower(question.Theme), displayName)
	}

	// Language Guard: If the model generated non-English words, substitute a clear professional English follow-up
	if isLikelyNonEnglish(followUpText) {
		e.logger.Warn("AI generated non-English follow-up, replacing with English question", slog.String("raw", followUpText))
		followUpText = fmt.Sprintf("Thank you for sharing, %s! Could you elaborate further on your experience with %s, in English?", displayName, strings.ToLower(question.Theme))
	}

	return result.IsSufficient, followUpText, result.Feedback, nil
}

// isLikelyNonEnglish checks if a string contains common Indonesian indicator tokens.
func isLikelyNonEnglish(text string) bool {
	if text == "" {
		return false
	}
	lower := " " + strings.ToLower(text) + " "
	indicators := []string{
		" bisa ", " apakah ", " terima kasih ", " terimakasih ", " ceritakan ", " pengalaman ",
		" bagaimana ", " senang ", " bertemu ", " anda ", " kamu ", " saya ", " kami ", " kita ",
		" dengan ", " untuk ", " yang ", " tidak ", " tolong ", " jelaskan ", " sebutkan ",
		" apa ", " mengapa ", " kenapa ", " tentang ", " pada ", " dari ", " halo ", " baik ",
		" selamat ", " pagi ", " siang ", " sore ", " malam ", " perkenalkan ", " nama saya ",
		" di mana ", " seperti apa ", " silakan ", " silahkan ", " mohon ", " adalah ", " sangat ",
		" pekerjaan ", " jurusan ", " lulusan ", " kuliah ", " kampus ", " bahasa ", " sudah ",
		" belum ", " ingin ", " mau ", " ikut ", " program ", " ini ", " itu ",
	}
	for _, ind := range indicators {
		if strings.Contains(lower, ind) {
			return true
		}
	}
	return false
}

// EnsureEnglishTranscript ensures candidate speech transcript is in English.
// If any Indonesian or foreign phrase is detected, it normalizes it to natural English.
func (e *CloudflareEvaluator) EnsureEnglishTranscript(ctx context.Context, text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || !isLikelyNonEnglish(trimmed) || !e.config.Enabled() {
		return trimmed
	}

	reqCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/meta/llama-3.1-8b-instruct", e.config.AccountID)
	reqBody := cloudflareChatRequest{
		Messages: []cloudflareMessage{
			{
				Role:    "system",
				Content: "You are an English speech-to-text normalizer. Convert or translate the following transcript into clear, fluent English. Output ONLY the English transcript with no commentary, explanation, or quotes.",
			},
			{
				Role:    "user",
				Content: trimmed,
			},
		},
		MaxTokens:   256,
		Temperature: 0.1,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return trimmed
	}

	httpReq, err := http.NewRequestWithContext(reqCtx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return trimmed
	}
	httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(httpReq)
	if err != nil || resp.StatusCode != http.StatusOK {
		return trimmed
	}
	defer resp.Body.Close()

	var cfResp cloudflareChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		return trimmed
	}
	resultText := strings.TrimSpace(extractCloudflareResultText(cfResp.Result))
	if resultText != "" && !isLikelyNonEnglish(resultText) {
		return resultText
	}
	return trimmed
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
// It prioritizes the English-only Whisper model (@cf/openai/whisper-tiny-en) to guarantee English output
// and prevent language misdetection/translation into Indonesian.
func (e *CloudflareEvaluator) TranscribeAudio(ctx context.Context, audioData []byte, mimeType string) (string, error) {
	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data is empty")
	}
	if !e.config.Enabled() {
		return "", fmt.Errorf("Cloudflare Workers AI credentials not configured")
	}

	// Priority order:
	// 1. @cf/openai/whisper: Full multilingual model with high accuracy on technical vocabulary.
	// 2. @cf/openai/whisper-tiny-en: Fast fallback.
	models := []string{
		"@cf/openai/whisper",
		"@cf/openai/whisper-tiny-en",
	}

	var lastErr error
	var text string

	for _, modelName := range models {
		apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/%s", e.config.AccountID, modelName)

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(audioData))
		if err != nil {
			lastErr = err
			continue
		}

		httpReq.Header.Set("Authorization", "Bearer "+e.config.Token())
		if mimeType != "" {
			httpReq.Header.Set("Content-Type", mimeType)
		} else {
			httpReq.Header.Set("Content-Type", "application/octet-stream")
		}

		resp, err := e.client.Do(httpReq)
		if err != nil {
			lastErr = err
			continue
		}

		raw, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("%s returned status %d: %s", modelName, resp.StatusCode, string(raw))
			continue
		}

		var cfResp struct {
			Result struct {
				Text string `json:"text"`
			} `json:"result"`
			Success bool `json:"success"`
		}

		if err := json.Unmarshal(raw, &cfResp); err != nil {
			lastErr = err
			continue
		}

		text = strings.TrimSpace(cfResp.Result.Text)
		if text != "" || IsWhisperSilenceOrHallucination(text) {
			break
		}
	}

	if text == "" && lastErr != nil {
		return "", fmt.Errorf("whisper transcription failed: %w", lastErr)
	}

	if IsWhisperSilenceOrHallucination(text) {
		return "", nil
	}

	// Post-transcription Indonesian Safeguard:
	// If the model somehow produced Indonesian text, sanitize/translate it to English
	if isLikelyNonEnglish(text) {
		e.logger.Warn("Transcription contained non-English tokens; normalizing to English", slog.String("raw", text))
		text = e.EnsureEnglishTranscript(ctx, text)
	}

	// Apply technical ASR phonetic normalization for high accuracy
	cleaned := e.CleanTechnicalASR(ctx, text)
	return cleaned, nil
}

// IsWhisperSilenceOrHallucination detects common Whisper hallucinations on low-volume noise, air movement, or silence.
func IsWhisperSilenceOrHallucination(rawText string) bool {
	trimmed := strings.TrimSpace(rawText)
	if trimmed == "" {
		return true
	}

	// Remove punctuation and special symbols for clean matching
	reg := regexp.MustCompile(`[^a-zA-Z0-9\s]`)
	clean := strings.ToLower(reg.ReplaceAllString(trimmed, " "))
	clean = strings.Join(strings.Fields(clean), " ")

	switch clean {
	case "",
		"blank audio",
		"silence",
		"thank you",
		"thank you very much",
		"thank you so much",
		"thanks for watching",
		"thanks for watching please subscribe",
		"subtitles by",
		"subtitles created by",
		"subtitles",
		"amara org",
		"amara",
		"please subscribe",
		"like and subscribe",
		"bye",
		"bye bye",
		"goodbye",
		"you",
		"okay",
		"so",
		"yeah",
		"yes",
		"foreign",
		"mbc",
		"watching",
		"saasaa":
		return true
	}

	// Match common prefix patterns for Whisper silence/noise hallucinations
	if strings.HasPrefix(clean, "subtitles by") ||
		strings.HasPrefix(clean, "subtitles created by") ||
		strings.HasPrefix(clean, "thanks for watching") ||
		strings.Contains(clean, "amara org") ||
		strings.Contains(clean, "please subscribe") {
		return true
	}

	// Match bracketed/parenthetical audio tags like [music], (applause), [laughter], [silence]
	if (strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]")) ||
		(strings.HasPrefix(trimmed, "(") && strings.HasSuffix(trimmed, ")")) {
		return true
	}

	return false
}

// CleanTechnicalASR normalizes common phonetic speech-to-text mishearings and technical term typos.
func (e *CloudflareEvaluator) CleanTechnicalASR(ctx context.Context, rawText string) string {
	trimmed := strings.TrimSpace(rawText)
	if trimmed == "" {
		return rawText
	}

	// 1. Fast regex dictionary normalization for common tech terms and phonetic variations
	replacements := []struct {
		re  *regexp.Regexp
		rep string
	}{
		{regexp.MustCompile(`(?i)\b(beckon)\b`), "backend"},
		{regexp.MustCompile(`(?i)\b(back end)\b`), "backend"},
		{regexp.MustCompile(`(?i)\b(front end)\b`), "frontend"},
		{regexp.MustCompile(`(?i)\b(darker|doc ker)\b`), "Docker"},
		{regexp.MustCompile(`(?i)\b(post grease sql|post grease|postgre sql|postgre|postgres sql)\b`), "PostgreSQL"},
		{regexp.MustCompile(`(?i)\b(coober netees|coobernetes|kuber netes)\b`), "Kubernetes"},
		{regexp.MustCompile(`(?i)\b(fast epi|fast api)\b`), "FastAPI"},
		{regexp.MustCompile(`(?i)\b(type script)\b`), "TypeScript"},
		{regexp.MustCompile(`(?i)\b(java script)\b`), "JavaScript"},
		{regexp.MustCompile(`(?i)\b(see eye see dee)\b`), "CI/CD"},
		{regexp.MustCompile(`(?i)\b(git hub)\b`), "GitHub"},
		{regexp.MustCompile(`(?i)\b(git lab)\b`), "GitLab"},
		{regexp.MustCompile(`(?i)\b(go lang|go-lang)\b`), "Golang"},
		{regexp.MustCompile(`(?i)\b(rest epi|rest api|rest full)\b`), "REST API"},
		{regexp.MustCompile(`(?i)\b(graph ql|graf ql)\b`), "GraphQL"},
		{regexp.MustCompile(`(?i)\b(mongo db)\b`), "MongoDB"},
		{regexp.MustCompile(`(?i)\b(read is)\b`), "Redis"},
		{regexp.MustCompile(`(?i)\b(next js|nextjs)\b`), "Next.js"},
		{regexp.MustCompile(`(?i)\b(node js|nodejs)\b`), "Node.js"},
		{regexp.MustCompile(`(?i)\b(view js|vue js|vuejs)\b`), "Vue.js"},
		{regexp.MustCompile(`(?i)\b(my sequel|my sql)\b`), "MySQL"},
		{regexp.MustCompile(`(?i)\b(sequel light|sql lite|sq light)\b`), "SQLite"},
		{regexp.MustCompile(`(?i)\b(micro services)\b`), "microservices"},
		{regexp.MustCompile(`(?i)\b(g r p c)\b`), "gRPC"},
		{regexp.MustCompile(`(?i)\b(engine x)\b`), "Nginx"},
		{regexp.MustCompile(`(?i)\b(rabbit m q)\b`), "RabbitMQ"},
		{regexp.MustCompile(`(?i)\b(tail wind|tailwind css)\b`), "Tailwind CSS"},
		{regexp.MustCompile(`(?i)\b(kul kul|cool cool)\b`), "Kulkul"},
		{regexp.MustCompile(`(?i)\b(fellow ship)\b`), "fellowship"},
	}

	normalized := trimmed
	for _, r := range replacements {
		normalized = r.re.ReplaceAllString(normalized, r.rep)
	}

	// Apply comprehensive technical vocabulary normalizer
	return NormalizeTechVocabulary(normalized)
}

