package email

import (
	"bytes"
	"fmt"
	"html/template"
	"net/url"
	"strings"
	"time"

	"github.com/kulkul/backend/internal/model"
)

type BaseTemplateData struct {
	Subject      string
	FrontendURL  string
	SupportEmail string
	BodyHTML     template.HTML
}

const baseHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>{{.Subject}}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* Matches the FellowHire app: slate-50 page, white rounded cards, Inter, Kulkul purple */
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 28px 12px 36px 12px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    /* White top bar with the logo, like the app header */
    .header {
      padding: 20px 32px;
      background-color: #ffffff;
      border-bottom: 1px solid #f1f5f9;
    }
    .header img {
      height: 28px;
      width: auto;
      border: 0;
      display: block;
    }
    .card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
      overflow: hidden;
    }
    .content {
      padding: 32px;
    }
    .content h2 {
      margin: 0 0 4px 0;
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
      line-height: 1.35;
    }
    .content p {
      font-size: 14px;
      line-height: 1.65;
      color: #475569;
      margin: 14px 0;
    }
    .content strong {
      color: #0f172a;
    }
    .content a {
      color: #33125d;
    }
    /* Small coloured label above a heading (plain text, like the app's status labels) */
    .badge {
      display: block;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      margin-bottom: 10px;
      color: #33125d;
    }
    .badge-purple { color: #33125d; }
    .badge-emerald { color: #047857; }
    .badge-amber { color: #b45309; }
    .info-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .info-row {
      display: table;
      width: 100%;
      padding: 8px 0;
      font-size: 13px;
      border-bottom: 1px solid #e2e8f0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      display: table-cell;
      color: #64748b;
      font-weight: 600;
      text-align: left;
    }
    .info-value {
      display: table-cell;
      color: #0f172a;
      font-weight: 700;
      text-align: right;
    }
    .score-banner {
      background-color: #f5f0fa;
      border: 1px solid #ede4f7;
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .score-label {
      font-size: 11px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.7px;
    }
    .score-number {
      font-size: 36px;
      font-weight: 800;
      color: #33125d;
      line-height: 1.1;
      margin: 6px 0;
    }
    .score-subtext {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }
    .btn-container {
      text-align: center;
      margin: 28px 0 8px 0;
    }
    .btn {
      display: inline-block;
      background-color: #33125d;
      color: #ffffff !important;
      padding: 12px 26px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 14px;
      line-height: 1.2;
      text-decoration: none;
    }
    .guidelines {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 16px 20px;
      margin: 20px 0;
      font-size: 13px;
      color: #475569;
    }
    .guidelines ul {
      margin: 6px 0 0 0;
      padding-left: 18px;
    }
    .guidelines li {
      margin-bottom: 4px;
    }
    .footer {
      padding: 20px 16px 0 16px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer a {
      color: #33125d;
      font-weight: 600;
      text-decoration: underline;
    }
    @media (max-width: 480px) {
      .content { padding: 24px 20px; }
      .header { padding: 16px 20px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="card">
        <div class="header">
          <a href="{{.FrontendURL}}"><img src="{{.FrontendURL}}/email/kulkul-logo.png" alt="Kulkul" height="28"></a>
        </div>
        <div class="content">
          {{.BodyHTML}}
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0 0 6px 0;"><strong style="color: #334155;">FellowHire</strong> by Kulkul</p>
        <p style="margin: 0 0 6px 0;">Questions? Email <a href="mailto:{{.SupportEmail}}">{{.SupportEmail}}</a>.</p>
        <p style="font-size: 11px; color: #94a3b8; margin: 6px 0 0 0;">This is an automated message. Never share your private test or interview links with anyone.</p>
      </div>
    </div>
  </div>
</body>
</html>`

func renderHTML(subject, frontendURL, supportEmail, bodyHTML string) (string, error) {
	tmpl, err := template.New("base").Parse(baseHTMLTemplate)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	data := BaseTemplateData{
		Subject:      subject,
		FrontendURL:  frontendURL,
		SupportEmail: supportEmail,
		BodyHTML:     template.HTML(bodyHTML),
	}
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// 1. Registration Confirmation Email Template
func buildRegistrationEmail(userName, companyName, loginURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	subject = fmt.Sprintf("Welcome to FellowHire - %s Registration Received", companyName)

	body := fmt.Sprintf(`
    <h2>Welcome to FellowHire, %s!</h2>
    <p>Thank you for registering <strong>%s</strong> on the FellowHire Multi-Tenant Assessment Platform.</p>
    <p>Your company workspace has been initialized and is queued for verification by the platform administration team.</p>
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Organization Name</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Admin Contact</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Platform Status</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">Pending Platform Review</td>
        </tr>
      </tbody>
    </table>

    <p>Once approved, you will be able to launch custom programs, configure domain-specific MCQ banks, and evaluate candidate video responses with Cloudflare AI rubrics.</p>

    <div class="btn-container">
      <a href="%s" class="btn">Access Reviewer Admin Portal</a>
    </div>
  `, template.HTMLEscapeString(userName), template.HTMLEscapeString(companyName), template.HTMLEscapeString(companyName), template.HTMLEscapeString(userName), loginURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Welcome to FellowHire, %s!\n\nYour organization '%s' has been registered on the platform.\nStatus: Pending Platform Review\n\nLogin to the admin portal: %s\n\nContact support: %s",
		userName, companyName, loginURL, supportEmail)
	return
}

// 1b. Company Registration Approved Email Template
func buildCompanyApprovedEmail(userName, companyName, loginURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	if userName == "" {
		userName = "Admin"
	}
	subject = fmt.Sprintf("Your Company Registration for %s has been Approved! - FellowHire", companyName)

	body := fmt.Sprintf(`
    <h2>Welcome to FellowHire, %s!</h2>
    <p>Great news! Your company registration for <strong>%s</strong> has been reviewed and <strong style="color: #16a34a;">approved</strong> by the FellowHire platform administration team.</p>
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Organization Name</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Workspace Status</td>
          <td style="padding: 12px 18px; color: #16a34a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">Active &amp; Approved</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Portal Access</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">Full Organization Admin</td>
        </tr>
      </tbody>
    </table>

    <p>You can now log in to manage custom programs, review applicant pipelines, configure custom question banks, and conduct AI-assisted technical interviews.</p>

    <div class="btn-container">
      <a href="%s" class="btn">Log In to Employer Dashboard</a>
    </div>
  `, template.HTMLEscapeString(userName), template.HTMLEscapeString(companyName), template.HTMLEscapeString(companyName), loginURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Your company registration for '%s' has been approved on FellowHire!\n\nStatus: Active & Approved\n\nLog in to your workspace: %s\n\nSupport: %s",
		companyName, loginURL, supportEmail)
	return
}

// 2. Candidate Application Submitted (Before Logic Test) Email Template
func buildApplicationReceivedEmail(candidateName, programName, trackName, testURL, frontendURL, supportEmail string, durationMinutes, passingScore int) (subject string, html string, text string) {
	subject = fmt.Sprintf("Application Confirmed: %s - Next Step: Timed Assessment", programName)

	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "General Track"
	}

	body := fmt.Sprintf(`
    <h2>Application Confirmed!</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>We have successfully received your application for the <strong>%s</strong> (%s).</p>
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Candidate Name</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Fellowship Program</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Specialization Track</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Next Stage</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">Timed Logic MCQ Assessment</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Allocated Duration</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%d Minutes</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Passing Benchmark</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">%d%%</td>
        </tr>
      </tbody>
    </table>

    <div class="guidelines">
      <strong>Important Guidelines for Your Assessment:</strong>
      <ul>
        <li>The timer will start as soon as you open the assessment screen.</li>
        <li>Ensure you have an uninterrupted, stable internet connection.</li>
        <li>Anti-cheat monitoring is active; do not switch browser tabs or exit fullscreen.</li>
      </ul>
    </div>

    <div class="btn-container">
      <a href="%s" class="btn">Start Timed Logic Assessment</a>
    </div>

    <p style="font-size: 12px; color: #64748b; text-align: center;">Or copy this link: <br><a href="%s" style="color: #33125d; word-break: break-all;">%s</a></p>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		durationMinutes, passingScore, testURL, testURL, testURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Dear %s,\n\nYour application for %s (%s) has been received.\n\nNext Step: Timed Logic Assessment (%d minutes, Passing Benchmark: %d%%).\n\nStart your assessment here:\n%s\n\nGood luck!\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, durationMinutes, passingScore, testURL)
	return
}

// 3. Logic Test Submitted Email Template
func buildLogicTestSubmittedEmail(candidateName, programName, trackName, resultURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	subject = fmt.Sprintf("Assessment Answers Received: %s Logic Test", programName)

	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Technical Assessment"
	}

	body := fmt.Sprintf(`
    <h2>Answers Recorded Successfully</h2>
    <p>Hello <strong>%s</strong>,</p>
    <p>Your responses for the <strong>%s</strong> (%s) logic test have been safely received and processed by our automated scoring engine.</p>
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Candidate</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Program</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Track</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Submission Status</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">Completed &amp; Evaluated</td>
        </tr>
      </tbody>
    </table>

    <p>Your test scorecard has been generated with itemized category breakdowns.</p>

    <div class="btn-container">
      <a href="%s" class="btn">View Assessment Result &amp; Scorecard</a>
    </div>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		resultURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Hello %s,\n\nYour responses for the %s (%s) logic test have been successfully received.\n\nView your scorecard:\n%s\n\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, resultURL)
	return
}

// 4. Logic Test Result Email Template (Passed or Not Passed)
func buildLogicTestResultEmail(candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep, frontendURL, supportEmail string) (subject string, html string, text string) {
	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Technical Track"
	}

	if passed {
		subject = fmt.Sprintf("Congratulations! You Passed the %s Assessment (%d%%)", programName, score)
		if actionURL == "" {
			actionURL = resultURL
		}

		nextStageTitle := "Admissions Review"
		nextStageDesc := "Your assessment responses have been officially recorded and forwarded to the admissions committee for review."
		buttonText := "Inspect Assessment Scorecard"

		switch nextStep {
		case "fill_form":
			nextStageTitle = "Candidate Application Profile (Unlocked)"
			nextStageDesc = "Because you cleared the qualifying technical benchmark, please complete your candidate profile, education details, and portfolio to finalize your fellowship admission."
			buttonText = "Complete Application Profile Form"
		case "ai_interview":
			nextStageTitle = "AI Video Interview Room (Unlocked)"
			nextStageDesc = "Because you met the technical benchmark, the admissions committee has officially unlocked your <strong>AI Technical Video Screening Room</strong>."
			buttonText = "Enter AI Video Interview Room"
		}

		body := fmt.Sprintf(`
      <h2>Outstanding Performance!</h2>
      <p>Dear <strong>%s</strong>,</p>
      <p>Congratulations! You have successfully passed the timed logic assessment for <strong>%s</strong> (%s).</p>

      <div class="score-banner">
        <div class="score-label">Your Final Assessment Score</div>
        <div class="score-number">%d%%</div>
        <div class="score-subtext">Passing Benchmark: %d%% &bull; Result: PASSED</div>
      </div>

      <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
        <tbody>
          <tr>
            <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Candidate</td>
            <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
          </tr>
          <tr>
            <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Program &amp; Track</td>
            <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s - %s</td>
          </tr>
          <tr>
            <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Next Stage</td>
            <td style="padding: 12px 18px; color: #16a34a; font-size: 13px; font-weight: 700; text-align: right;">%s</td>
          </tr>
        </tbody>
      </table>

      <p>%s</p>

      <div class="btn-container">
        <a href="%s" class="btn">%s</a>
      </div>

      <p style="font-size: 13px; color: #64748b; text-align: center;">You can also inspect your detailed scorecard at: <a href="%s" style="color: #33125d;">%s</a></p>
    `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
			score, passingScore, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
			template.HTMLEscapeString(nextStageTitle), nextStageDesc,
			actionURL, buttonText, resultURL, resultURL)

		html, _ = renderHTML(subject, frontendURL, supportEmail, body)
		text = fmt.Sprintf("Congratulations %s!\n\nYou passed the %s assessment with a score of %d%% (benchmark: %d%%).\n\nNext Stage: %s\n%s\n\nLink:\n%s\n\nView your detailed scorecard:\n%s\n\nFellowHire Admissions Team",
			candidateName, programName, score, passingScore, nextStageTitle, nextStageDesc, actionURL, resultURL)
	} else {
		subject = fmt.Sprintf("Assessment Results: %s (%d%%)", programName, score)

		body := fmt.Sprintf(`
      <h2>Assessment Result Update</h2>
      <p>Dear <strong>%s</strong>,</p>
      <p>Thank you for participating in the technical assessment for <strong>%s</strong> (%s).</p>

      <div class="score-banner" style="background-color: #f8fafc; border-color: #e2e8f0;">
        <div class="score-label" style="color: #64748b;">Your Assessment Score</div>
        <div class="score-number" style="color: #0f172a;">%d%%</div>
        <div class="score-subtext" style="color: #64748b;">Passing Benchmark: %d%%</div>
      </div>

      <p>While your score did not meet the required threshold for this fellowship cohort, we genuinely appreciate the time and effort you dedicated to the technical assessment.</p>
      <p>We encourage you to review your detailed topic analysis on the scorecard to identify key growth areas, and we welcome your application for future fellowship programs.</p>

      <div class="btn-container">
        <a href="%s" class="btn">Inspect Assessment Scorecard</a>
      </div>
    `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
			score, passingScore, resultURL)

		html, _ = renderHTML(subject, frontendURL, supportEmail, body)
		text = fmt.Sprintf("Dear %s,\n\nThank you for taking the %s assessment.\nYour score: %d%% (Required benchmark: %d%%).\n\nWhile your score did not meet the passing benchmark for this cohort, we encourage you to continue learning and apply for future cohorts.\n\nView your scorecard:\n%s\n\nFellowHire Admissions Team",
			candidateName, programName, score, passingScore, resultURL)
	}
	return
}

// 5. AI Interview Invitation Email Template
func buildAIInterviewInvitationEmail(candidateName, programName, trackName, interviewURL, frontendURL, supportEmail string, expiresAt time.Time) (subject string, html string, text string) {
	subject = fmt.Sprintf("Official Invitation: AI Technical Screening - %s", programName)

	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Fellowship Track"
	}

	expiryStr := expiresAt.Format("Monday, January 2, 2006 at 15:04 MST")
	if expiresAt.IsZero() {
		expiryStr = "Within 7 days of this invitation"
	}

	body := fmt.Sprintf(`
    <h2>You're Invited to the AI Video Interview</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>You have qualified for the next stage of the admissions process: the <strong>AI Technical Video Screening</strong> for <strong>%s</strong> (%s).</p>

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Candidate</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Program &amp; Track</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s - %s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Format</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">5 Video Prompts &bull; AI Evaluated</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Prep Countdown</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">60 Seconds / Prompt</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Response Time</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">90 Seconds / Prompt</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Room Access Deadline</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">%s</td>
        </tr>
      </tbody>
    </table>

    <div class="guidelines">
      <strong>Minimum Device &amp; Environment Requirements:</strong>
      <ul>
        <li><strong>Computer:</strong> Laptop or Desktop computer (Windows, macOS, or Linux). Mobile phones and tablets are not recommended to avoid screen locks or call interruptions.</li>
        <li><strong>Web Browser:</strong> Latest Google Chrome or Microsoft Edge recommended (Safari and Brave supported).</li>
        <li><strong>Webcam &amp; Audio:</strong> Functional 720p HD webcam and clear microphone. Wearing headphones or earbuds is strongly recommended to prevent audio echo.</li>
        <li><strong>Internet Connection:</strong> Stable broadband or high-speed Wi-Fi (minimum 5 Mbps upload/download).</li>
        <li><strong>Environment &amp; Apps:</strong> Quiet, well-lit room. Please close heavy background software (Zoom, Teams, active downloads) beforehand.</li>
      </ul>
    </div>

    <div class="btn-container">
      <a href="%s" class="btn">Enter AI Video Interview Room</a>
    </div>

    <p style="font-size: 12px; color: #64748b; text-align: center;">Direct link: <a href="%s" style="color: #33125d; word-break: break-all;">%s</a></p>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		expiryStr, interviewURL, interviewURL, interviewURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Dear %s,\n\nYou are invited to the AI Technical Video Screening for %s (%s).\n\nAccess your personal interview room:\n%s\n\nDeadline: %s\n\nMinimum Device Requirements:\n- Laptop or Desktop computer (phones/tablets not recommended)\n- Google Chrome or Microsoft Edge browser\n- Working 720p HD webcam and microphone (headphones strongly recommended)\n- Stable internet connection (minimum 5 Mbps)\n- Quiet, well-lit room with background apps closed\n\nFormat: 5 conversational prompts with 60s prep and 90s response\n\nGood luck!\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, interviewURL, expiryStr)
	return
}

// 6. Result of AI Interview / Approved for Final Interview Email Template
// formatWIB formats a time in Jakarta time, e.g. "Monday, 2 November 2026 at 23:59 WIB".
func formatWIB(t time.Time) string {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	if loc == nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	return t.In(loc).Format("Monday, 2 January 2006 at 15:04") + " WIB"
}

func buildAIInterviewReinvitationEmail(candidateName, programName, trackName, interviewURL, notes string, deadline time.Time, frontendURL, supportEmail string) (subject string, html string, text string) {
	subject = fmt.Sprintf("Retake Invitation: AI Technical Screening - %s", programName)

	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Fellowship Track"
	}
	deadlineStr := formatWIB(deadline)

	notesBlock := ""
	notesText := ""
	if strings.TrimSpace(notes) != "" {
		escaped := strings.ReplaceAll(template.HTMLEscapeString(strings.TrimSpace(notes)), "\n", "<br>")
		notesBlock = fmt.Sprintf(`
    <div class="guidelines">
      <strong>Note from the Admissions Team:</strong>
      <p style="margin: 6px 0 0 0;">%s</p>
    </div>
    `, escaped)
		notesText = fmt.Sprintf("Note from the Admissions Team:\n%s\n\n", strings.TrimSpace(notes))
	}

	body := fmt.Sprintf(`
    <h2>You're Invited to Retake the AI Interview</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>You can take the <strong>AI Technical Video Screening</strong> for <strong>%s</strong> (%s) again. Your previous attempt has been set aside, and this new take will be the one reviewed.</p>
    %s
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; width: 45%%;">Start Before</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">%s</td>
        </tr>
      </tbody>
    </table>

    <p style="font-size: 13px; color: #475569;">Please use a laptop or desktop with Chrome or Edge, a working webcam and microphone, and a stable connection. After the deadline the link can no longer be started.</p>

    <div class="btn-container">
      <a href="%s" class="btn">Enter AI Video Interview Room</a>
    </div>

    <p style="font-size: 12px; color: #64748b; text-align: center;">Direct link: <a href="%s" style="color: #33125d; word-break: break-all;">%s</a></p>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		notesBlock, deadlineStr, interviewURL, interviewURL, interviewURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Dear %s,\n\nYou can take the AI Technical Video Screening for %s (%s) again. Your previous attempt has been set aside, and this new take will be the one reviewed.\n\n%sStart before: %s\n\nYour interview room:\n%s\n\nPlease use a laptop or desktop with Chrome or Edge, a working webcam and microphone, and a stable connection. After the deadline the link can no longer be started.\n\nGood luck!\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, notesText, deadlineStr, interviewURL)
	return
}

func buildFinalInterviewInvitationEmail(candidateName, programName, trackName, dashboardURL, notes, frontendURL, supportEmail string) (subject string, html string, text string) {
	subject = fmt.Sprintf("Congratulations! Next Stage Invitation - %s", programName)

	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Fellowship Track"
	}

	notesBlock := ""
	if strings.TrimSpace(notes) != "" {
		notesBlock = fmt.Sprintf(`
      <div class="guidelines">
        <strong>Notes from the Admissions Committee:</strong>
        <p style="margin: 6px 0 0 0; font-style: italic;">"%s"</p>
      </div>
    `, template.HTMLEscapeString(notes))
	}

	body := fmt.Sprintf(`
    <h2>Admissions Committee Approval</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>We are delighted to inform you that your application and assessments for <strong>%s</strong> (%s) have been <strong>officially approved by the Admissions Committee</strong>!</p>

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Candidate</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Program &amp; Track</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s - %s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Current Stage</td>
          <td style="padding: 12px 18px; color: #047857; font-size: 13px; font-weight: 700; text-align: right;">Approved for Next Stage</td>
        </tr>
      </tbody>
    </table>

    %s

    <p>You have advanced to the next stage of the selection process for %s (%s).</p>
    <p>Please log in to your candidate dashboard to review your status, schedule instructions, and next steps.</p>

    <div class="btn-container">
      <a href="%s" class="btn">Open Candidate Dashboard</a>
    </div>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		notesBlock, template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay), dashboardURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Congratulations %s!\n\nYour application and assessments for %s (%s) have been approved by the Admissions Committee!\n\nYou have advanced to the next stage.\n\nOpen your candidate dashboard for details:\n%s\n\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, dashboardURL)
	return
}

// 7. Account Activation Email Template
func buildAccountActivationEmail(userName, activationURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	if userName == "" {
		userName = "there"
	}
	subject = "Activate Your FellowHire Account"

	body := fmt.Sprintf(`
    <span class="badge badge-purple">Account Verification</span>
    <h2>Welcome to FellowHire, %s!</h2>
    <p>Thank you for creating an account on FellowHire. To complete your registration and activate your account, please verify your email address by clicking the button below.</p>
    
    <div class="btn-container">
      <a href="%s" class="btn">Activate My Account</a>
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Verification Link Validity</span>
        <span class="info-value">24 Hours</span>
      </div>
      <div class="info-row">
        <span class="info-label">Security Note</span>
        <span class="info-value">Never share this link with others</span>
      </div>
    </div>

    <p style="font-size: 12px; color: #64748b;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="%s" style="color: #33125d; word-break: break-all;">%s</a>
    </p>

    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
      If you did not sign up for a FellowHire account, you can safely ignore this email.
    </p>
  `, template.HTMLEscapeString(userName), activationURL, activationURL, activationURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Welcome to FellowHire, %s!\n\nPlease activate your account by visiting the link below:\n\n%s\n\nThis activation link will expire in 24 hours.\n\nIf you did not create an account, please ignore this email.\n\nSupport: %s",
		userName, activationURL, supportEmail)
	return
}

// 7b. Password Reset Email Template
func buildPasswordResetEmail(userName, resetURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	if userName == "" {
		userName = "there"
	}
	subject = "Reset Your FellowHire Password"

	body := fmt.Sprintf(`
    <span class="badge badge-purple">Password Reset</span>
    <h2>Password Reset Request</h2>
    <p>Hello %s,</p>
    <p>We received a request to reset the password for your FellowHire account. You can set a new password by clicking the button below:</p>
    
    <div class="btn-container">
      <a href="%s" class="btn">Reset My Password</a>
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Link Expiration</span>
        <span class="info-value">1 Hour</span>
      </div>
      <div class="info-row">
        <span class="info-label">Security Notice</span>
        <span class="info-value">Never share this link with anyone</span>
      </div>
    </div>

    <p style="font-size: 12px; color: #64748b;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="%s" style="color: #33125d; word-break: break-all;">%s</a>
    </p>

    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
      If you did not request a password reset, you can safely ignore this email. Your password will not change and your account remains secure.
    </p>
  `, template.HTMLEscapeString(userName), resetURL, resetURL, resetURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Hello %s,\n\nWe received a request to reset your FellowHire password. Please visit the link below to set a new password:\n\n%s\n\nThis reset link will expire in 1 hour.\n\nIf you did not request a password reset, please ignore this email. Your password will remain unchanged.\n\nSupport: %s",
		userName, resetURL, supportEmail)
	return
}

// 8. Admin & Superadmin Team Invitation Email Template
func buildAdminInvitationEmail(inviterName, role, orgName, inviteURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	if inviterName == "" {
		inviterName = "A team administrator"
	}

	roleDisplay := "Organization Administrator"
	switch role {
	case "superadmin":
		roleDisplay = "Platform Superadmin"
	case "reviewer":
		roleDisplay = "Reviewer / Evaluator"
	case "mentor":
		roleDisplay = "Program Mentor"
	}

	if role == "superadmin" {
		subject = "You have been invited as a Platform Superadmin on FellowHire"
	} else if orgName != "" {
		subject = fmt.Sprintf("You have been invited to join %s on FellowHire", orgName)
	} else {
		subject = "You have been invited to join the administrative team on FellowHire"
	}

	scopeDescription := ""
	if role == "superadmin" {
		scopeDescription = "You have been invited to join FellowHire as a <strong>Platform Superadmin</strong>, granting full platform-level administrative privileges."
	} else {
		scopeDescription = fmt.Sprintf("%s has invited you to join <strong>%s</strong> as an <strong>%s</strong> on FellowHire.",
			template.HTMLEscapeString(inviterName), template.HTMLEscapeString(orgName), template.HTMLEscapeString(roleDisplay))
	}

	body := fmt.Sprintf(`
    <span class="badge badge-purple">Team Invitation</span>
    <h2>Join the Administrative Team</h2>
    <p>%s</p>
    
    <div class="btn-container">
      <a href="%s" class="btn">Accept Invitation & Join Team</a>
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Assigned Role</span>
        <span class="info-value">%s</span>
      </div>
      %s
      <div class="info-row">
        <span class="info-label">Invited By</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Invitation Expiration</span>
        <span class="info-value">7 Days</span>
      </div>
    </div>

    <p style="font-size: 12px; color: #64748b;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="%s" style="color: #33125d; word-break: break-all;">%s</a>
    </p>

    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
      If you did not expect this invitation, you can safely ignore this email.
    </p>
  `, scopeDescription, inviteURL,
		template.HTMLEscapeString(roleDisplay),
		func() string {
			if orgName != "" {
				return fmt.Sprintf(`<div class="info-row"><span class="info-label">Organization</span><span class="info-value">%s</span></div>`, template.HTMLEscapeString(orgName))
			}
			return ""
		}(),
		template.HTMLEscapeString(inviterName),
		inviteURL, inviteURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("You have been invited to FellowHire!\n\n%s has invited you as %s%s.\n\nAccept your invitation at:\n%s\n\nThis invitation will expire in 7 days.\n\nSupport: %s",
		inviterName, roleDisplay, func() string {
			if orgName != "" {
				return " for " + orgName
			}
			return ""
		}(), inviteURL, supportEmail)
	return
}

func replaceTemplateVariables(input string, vars map[string]string) string {
	res := input
	for k, v := range vars {
		res = strings.ReplaceAll(res, "{{"+k+"}}", v)
		res = strings.ReplaceAll(res, "{{ "+k+" }}", v)
	}
	return res
}

func buildCustomEmail(
	cfg *model.EmailTemplateConfig,
	vars map[string]string,
	actionURL string,
	frontendURL string,
	supportEmail string,
) (subject string, html string, text string) {
	if cfg == nil {
		return "", "", ""
	}

	subject = replaceTemplateVariables(cfg.Subject, vars)
	if subject == "" {
		subject = "Fellowship Application Notification"
	}

	headline := replaceTemplateVariables(cfg.Headline, vars)
	bodyText := replaceTemplateVariables(cfg.Body, vars)
	buttonText := replaceTemplateVariables(cfg.ButtonText, vars)
	if buttonText == "" && actionURL != "" {
		buttonText = "View Details"
	}

	var bodyBuilder strings.Builder
	if headline != "" {
		bodyBuilder.WriteString(fmt.Sprintf(`<h2 style="margin: 0 0 18px 0; color: #0f172a; font-size: 20px; font-weight: 800; line-height: 1.3;">%s</h2>`, template.HTMLEscapeString(headline)))
	}

	// Split body into paragraphs
	paragraphs := strings.Split(bodyText, "\n\n")
	for _, p := range paragraphs {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" {
			continue
		}
		// Convert single newlines inside a paragraph into <br>
		escaped := template.HTMLEscapeString(trimmed)
		withBreaks := strings.ReplaceAll(escaped, "\n", "<br>")
		bodyBuilder.WriteString(fmt.Sprintf(`<p style="margin: 0 0 16px 0; line-height: 1.6; color: #334155; font-size: 14px;">%s</p>`, withBreaks))
	}

	if actionURL != "" && buttonText != "" {
		bodyBuilder.WriteString(fmt.Sprintf(`
    <div class="btn-container" style="margin: 28px 0; text-align: center;">
      <a href="%s" class="btn" style="display: inline-block; padding: 14px 32px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">%s</a>
    </div>
    <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 12px;">Or open this link directly in your browser: <br><a href="%s" style="color: #4f46e5; word-break: break-all;">%s</a></p>
		`, actionURL, template.HTMLEscapeString(buttonText), actionURL, actionURL))
	}

	html, _ = renderHTML(subject, frontendURL, supportEmail, bodyBuilder.String())
	text = bodyText
	if actionURL != "" {
		text += "\n\n" + buttonText + ": " + actionURL
	}
	text += "\n\nSupport: " + supportEmail
	return
}

func buildRejectionEmail(candidateName, programName, trackName, notes, frontendURL, supportEmail string) (subject string, html string, text string) {
	subject = fmt.Sprintf("Application Update: %s", programName)

	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "General Track"
	}

	var notesHTML string
	if notes != "" {
		notesHTML = fmt.Sprintf(`<div class="guidelines" style="margin: 20px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px 20px; border-radius: 16px;"><strong>Admissions Feedback:</strong><p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">%s</p></div>`, template.HTMLEscapeString(notes))
	}

	body := fmt.Sprintf(`
    <h2>Application Status Update</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>Thank you for your application to <strong>%s</strong> (%s) and for your time and participation throughout our selection process.</p>
    <p>After thorough review, we regret to inform you that we are unable to offer you admission into this fellowship cohort. Because of limited seats and a large volume of highly qualified candidates, our admissions committee had to make difficult selection decisions.</p>
    %s
    <p>We truly appreciate your dedication and encourage you to continue developing your skills and apply for future cohorts.</p>
    <p>We wish you all the best in your career and academic journey.</p>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay), notesHTML)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Dear %s,\n\nThank you for applying to %s (%s).\n\nAfter thorough review, we regret to inform you that we are unable to offer you admission to this cohort.\n\nWe wish you all the best in your career journey.\n\nSupport: %s",
		candidateName, programName, trackDisplay, supportEmail)
	return
}

// 9. Program Room Invitation Email Template
func buildProgramRoomInvitationEmail(candidateName, programName, trackName, roomURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	if candidateName == "" {
		candidateName = "Candidate"
	}
	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "General Track"
	}
	subject = fmt.Sprintf("🎉 Welcome to the Program Room! Official Invitation - %s", programName)

	body := fmt.Sprintf(`
    <span class="badge badge-emerald">Cohort Access Granted</span>
    <h2>Welcome to the Program Room</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>Congratulations! Following your official acceptance into <strong>%s</strong> (%s), you have now been granted direct access to your <strong>Fellowship Program Room</strong>.</p>
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Fellow</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Program &amp; Track</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s - %s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Status</td>
          <td style="padding: 12px 18px; color: #047857; font-size: 13px; font-weight: 700; text-align: right;">Program Room Unlocked</td>
        </tr>
      </tbody>
    </table>

    <p>In your Program Room, you will find session schedules, curriculum materials, cohort peers, mentorship channels, and fellowship resources.</p>

    <div class="btn-container">
      <a href="%s" class="btn" style="background-color: #33125d; color: #ffffff;">Enter Program Room</a>
    </div>

    <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 16px;">
      You can also access the room anytime directly from your <a href="%s/candidate/dashboard" style="color: #33125d; font-weight: 600;">Candidate Dashboard</a>.
    </p>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		roomURL, frontendURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Congratulations %s!\n\nYou have been officially invited to the Program Room for %s (%s)!\n\nEnter your Program Room here:\n%s\n\nOr access it anytime from your Candidate Dashboard:\n%s/candidate/dashboard\n\nWelcome aboard,\nFellowHire Admissions & Mentorship Team",
		candidateName, programName, trackDisplay, roomURL, frontendURL)
	return
}

// buildCertificateEmail generates branded HTML and plain-text email for certificate & badge issuance
func buildCertificateEmail(candidateName, programName, trackName, certNumber, certURL, badgeURL string, issueDate time.Time, frontendURL, supportEmail string) (subject, html, text string) {
	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Fellowship Track"
	}
	subject = fmt.Sprintf("🎓 Official Certificate of Completion: %s - %s", programName, candidateName)

	dateFormatted := issueDate.Format("January 02, 2006")

	body := fmt.Sprintf(`
    <span class="badge badge-amber">Official Credential Issued</span>
    <h2>Congratulations on your graduation</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>We are delighted to congratulate you on successfully completing and graduating from <strong>%s</strong> (%s)!</p>
    
    <div style="background: linear-gradient(135deg, #2b0d52 0%%, #401b70 50%%, #1e0939 100%%); border-radius: 16px; padding: 24px; color: #ffffff; text-align: center; margin: 24px 0; border: 2px solid #f59e0b; box-shadow: 0 10px 25px -5px rgba(51, 18, 93, 0.3);">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #fde68a; font-weight: 800;">Fellowship Certificate of Completion</div>
      <div style="font-size: 20px; font-weight: 900; margin: 10px 0 4px 0; color: #ffffff;">%s</div>
      <div style="font-size: 13px; color: #e9d5ff;">has successfully completed all requirements for</div>
      <div style="font-size: 16px; font-weight: 800; color: #fbbf24; margin: 6px 0;">%s</div>
      <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.12); padding: 4px 12px; border-radius: 20px; font-size: 11px; color: #f3e8ff; margin-top: 8px;">
        Credential ID: <strong style="color: #ffffff; letter-spacing: 0.5px;">%s</strong> &bull; %s
      </div>
    </div>

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 20px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 45%%;">Recipient</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Program</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s (%s)</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Certificate ID</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Status</td>
          <td style="padding: 12px 18px; color: #047857; font-size: 13px; font-weight: 700; text-align: right;">Verified &amp; Active</td>
        </tr>
      </tbody>
    </table>

    <p>Your official verifiable certificate and Open Badges (1EdTech / IMS Global Open Badges compliant) are now published and accessible online. You can view, download as PDF, print, and share your credential directly on LinkedIn.</p>

    <div class="btn-container">
      <a href="%s" class="btn" style="background-color: #33125d; color: #ffffff;">View &amp; Download Certificate</a>
    </div>

    <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 16px;">
      You can also access your earned badges and certificate anytime directly from your <a href="%s/candidate/dashboard" style="color: #33125d; font-weight: 600;">Candidate Dashboard</a>.
    </p>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(certNumber), dateFormatted,
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay), template.HTMLEscapeString(certNumber),
		certURL, frontendURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Congratulations %s!\n\nYou have officially graduated from %s (%s)!\n\nCertificate ID: %s\nIssue Date: %s\n\nView and download your official certificate:\n%s\n\nAccess your badges & credentials anytime from your Candidate Dashboard:\n%s/candidate/dashboard\n\nWarm regards,\nFellowHire & KulKul Fellowship Board",
		candidateName, programName, trackDisplay, certNumber, dateFormatted, certURL, frontendURL)
	return
}

// buildSessionInvitationEmail generates the calendar invitation email with Google Meet and Google Calendar links.
func buildSessionInvitationEmail(
	recipientName, programName, trackName string,
	session *model.ProgramSession,
	googleCalURL string,
	frontendURL, supportEmail string,
) (subject string, html string, text string) {
	c := sessionEmailCopy{
		Subject:     fmt.Sprintf("Calendar Invitation: %s - %s", session.Title, programName),
		Label:       "Cohort Session Invitation",
		HeadingHTML: "You're invited to " + template.HTMLEscapeString(session.Title),
		IntroHTML: fmt.Sprintf("A live cohort session has been scheduled for <strong>%s</strong>. Join your mentors and fellow cohort members on Google Meet.",
			template.HTMLEscapeString(programName)),
		TextIntro: fmt.Sprintf("You are invited to a live cohort session for %s.", programName),
	}
	if session.RecurrenceDescription != "" {
		c.Subject = fmt.Sprintf("Calendar Invitation (repeating): %s - %s", session.Title, programName)
	}
	return buildSessionEmail(c, recipientName, programName, trackName, session, googleCalURL, frontendURL, supportEmail)
}

// sessionEmailCopy is the wording that differs between a session invite and its reminders.
type sessionEmailCopy struct {
	Subject     string
	Label       string // small label above the heading (plain text)
	HeadingHTML string // already escaped
	IntroHTML   string // already escaped
	TextIntro   string // plain-text version of the intro
}

// buildSessionReminderEmail reminds an invitee that a session starts soon ("tomorrow", "in 1 hour").
func buildSessionReminderEmail(
	recipientName, programName, trackName string,
	session *model.ProgramSession,
	googleCalURL, startsIn string,
	frontendURL, supportEmail string,
) (subject string, html string, text string) {
	c := sessionEmailCopy{
		Subject:     fmt.Sprintf("Reminder: %s starts %s - %s", session.Title, startsIn, programName),
		Label:       "Session Reminder",
		HeadingHTML: fmt.Sprintf("%s starts %s", template.HTMLEscapeString(session.Title), template.HTMLEscapeString(startsIn)),
		IntroHTML: fmt.Sprintf("This is a reminder that your <strong>%s</strong> session starts %s. The details and links are below.",
			template.HTMLEscapeString(programName), template.HTMLEscapeString(startsIn)),
		TextIntro: fmt.Sprintf("Reminder: your %s session starts %s.", programName, startsIn),
	}
	return buildSessionEmail(c, recipientName, programName, trackName, session, googleCalURL, frontendURL, supportEmail)
}

func buildSessionEmail(
	c sessionEmailCopy,
	recipientName, programName, trackName string,
	session *model.ProgramSession,
	googleCalURL string,
	frontendURL, supportEmail string,
) (subject string, html string, text string) {
	subject = c.Subject

	trackBadge := ""
	if trackName != "" {
		trackBadge = fmt.Sprintf(`<span style="color: #64748b;"> · %s track</span>`, template.HTMLEscapeString(trackName))
	}

	loc, _ := time.LoadLocation("Asia/Jakarta")
	if loc == nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	startTimeWIB := session.StartTime.In(loc).Format("Monday, 02 Jan 2006, 15:04")
	endTimeWIB := session.EndTime.In(loc).Format("15:04 WIB")
	timeStr := fmt.Sprintf("%s – %s", startTimeWIB, endTimeWIB)

	// Without a meeting link the email says so instead of pointing at a room that doesn't exist.
	meetURL := session.MeetingURL
	meetCell := `<span style="color: #64748b; font-weight: 600;">Link will be shared before the session</span>`
	meetButton := ""
	meetText := "will be shared before the session"
	if meetURL != "" {
		meetCell = fmt.Sprintf(`<a href="%s" style="color: #2563eb; text-decoration: underline;">%s</a>`, template.HTMLEscapeString(meetURL), template.HTMLEscapeString(meetURL))
		meetButton = fmt.Sprintf(`<a href="%s" style="display: inline-block; background-color: #33125d; color: #ffffff !important; padding: 12px 26px; border-radius: 9999px; font-weight: 700; font-size: 14px; line-height: 1.2; text-decoration: none; margin: 0 4px 10px 4px;">Join Google Meet</a>`, template.HTMLEscapeString(meetURL))
		meetText = meetURL
	}

	workspaceURL := fmt.Sprintf("%s/sessions/%s/room", frontendURL, session.ID)
	if googleCalURL == "" {
		googleCalURL = googleCalendarTemplateURL(session, programName, workspaceURL)
	}

	typeLabel := "Live Lecture"
	switch session.SessionType {
	case model.SessionTypeWorkshop:
		typeLabel = "Interactive Workshop"
	case model.SessionTypeMentorshipSync:
		typeLabel = "Mentorship Sync"
	case model.SessionTypeGroupSync:
		typeLabel = "Group Sync"
	case model.SessionTypeDemoDay:
		typeLabel = "Demo Day Presentation"
	case model.SessionType1On1:
		typeLabel = "1-on-1 Mentoring"
	}

	mentorRow := ""
	if session.RecurrenceDescription != "" {
		mentorRow += fmt.Sprintf(`
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Repeats</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>`, template.HTMLEscapeString(session.RecurrenceDescription))
	}
	if session.MentorName != "" {
		mentorRow += fmt.Sprintf(`
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Session Host</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>`, template.HTMLEscapeString(session.MentorName))
	}

	agendaSection := ""
	if session.Description != "" {
		agendaSection = fmt.Sprintf(`
      <div style="margin: 24px 0; padding: 16px 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.7px;">Agenda &amp; Topics</h4>
        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #334155; white-space: pre-wrap;">%s</p>
      </div>`, template.HTMLEscapeString(session.Description))
	}

	body := fmt.Sprintf(`
    <span class="badge badge-purple">%s%s</span>

    <h2>%s</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>%s</p>

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7; width: 40%%;">Session Title</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Session Type</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf2f7;">Schedule (WIB)</td>
          <td style="padding: 12px 18px; color: #33125d; font-size: 13px; font-weight: 800; text-align: right; border-bottom: 1px solid #edf2f7;">%s</td>
        </tr>
        %s
        <tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600;">Google Meet</td>
          <td style="padding: 12px 18px; color: #2563eb; font-size: 13px; font-weight: 700; text-align: right;">
            %s
          </td>
        </tr>
      </tbody>
    </table>

    %s

    <div style="text-align: center; margin: 32px 0 16px 0;">
      %s
      <a href="%s" target="_blank" style="display: inline-block; background-color: #ffffff; color: #334155 !important; border: 1px solid #cbd5e1; padding: 11px 24px; border-radius: 9999px; font-weight: 700; font-size: 14px; line-height: 1.2; text-decoration: none; margin: 0 4px 10px 4px;">Add to Google Calendar</a>
    </div>

    <div style="text-align: center; margin-top: 12px;">
      <a href="%s" style="font-size: 12px; color: #64748b; text-decoration: underline;">Open the Live Workspace (code editor &amp; whiteboard)</a>
    </div>
`,
		template.HTMLEscapeString(c.Label), trackBadge, c.HeadingHTML, template.HTMLEscapeString(recipientName), c.IntroHTML,
		template.HTMLEscapeString(session.Title), template.HTMLEscapeString(typeLabel), timeStr, mentorRow,
		meetCell, agendaSection,
		meetButton, googleCalURL, workspaceURL,
	)

	var err error
	html, err = renderHTML(subject, frontendURL, supportEmail, body)
	if err != nil {
		html = body
	}

	text = fmt.Sprintf(
		"Dear %s,\n\n%s\n\nSession: %s\nType: %s\nTime: %s\nGoogle Meet: %s\nAdd to Google Calendar: %s\nLive Workspace: %s\n\nSee you there!\nFellowHire Team",
		recipientName, c.TextIntro, session.Title, typeLabel, timeStr, meetText, googleCalURL, workspaceURL,
	)
	return subject, html, text
}

// buildAssignmentEmail announces an assignment to a fellow: title, due date, points and a link to it.
func buildAssignmentEmail(recipientName, programName string, a *model.ProgramAssignment, assignmentURL, frontendURL, supportEmail string) (subject, html, text string) {
	return buildAssignmentNotice(assignmentEmailCopy{
		Subject:     fmt.Sprintf("New assignment: %s - %s", a.Title, programName),
		Label:       "",
		HeadingHTML: "New assignment: " + template.HTMLEscapeString(a.Title),
		IntroHTML:   fmt.Sprintf("You have a new assignment in <strong>%s</strong>.", template.HTMLEscapeString(programName)),
		TextIntro:   fmt.Sprintf("You have a new assignment in %s: %s", programName, a.Title),
	}, recipientName, a, assignmentURL, frontendURL, supportEmail)
}

// buildAssignmentReminderEmail reminds a fellow who hasn't submitted that an assignment is due soon.
func buildAssignmentReminderEmail(recipientName, programName string, a *model.ProgramAssignment, dueIn, assignmentURL, frontendURL, supportEmail string) (subject, html, text string) {
	return buildAssignmentNotice(assignmentEmailCopy{
		Subject:     fmt.Sprintf("Reminder: %s is due %s - %s", a.Title, dueIn, programName),
		Label:       "Assignment Reminder",
		HeadingHTML: fmt.Sprintf("%s is due %s", template.HTMLEscapeString(a.Title), template.HTMLEscapeString(dueIn)),
		IntroHTML: fmt.Sprintf("You haven't submitted this <strong>%s</strong> assignment yet. It is due %s.",
			template.HTMLEscapeString(programName), template.HTMLEscapeString(dueIn)),
		TextIntro: fmt.Sprintf("Reminder: you haven't submitted %s for %s yet. It is due %s.", a.Title, programName, dueIn),
	}, recipientName, a, assignmentURL, frontendURL, supportEmail)
}

type assignmentEmailCopy struct {
	Subject     string
	Label       string // optional small label above the heading (plain text)
	HeadingHTML string // already escaped
	IntroHTML   string // already escaped
	TextIntro   string
}

func buildAssignmentNotice(c assignmentEmailCopy, recipientName string, a *model.ProgramAssignment, assignmentURL, frontendURL, supportEmail string) (subject, html, text string) {
	if recipientName == "" {
		recipientName = "Fellow"
	}
	subject = c.Subject

	due := "No deadline"
	if a.DueDate != nil {
		loc, _ := time.LoadLocation("Asia/Jakarta")
		if loc == nil {
			loc = time.FixedZone("WIB", 7*3600)
		}
		due = a.DueDate.In(loc).Format("Monday, 02 Jan 2006, 15:04") + " WIB"
	}

	// A short preview of the instructions; the full text is in the program room
	preview := strings.TrimSpace(a.Description)
	if r := []rune(preview); len(r) > 300 {
		preview = strings.TrimSpace(string(r[:300])) + "…"
	}
	previewHTML := ""
	if preview != "" {
		previewHTML = fmt.Sprintf(`<p style="white-space: pre-line; color: #475569; font-size: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px;">%s</p>`, template.HTMLEscapeString(preview))
	}

	row := func(label, value string, last bool) string {
		border := "border-bottom: 1px solid #edf2f7;"
		if last {
			border = ""
		}
		return fmt.Sprintf(`<tr>
          <td style="padding: 12px 18px; color: #64748b; font-size: 13px; font-weight: 600; width: 40%%; %s">%s</td>
          <td style="padding: 12px 18px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right; %s">%s</td>
        </tr>`, border, label, border, template.HTMLEscapeString(value))
	}

	label := ""
	if c.Label != "" {
		label = fmt.Sprintf(`<span class="badge badge-amber">%s</span>`, template.HTMLEscapeString(c.Label))
	}
	body := fmt.Sprintf(`
    %s
    <h2>%s</h2>
    <p>Hi <strong>%s</strong>,</p>
    <p>%s</p>

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;" cellpadding="0" cellspacing="0">
      <tbody>%s%s</tbody>
    </table>
    %s
    <div class="btn-container">
      <a href="%s" class="btn" style="background-color: #33125d; color: #ffffff;">Open Assignment</a>
    </div>
  `, label, c.HeadingHTML, template.HTMLEscapeString(recipientName), c.IntroHTML,
		row("Due", due, false), row("Points", fmt.Sprintf("%d", a.MaxScore), true),
		previewHTML, template.HTMLEscapeString(assignmentURL))

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Hi %s,\n\n%s\n\nDue: %s\nPoints: %d\n\n%s\n\nOpen it here:\n%s\n",
		recipientName, c.TextIntro, due, a.MaxScore, preview, assignmentURL)
	return
}

// googleCalendarTemplateURL opens Google Calendar's "add event" page filled in with the session,
// for invites sent when no Google Calendar event exists.
func googleCalendarTemplateURL(session *model.ProgramSession, programName, workspaceURL string) string {
	const layout = "20060102T150405Z"
	details := fmt.Sprintf("%s\n\nLive Workspace: %s", programName, workspaceURL)
	if session.MeetingURL != "" {
		details += "\nGoogle Meet: " + session.MeetingURL
	}
	q := url.Values{}
	q.Set("action", "TEMPLATE")
	q.Set("text", session.Title)
	q.Set("dates", session.StartTime.UTC().Format(layout)+"/"+session.EndTime.UTC().Format(layout))
	q.Set("details", details)
	if session.MeetingURL != "" {
		q.Set("location", session.MeetingURL)
	}
	return "https://calendar.google.com/calendar/render?" + q.Encode()
}
