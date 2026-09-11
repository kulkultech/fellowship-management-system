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
}

func DefaultRSAFormSchema() *ApplicationFormSchema {
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
	}
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
	}
}

type Program struct {
	ID                       uuid.UUID              `json:"id"`
	OrganizationID           uuid.UUID              `json:"organization_id"`
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
	Status                   string                 `json:"status"` // 'draft', 'published', 'archived'
	PreviewToken             uuid.UUID              `json:"preview_token"`
	CreatedAt                time.Time              `json:"created_at"`
	UpdatedAt                time.Time              `json:"updated_at"`
}

func (p *Program) IsOpen() bool {
	now := time.Now()
	return now.After(p.OpenDate) && now.Before(p.EndDate)
}
