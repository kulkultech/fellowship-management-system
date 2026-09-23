package email

import (
	"bytes"
	"fmt"
	"html/template"
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
  <title>{{.Subject}}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 32px 12px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 20px rgba(51, 18, 93, 0.06);
    }
    .header {
      background-color: #33125d;
      padding: 28px 32px;
      text-align: left;
      border-bottom: 4px solid #fe900d;
    }
    .header-logo {
      font-size: 22px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.5px;
      text-decoration: none;
      display: inline-block;
    }
    .header-logo span {
      color: #fe900d;
    }
    .header-tagline {
      font-size: 12px;
      color: #cbd5e1;
      margin-top: 4px;
      font-weight: 500;
    }
    .content {
      padding: 36px 32px;
    }
    .content h2 {
      margin-top: 0;
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.4px;
      line-height: 1.3;
    }
    .content p {
      font-size: 14px;
      line-height: 1.65;
      color: #334155;
      margin: 16px 0;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 20px;
    }
    .badge-purple {
      background-color: #f3e8ff;
      color: #33125d;
      border: 1px solid #d8b4fe;
    }
    .badge-emerald {
      background-color: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    .badge-amber {
      background-color: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .info-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px 20px;
      margin: 24px 0;
    }
    .info-row {
      display: table;
      width: 100%;
      padding: 7px 0;
      font-size: 13px;
      border-bottom: 1px dashed #e2e8f0;
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
      background-color: #f3e8ff;
      border: 1px solid #d8b4fe;
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .score-label {
      font-size: 11px;
      font-weight: 800;
      color: #33125d;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .score-number {
      font-size: 38px;
      font-weight: 900;
      color: #33125d;
      line-height: 1.1;
      margin: 6px 0;
    }
    .score-subtext {
      font-size: 12px;
      font-weight: 600;
      color: #6b21a8;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 16px 0;
    }
    .btn {
      display: inline-block;
      background-color: #33125d;
      color: #ffffff !important;
      padding: 14px 34px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(51, 18, 93, 0.25);
    }
    .guidelines {
      background-color: #faf5ff;
      border-left: 4px solid #33125d;
      border-radius: 0 12px 12px 0;
      padding: 14px 18px;
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
      background-color: #f8fafc;
      padding: 24px 32px;
      border-top: 1px solid #e2e8f0;
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
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- HEADER -->
      <div class="header">
        <a href="{{.FrontendURL}}" class="header-logo">KulKul <span>|</span> FellowHire</a>
        <div class="header-tagline">Fellowship Management Platform</div>
      </div>

      <!-- CONTENT BODY -->
      <div class="content">
        {{.BodyHTML}}
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p style="margin: 0 0 6px 0;"><strong>FellowHire Assessment Platform</strong> &bull; Powered by KulKul Tech</p>
        <p style="margin: 0 0 8px 0;">Questions? Contact our admissions support at <a href="mailto:{{.SupportEmail}}">{{.SupportEmail}}</a>.</p>
        <p style="font-size: 11px; color: #94a3b8; margin: 8px 0 0 0;">This is an automated notification. Please do not share your private assessment or interview tokens with anyone.</p>
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
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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

      <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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

    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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
		bodyBuilder.WriteString(fmt.Sprintf(`<h2 style="margin: 0 0 18px 0; color: #1e1b4b; font-size: 22px; font-weight: 800; line-height: 1.3;">%s</h2>`, template.HTMLEscapeString(headline)))
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
		notesHTML = fmt.Sprintf(`<div class="guidelines" style="margin: 20px 0; background-color: #f8fafc; border-left: 4px solid #94a3b8; padding: 14px 18px; border-radius: 6px;"><strong>Admissions Feedback:</strong><p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">%s</p></div>`, template.HTMLEscapeString(notes))
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
    <span class="badge badge-purple" style="background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">Cohort Access Granted</span>
    <h2>Welcome to the Program Room! 🎉</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>Congratulations! Following your official acceptance into <strong>%s</strong> (%s), you have now been granted direct access to your <strong>Fellowship Program Room</strong>.</p>
    
    <table style="width: 100%%; border-collapse: separate; border-spacing: 0; margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;" cellpadding="0" cellspacing="0">
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



