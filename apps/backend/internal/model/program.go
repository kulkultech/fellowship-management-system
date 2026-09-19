package model

import (
	"time"

	"github.com/google/uuid"
)

type ApplicationStageItem struct {
	StepNumber  int    `json:"step_number"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type FormFieldType string

const (
	FieldTypeText     FormFieldType = "text"
	FieldTypeTextarea FormFieldType = "textarea"
	FieldTypeSelect   FormFieldType = "select"
	FieldTypeRadio    FormFieldType = "radio"
	FieldTypeNumber   FormFieldType = "number"
	FieldTypeURL      FormFieldType = "url"
	FieldTypeFile     FormFieldType = "file"
	FieldTypeDate     FormFieldType = "date"
)

type CustomFormField struct {
	ID          string        `json:"id"`
	Label       string        `json:"label"`
	Type        FormFieldType `json:"type"`
	Placeholder string        `json:"placeholder,omitempty"`
	HelpText    string        `json:"help_text,omitempty"`
	Required    bool          `json:"required"`
	Options     []string      `json:"options,omitempty"`
}

type StandardFieldConfig struct {
	Enabled  bool     `json:"enabled"`
	Required bool     `json:"required"`
	Options  []string `json:"options,omitempty"`
}

type ApplicationFormSchema struct {
	Title            string                         `json:"title,omitempty"`
	Description      string                         `json:"description,omitempty"`
	SubmitButtonText string                         `json:"submit_button_text,omitempty"`
	Fields           map[string]StandardFieldConfig `json:"fields,omitempty"`
	CustomFields     []CustomFormField              `json:"custom_fields,omitempty"`
	FieldOrder       []string                       `json:"field_order,omitempty"`
}

func DefaultStandardFormSchema() *ApplicationFormSchema {
	return &ApplicationFormSchema{
		Title:            "Candidate Intake Form",
		Description:      "Submit your academic background, IT major, and contact details for fellowship consideration.",
		SubmitButtonText: "Submit Application & Start Evaluation",
		Fields: map[string]StandardFieldConfig{
			"phone":           {Enabled: true, Required: true},
			"date_of_birth":   {Enabled: true, Required: true},
			"university":      {Enabled: true, Required: true},
			"major": {
				Enabled:  true,
				Required: true,
				Options: []string{
					"Computer Science / Informatics",
					"Information Systems / Technology",
					"Software Engineering",
					"Electrical / Computer Engineering",
					"Data Science / Artificial Intelligence",
					"Mathematics / Statistics",
					"Other Engineering / STEM",
				},
			},
			"semester": {
				Enabled:  true,
				Required: true,
				Options: []string{
					"Semester 1 - 2",
					"Semester 3 - 4",
					"Semester 5 - 6",
					"Semester 7 - 8",
					"Fresh Graduate (< 1 year)",
				},
			},
			"referral_source": {
				Enabled:  true,
				Required: true,
				Options: []string{
					"Instagram",
					"LinkedIn",
					"Campus Career Center / BEM",
					"Friend / Alumni Referral",
					"Telegram / Discord Tech Community",
					"Other",
				},
			},
			"resume":          {Enabled: true, Required: true},
			"profile_picture": {Enabled: true, Required: false},
			"linkedin_url":    {Enabled: true, Required: false},
			"github_url":      {Enabled: false, Required: false},
		},
		CustomFields: []CustomFormField{},
		FieldOrder: []string{
			"phone", "date_of_birth", "university", "major", "semester",
			"referral_source", "linkedin_url", "github_url", "profile_picture", "resume",
		},
	}
}

// DefaultRSAFormSchema is a backwards-compatible alias for DefaultStandardFormSchema
func DefaultRSAFormSchema() *ApplicationFormSchema {
	return DefaultStandardFormSchema()
}

func DefaultCompanyFormSchema() *ApplicationFormSchema {
	return &ApplicationFormSchema{
		Title:            "Candidate Application",
		Description:      "Please provide your contact information and supporting documents.",
		SubmitButtonText: "Submit Application",
		Fields: map[string]StandardFieldConfig{
			"phone":           {Enabled: true, Required: true},
			"date_of_birth":   {Enabled: false, Required: false},
			"university":      {Enabled: false, Required: false},
			"major":           {Enabled: false, Required: false},
			"semester":        {Enabled: false, Required: false},
			"referral_source": {Enabled: false, Required: false},
			"resume":          {Enabled: true, Required: true},
			"profile_picture": {Enabled: false, Required: false},
			"linkedin_url":    {Enabled: true, Required: false},
			"github_url":      {Enabled: true, Required: false},
		},
		CustomFields: []CustomFormField{
			{
				ID:          "years_experience",
				Label:       "Years of relevant experience",
				Type:        FieldTypeSelect,
				Placeholder: "Select your experience range",
				Required:    false,
				Options: []string{
					"Student / No commercial experience",
					"Less than 1 year",
					"1 - 2 years",
					"3 - 5 years",
					"5+ years",
				},
			},
			{
				ID:          "portfolio_url",
				Label:       "Portfolio / GitHub / Personal Website URL",
				Type:        FieldTypeURL,
				Placeholder: "https://",
				HelpText:    "Link to your projects or live code examples",
				Required:    false,
			},
		},
		FieldOrder: []string{
			"phone", "linkedin_url", "github_url", "years_experience", "portfolio_url", "resume",
		},
	}
}

type Program struct {
	ID                       uuid.UUID              `json:"id"`
	OrganizationID           uuid.UUID              `json:"organization_id"`
	OrgSlug                  string                 `json:"org_slug,omitempty"`
	OrgName                  string                 `json:"org_name,omitempty"`
	QuestionSetID            *uuid.UUID             `json:"question_set_id,omitempty"`
	QuestionSetName          string                 `json:"question_set_name,omitempty"`
	QuestionCount            int                    `json:"question_count,omitempty"`
	Slug                     string                 `json:"slug"`
	Name                     string                 `json:"name"`
	Description              string                 `json:"description,omitempty"`
	ImageURL                 string                 `json:"image_url,omitempty"`
	OpenDate                 time.Time              `json:"open_date"`
	EndDate                  time.Time              `json:"end_date"`
	EnableMCQ                bool                   `json:"enable_mcq"`
	LogicTestDurationMinutes int                    `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int                    `json:"logic_test_passing_score"` // percentage (e.g. 70)
	AllowRetake              bool                   `json:"allow_retake"`
	EnableAIInterview        bool                   `json:"enable_ai_interview"`
	AIInterviewInstructions  string                 `json:"ai_interview_instructions,omitempty"`
	AIInterviewQuestions     []string               `json:"ai_interview_questions,omitempty"`
	AIInterviewRubric        *AIInterviewRubric     `json:"ai_interview_rubric,omitempty"`
	ApplicationStages        []ApplicationStageItem `json:"application_stages,omitempty"`
	ApplicationFormSchema    *ApplicationFormSchema `json:"application_form_schema,omitempty"`
	CandidateFlow            []string               `json:"candidate_flow,omitempty"`
	EmailTemplates           *ProgramEmailTemplates `json:"email_templates,omitempty"`
	Status                   string                 `json:"status"` // 'draft', 'published', 'archived'
	PreviewToken             uuid.UUID              `json:"preview_token"`
	CreatedAt                time.Time              `json:"created_at"`
	UpdatedAt                time.Time              `json:"updated_at"`
}

type EmailTemplateConfig struct {
	Enabled    bool   `json:"enabled"`
	Subject    string `json:"subject"`
	Headline   string `json:"headline,omitempty"`
	Body       string `json:"body"`
	ButtonText string `json:"button_text,omitempty"`
}

type ProgramEmailTemplates struct {
	ApplicationReceived   *EmailTemplateConfig `json:"application_received,omitempty"`
	TestResultPassed      *EmailTemplateConfig `json:"test_result_passed,omitempty"`
	TestResultFailed      *EmailTemplateConfig `json:"test_result_failed,omitempty"`
	AIInterviewInvitation *EmailTemplateConfig `json:"ai_interview_invitation,omitempty"`
	FinalInterview        *EmailTemplateConfig `json:"final_interview,omitempty"`
	Rejection             *EmailTemplateConfig `json:"rejection,omitempty"`
}

func DefaultProgramEmailTemplates(programName string) *ProgramEmailTemplates {
	if programName == "" {
		programName = "Fellowship Program"
	}
	return &ProgramEmailTemplates{
		ApplicationReceived: &EmailTemplateConfig{
			Enabled:    true,
			Subject:    "Application Confirmed: {{program_name}} - Next Step: Timed Assessment",
			Headline:   "Application Confirmed!",
			Body:       "Dear {{candidate_name}},\n\nWe have successfully received your application for {{program_name}} ({{track_name}}).\n\nPlease proceed to complete your timed logic MCQ assessment within the allocated duration of {{duration_minutes}} minutes. The passing benchmark is {{passing_score}}%.\n\nEnsure you have a stable internet connection before beginning.",
			ButtonText: "Start Timed Logic Assessment",
		},
		TestResultPassed: &EmailTemplateConfig{
			Enabled:    true,
			Subject:    "Congratulations! Logic Test Passed - {{program_name}}",
			Headline:   "You Passed the Logic Assessment!",
			Body:       "Dear {{candidate_name}},\n\nCongratulations! You have successfully passed the timed logic assessment for {{program_name}} with a score of {{score}}% (Passing benchmark: {{passing_score}}%).\n\nYour application has advanced to the next screening stage. Click below to continue.",
			ButtonText: "Continue Application",
		},
		TestResultFailed: &EmailTemplateConfig{
			Enabled:    true,
			Subject:    "Your Logic Test Result - {{program_name}}",
			Headline:   "Assessment Completed",
			Body:       "Dear {{candidate_name}},\n\nThank you for completing the timed logic assessment for {{program_name}}. Your score was {{score}}% (Passing benchmark: {{passing_score}}%).\n\nWhile your score did not meet the advancement threshold for this cohort, we sincerely appreciate your effort and encourage you to apply for future cohorts.",
			ButtonText: "View Assessment Results",
		},
		AIInterviewInvitation: &EmailTemplateConfig{
			Enabled:    true,
			Subject:    "Invitation: AI Screening Interview - {{program_name}}",
			Headline:   "You are Invited to the AI Screening Interview!",
			Body:       "Dear {{candidate_name}},\n\nGreat news! You have been selected to take the automated AI screening interview for {{program_name}} ({{track_name}}).\n\nThis interactive voice interview will assess your technical fundamentals, problem-solving, and communication skills. It takes approximately 10-15 minutes.\n\nPlease complete your interview before {{expires_at}}.",
			ButtonText: "Begin AI Interview",
		},
		FinalInterview: &EmailTemplateConfig{
			Enabled:    true,
			Subject:    "Congratulations! Next Stage Invitation: {{program_name}}",
			Headline:   "You're Moving to the Next Stage!",
			Body:       "Dear {{candidate_name}},\n\nWe are pleased to inform you that your application and screening assessments for {{program_name}} ({{track_name}}) have been thoroughly evaluated, and you have qualified to advance to the next stage!\n\n{{notes}}\n\nPlease visit your candidate portal for schedule details, next steps, and preparation guidelines.",
			ButtonText: "Go to Candidate Portal",
		},
		Rejection: &EmailTemplateConfig{
			Enabled:    true,
			Subject:    "Application Update: {{program_name}}",
			Headline:   "Application Status Update",
			Body:       "Dear {{candidate_name}},\n\nThank you for your interest in {{program_name}} ({{track_name}}) and for taking the time to participate in our selection process.\n\nAfter careful review, we regret to inform you that we are unable to offer you a spot in this cohort. Due to limited capacity and a high volume of strong applicants, our admissions committee had to make difficult choices.\n\nWe wish you the very best in your academic and professional endeavors.",
			ButtonText: "View Application Status",
		},
	}
}

const (
	FlowStepForm        = "fill_form"
	FlowStepMCQ         = "mcq_test"
	FlowStepAIInterview = "ai_interview"
)

func DefaultCandidateFlow() []string {
	return []string{FlowStepForm, FlowStepMCQ, FlowStepAIInterview}
}

// GetEffectiveCandidateFlow returns the configured flow filtered by enabled screening modules.
func (p *Program) GetEffectiveCandidateFlow() []string {
	flow := p.CandidateFlow
	if len(flow) == 0 {
		flow = DefaultCandidateFlow()
	}

	effective := make([]string, 0, len(flow))
	for _, step := range flow {
		if step == FlowStepMCQ && !p.EnableMCQ {
			continue
		}
		if step == FlowStepAIInterview && !p.EnableAIInterview {
			continue
		}
		effective = append(effective, step)
	}
	return effective
}

// NextStepAfter returns the next stage in the effective candidate flow after the given step.
// Returns an empty string if there are no further steps.
func (p *Program) NextStepAfter(currentStep string) string {
	flow := p.GetEffectiveCandidateFlow()
	for i, step := range flow {
		if step == currentStep && i+1 < len(flow) {
			return flow[i+1]
		}
	}
	return ""
}

func (p *Program) IsOpen() bool {
	now := time.Now()
	return now.After(p.OpenDate) && now.Before(p.EndDate)
}
