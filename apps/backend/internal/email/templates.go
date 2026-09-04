package email

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
	"time"
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
        <div class="header-tagline">Remote Skills Academy (RSA) Fellowship Management Platform</div>
      </div>

      <!-- CONTENT BODY -->
      <div class="content">
        {{.BodyHTML}}
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p style="margin: 0 0 6px 0;"><strong>FellowHire Assessment Platform</strong> &bull; Powered by KulKul Tech &amp; Remote Skills Academy</p>
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
    <span class="badge badge-purple">Company Registration</span>
    <h2>Welcome to FellowHire, %s!</h2>
    <p>Thank you for registering <strong>%s</strong> on the FellowHire Multi-Tenant Assessment Platform.</p>
    <p>Your company workspace has been initialized and is queued for verification by the platform administration team.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Organization Name</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Admin Contact</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Platform Status</span>
        <span class="info-value">Pending Platform Review</span>
      </div>
    </div>

    <p>Once approved, you will be able to launch custom fellowship assessment programs, configure domain-specific MCQ banks, and evaluate candidate video responses with Cloudflare AI rubrics.</p>

    <div class="btn-container">
      <a href="%s" class="btn">Access Reviewer Admin Portal</a>
    </div>
  `, template.HTMLEscapeString(userName), template.HTMLEscapeString(companyName), template.HTMLEscapeString(companyName), template.HTMLEscapeString(userName), loginURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Welcome to FellowHire, %s!\n\nYour organization '%s' has been registered on the platform.\nStatus: Pending Platform Review\n\nLogin to the admin portal: %s\n\nContact support: %s",
		userName, companyName, loginURL, supportEmail)
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
    <span class="badge badge-purple">Application Received</span>
    <h2>Application Confirmed!</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>We have successfully received your application for the <strong>%s</strong> (%s).</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Candidate Name</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Fellowship Program</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Specialization Track</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Next Stage</span>
        <span class="info-value">Timed Logic MCQ Assessment</span>
      </div>
      <div class="info-row">
        <span class="info-label">Allocated Duration</span>
        <span class="info-value">%d Minutes</span>
      </div>
      <div class="info-row">
        <span class="info-label">Passing Benchmark</span>
        <span class="info-value">%d%%</span>
      </div>
    </div>

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
    <span class="badge badge-purple">Assessment Submitted</span>
    <h2>Answers Recorded Successfully</h2>
    <p>Hello <strong>%s</strong>,</p>
    <p>Your responses for the <strong>%s</strong> (%s) logic test have been safely received and processed by our automated scoring engine.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Candidate</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Program</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Track</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Submission Status</span>
        <span class="info-value">Completed &amp; Evaluated</span>
      </div>
    </div>

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
func buildLogicTestResultEmail(candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, aiInterviewURL, frontendURL, supportEmail string) (subject string, html string, text string) {
	trackDisplay := trackName
	if trackDisplay == "" {
		trackDisplay = "Technical Track"
	}

	if passed {
		subject = fmt.Sprintf("Congratulations! You Passed the %s Assessment (%d%%)", programName, score)
		actionURL := resultURL
		if aiInterviewURL != "" {
			actionURL = aiInterviewURL
		}

		body := fmt.Sprintf(`
      <span class="badge badge-emerald">Assessment Passed 🎉</span>
      <h2>Outstanding Performance!</h2>
      <p>Dear <strong>%s</strong>,</p>
      <p>Congratulations! You have successfully passed the timed logic assessment for <strong>%s</strong> (%s).</p>

      <div class="score-banner">
        <div class="score-label">Your Final Assessment Score</div>
        <div class="score-number">%d%%</div>
        <div class="score-subtext">Passing Benchmark: %d%% &bull; Result: PASSED</div>
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Candidate</span>
          <span class="info-value">%s</span>
        </div>
        <div class="info-row">
          <span class="info-label">Program &amp; Track</span>
          <span class="info-value">%s - %s</span>
        </div>
        <div class="info-row">
          <span class="info-label">Next Stage</span>
          <span class="info-value">AI Video Interview Room (Unlocked)</span>
        </div>
      </div>

      <p>Because you met the technical benchmark, the admissions committee has officially unlocked your <strong>AI Technical Video Screening Room</strong>.</p>

      <div class="btn-container">
        <a href="%s" class="btn">Enter AI Video Interview Room</a>
      </div>

      <p style="font-size: 13px; color: #64748b; text-align: center;">You can also inspect your detailed scorecard at: <a href="%s" style="color: #33125d;">%s</a></p>
    `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
			score, passingScore, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
			actionURL, resultURL, resultURL)

		html, _ = renderHTML(subject, frontendURL, supportEmail, body)
		text = fmt.Sprintf("Congratulations %s!\n\nYou passed the %s assessment with a score of %d%% (benchmark: %d%%).\n\nYour AI Technical Video Screening Room is now unlocked:\n%s\n\nView your detailed scorecard:\n%s\n\nFellowHire Admissions Team",
			candidateName, programName, score, passingScore, actionURL, resultURL)
	} else {
		subject = fmt.Sprintf("Assessment Results: %s (%d%%)", programName, score)

		body := fmt.Sprintf(`
      <span class="badge badge-amber">Assessment Completed</span>
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
    <span class="badge badge-purple">AI Video Screening 🎥</span>
    <h2>You're Invited to the AI Video Interview</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>You have qualified for the next stage of the admissions process: the <strong>AI Technical Video Screening</strong> for <strong>%s</strong> (%s).</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Candidate</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Program &amp; Track</span>
        <span class="info-value">%s - %s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Format</span>
        <span class="info-value">5 Video Prompts &bull; AI Evaluated</span>
      </div>
      <div class="info-row">
        <span class="info-label">Prep Countdown</span>
        <span class="info-value">60 Seconds / Prompt</span>
      </div>
      <div class="info-row">
        <span class="info-label">Response Time</span>
        <span class="info-value">90 Seconds / Prompt</span>
      </div>
      <div class="info-row">
        <span class="info-label">Room Access Deadline</span>
        <span class="info-value">%s</span>
      </div>
    </div>

    <div class="guidelines">
      <strong>Important Setup Checklist:</strong>
      <ul>
        <li><strong>Camera &amp; Microphone:</strong> Check your camera and mic in the pre-flight room before entering.</li>
        <li><strong>Quiet Environment:</strong> Find a well-lit, quiet location free from background noise.</li>
        <li><strong>Single-Take Response:</strong> Speak clearly; answers are evaluated by Cloudflare Workers AI with accent-fair rubrics.</li>
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
	text = fmt.Sprintf("Dear %s,\n\nYou are invited to the AI Technical Video Screening for %s (%s).\n\nAccess your personal interview room:\n%s\n\nDeadline: %s\n\nGuidelines:\n- Working camera and mic\n- Quiet room with good lighting\n- 5 conversational prompts with 60s prep and 90s response\n\nGood luck!\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, interviewURL, expiryStr)
	return
}

// 6. Result of AI Interview / Approved for Final Interview Email Template
func buildFinalInterviewInvitationEmail(candidateName, programName, trackName, dashboardURL, notes, frontendURL, supportEmail string) (subject string, html string, text string) {
	subject = fmt.Sprintf("Congratulations! Approved for Final Live Interview - %s", programName)

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
    <span class="badge badge-emerald">Approved for Final Stage 🎉</span>
    <h2>Admissions Committee Approval</h2>
    <p>Dear <strong>%s</strong>,</p>
    <p>We are delighted to inform you that your AI video screening assessment and application for <strong>%s</strong> (%s) have been <strong>officially approved by the Admissions Committee</strong>!</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Candidate</span>
        <span class="info-value">%s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Program &amp; Track</span>
        <span class="info-value">%s - %s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Current Stage</span>
        <span class="info-value" style="color: #047857;">Approved for Final Live Interview</span>
      </div>
    </div>

    %s

    <p>You have advanced to the final stage of the selection process: a live conversation with our engineering leads and fellowship mentors.</p>
    <p>Please log in to your candidate dashboard to review your status and scheduling instructions.</p>

    <div class="btn-container">
      <a href="%s" class="btn">Open Candidate Dashboard</a>
    </div>
  `, template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		template.HTMLEscapeString(candidateName), template.HTMLEscapeString(programName), template.HTMLEscapeString(trackDisplay),
		notesBlock, dashboardURL)

	html, _ = renderHTML(subject, frontendURL, supportEmail, body)
	text = fmt.Sprintf("Congratulations %s!\n\nYour application and AI video screening for %s (%s) have been approved by the Admissions Committee!\n\nYou are invited to the final live interview stage.\n\nOpen your candidate dashboard for details:\n%s\n\nFellowHire Admissions Team",
		candidateName, programName, trackDisplay, dashboardURL)
	return
}
