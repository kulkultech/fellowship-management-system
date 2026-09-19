import ExcelJS from 'exceljs';
import type { Program, ApplicantListItem } from '@/services/types';

export interface ExportCandidatesOptions {
  program?: Program;
  applicants: ApplicantListItem[];
  programName?: string;
  scopeLabel?: string;
}

/**
 * Format stage code into human-friendly label
 */
function formatStageLabel(stage: string): string {
  const stageMap: Record<string, string> = {
    registered: 'Registered',
    test_in_progress: 'Logic Test in Progress',
    test_completed: 'Logic Test Completed',
    test_failed: 'Logic Test Failed',
    ai_interview_invited: 'AI Interview Invited',
    ai_interview_completed: 'AI Interview Completed',
    approved_for_live: 'Approved for Live / Accepted',
    rejected: 'Rejected',
  };
  return stageMap[stage] || stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format seconds into mm:ss or human duration
 */
function formatSeconds(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Clean URL link value
 */
function isValidUrl(val?: string): boolean {
  if (!val) return false;
  try {
    const url = new URL(val);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Exports candidate list with complete application form fields, custom responses,
 * logic test assessment results, and AI interview scorecard results to an Excel (.xlsx) file.
 */
export async function exportCandidatesToExcel({
  program,
  applicants,
  programName,
  scopeLabel = 'All Candidates',
}: ExportCandidatesOptions): Promise<ExcelJS.Workbook> {
  const effectiveProgramName = programName || program?.name || 'Fellowship Program';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FellowHire - Fellowship Management System';
  workbook.lastModifiedBy = 'FellowHire Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ---------------------------------------------------------------------------
  // 1. Discover Custom Application Form Fields
  // ---------------------------------------------------------------------------
  const customFieldMap = new Map<string, string>();
  if (program?.application_form_schema?.custom_fields) {
    for (const f of program.application_form_schema.custom_fields) {
      customFieldMap.set(f.id, f.label || f.id);
    }
  }

  // Also check if any applicant has extra custom responses
  for (const app of applicants) {
    if (app.custom_responses && typeof app.custom_responses === 'object') {
      for (const k of Object.keys(app.custom_responses)) {
        if (!customFieldMap.has(k)) {
          const humanLabel = k
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
          customFieldMap.set(k, humanLabel);
        }
      }
    }
  }

  const customFieldsList = Array.from(customFieldMap.entries()).map(([key, label]) => ({
    key,
    label,
  }));

  // Styles definitions
  const kulkulPurpleFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' }, // #4F46E5
  };

  const kulkulEmeraldFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF059669' }, // #059669
  };

  const zebraRowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' }, // slate-50
  };

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // ---------------------------------------------------------------------------
  // 2. SHEET 1: Candidates Master List
  // ---------------------------------------------------------------------------
  const masterSheet = workbook.addWorksheet('Candidates Master List', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });

  // Title block
  masterSheet.mergeCells('A1:L1');
  const titleCell = masterSheet.getCell('A1');
  titleCell.value = `${effectiveProgramName} — Candidates Master List`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF312E81' } };
  titleCell.alignment = { vertical: 'middle' };
  masterSheet.getRow(1).height = 28;

  masterSheet.mergeCells('A2:L2');
  const subTitleCell = masterSheet.getCell('A2');
  subTitleCell.value = `Exported: ${new Date().toLocaleString()} | Scope: ${scopeLabel} | Total Candidates: ${applicants.length}`;
  subTitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subTitleCell.alignment = { vertical: 'middle' };
  masterSheet.getRow(2).height = 20;

  // Empty row 3
  masterSheet.getRow(3).height = 10;

  // Header Row (Row 4)
  const masterHeaders: string[] = [
    // Personal Info
    'Candidate ID',
    'Full Name',
    'First Name',
    'Last Name',
    'Email Address',
    'Phone / WhatsApp',
    'Date of Birth',
    // Academic & Social Links
    'University / Institution',
    'Major / Study Field',
    'Current Semester',
    'Referral Source',
    'LinkedIn Profile',
    'GitHub Profile',
    'Resume / CV Link',
    // Program Details
    'Program Name',
    'Specialization Track',
    'Current Stage',
    'Applied Date',
    // Dynamic Form Custom Fields
    ...customFieldsList.map((cf) => `Form: ${cf.label}`),
    // Logic Test Assessment
    'Logic Test Status',
    'Logic MCQ Score (%)',
    'Logic Test Result',
    'Logic Time Spent',
    'Logic Test Started At',
    'Logic Test Submitted At',
    // AI Interview Evaluation
    'AI Interview Status',
    'AI Scorecard (0-100)',
    'AI Recommendation',
    'Tech Acumen (1-10)',
    'Communication (1-10)',
    'Problem Solving (1-10)',
    'Key Strengths',
    'Areas for Growth',
    'Executive Summary',
    'AI Interview Completed At',
    'AI Recording Link',
  ];

  const masterHeaderRow = masterSheet.addRow(masterHeaders);
  masterHeaderRow.height = 28;
  masterHeaderRow.eachCell((cell) => {
    cell.fill = kulkulPurpleFill;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });

  // Populate Master Data Rows
  applicants.forEach((app, idx) => {
    const rowValues: any[] = [];

    // Personal Info
    rowValues.push(app.id);
    rowValues.push(app.full_name || [app.first_name, app.last_name].filter(Boolean).join(' ') || 'Unnamed Candidate');
    rowValues.push(app.first_name || '-');
    rowValues.push(app.last_name || '-');
    rowValues.push(app.email || '-');
    rowValues.push(app.phone || '-');
    rowValues.push(app.date_of_birth || '-');

    // Academic & Social
    rowValues.push(app.university || '-');
    rowValues.push(app.major || '-');
    rowValues.push(app.semester || '-');
    rowValues.push(app.referral_source || '-');
    rowValues.push(app.linkedin_url || '-');
    rowValues.push(app.github_url || '-');
    rowValues.push(app.resume_url || '-');

    // Program Details
    rowValues.push(effectiveProgramName);
    rowValues.push(app.track_name || 'General / No Track');
    rowValues.push(formatStageLabel(app.current_stage));
    rowValues.push(app.created_at || '-');

    // Dynamic Form Custom Fields
    for (const cf of customFieldsList) {
      const respVal = app.custom_responses?.[cf.key];
      if (respVal === undefined || respVal === null || respVal === '') {
        rowValues.push('-');
      } else if (Array.isArray(respVal)) {
        rowValues.push(respVal.join(', '));
      } else if (typeof respVal === 'object') {
        rowValues.push(JSON.stringify(respVal));
      } else if (typeof respVal === 'boolean') {
        rowValues.push(respVal ? 'Yes' : 'No');
      } else {
        rowValues.push(String(respVal));
      }
    }

    // Logic Test Assessment
    const testStatus = app.mcq_status || (app.mcq_score !== undefined ? 'Completed' : 'Not Started');
    rowValues.push(testStatus);
    rowValues.push(app.mcq_score !== undefined ? app.mcq_score : '-');
    rowValues.push(
      app.mcq_passed !== undefined
        ? app.mcq_passed
          ? 'Passed'
          : 'Failed'
        : app.mcq_score !== undefined
          ? 'Completed'
          : '-'
    );
    rowValues.push(formatSeconds(app.time_spent_seconds));
    rowValues.push(app.mcq_started_at || '-');
    rowValues.push(app.mcq_submitted_at || '-');

    // AI Interview Evaluation
    const aiStatus = app.ai_status || (app.ai_score !== undefined ? 'Completed' : 'Not Started');
    rowValues.push(aiStatus);
    rowValues.push(app.ai_score !== undefined ? app.ai_score : '-');
    rowValues.push(app.ai_recommendation || '-');
    rowValues.push(app.ai_technical_acumen !== undefined ? app.ai_technical_acumen : '-');
    rowValues.push(app.ai_communication !== undefined ? app.ai_communication : '-');
    rowValues.push(app.ai_problem_solving !== undefined ? app.ai_problem_solving : '-');
    rowValues.push(app.ai_key_strengths && app.ai_key_strengths.length > 0 ? app.ai_key_strengths.join('; ') : '-');
    rowValues.push(app.ai_areas_for_growth && app.ai_areas_for_growth.length > 0 ? app.ai_areas_for_growth.join('; ') : '-');
    rowValues.push(app.ai_executive_summary || '-');
    rowValues.push(app.ai_completed_at || '-');
    rowValues.push(app.ai_recording_url || '-');

    const row = masterSheet.addRow(rowValues);
    row.height = 22;

    const isEven = idx % 2 === 1;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 9.5 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      if (isEven) {
        cell.fill = zebraRowFill;
      }

      // Convert URLs to active clickable hyperlinks
      const textVal = String(cell.value || '');
      if (isValidUrl(textVal)) {
        cell.value = {
          text: textVal,
          hyperlink: textVal,
        };
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF2563EB' }, underline: true };
      }
    });
  });

  // Auto-fit column widths
  masterSheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber <= 3) return; // Skip title block
      const val = cell.value;
      let len = 0;
      if (typeof val === 'string') {
        len = val.length;
      } else if (typeof val === 'object' && val && 'text' in val) {
        len = String(val.text).length;
      } else if (val !== null && val !== undefined) {
        len = String(val).length;
      }
      if (len > maxLength) {
        maxLength = len;
      }
    });
    // Cap max width to 45 so multiline text doesn't blow up the spreadsheet
    column.width = Math.min(Math.max(maxLength + 3, 12), 45);
  });

  // Enable Excel AutoFilter across all candidate columns
  masterSheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: masterHeaders.length },
  };

  // ---------------------------------------------------------------------------
  // 3. SHEET 2: Assessment & Interview Summary
  // ---------------------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Assessment Summary', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });

  summarySheet.mergeCells('A1:I1');
  const summaryTitleCell = summarySheet.getCell('A1');
  summaryTitleCell.value = `${effectiveProgramName} — Screening Assessment & AI Interview Scorecards`;
  summaryTitleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF065F46' } };
  summaryTitleCell.alignment = { vertical: 'middle' };
  summarySheet.getRow(1).height = 28;

  summarySheet.mergeCells('A2:I2');
  const summarySubCell = summarySheet.getCell('A2');
  summarySubCell.value = `Quick comparative scorecard for evaluation and admissions committee`;
  summarySubCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  summarySubCell.alignment = { vertical: 'middle' };
  summarySheet.getRow(2).height = 20;

  summarySheet.getRow(3).height = 10;

  const summaryHeaders = [
    'Candidate Name',
    'Email',
    'Track',
    'Current Stage',
    'Logic Score (%)',
    'Logic Status',
    'Time Spent',
    'AI Score (0-100)',
    'AI Recommendation',
    'Tech Acumen',
    'Communication',
    'Problem Solving',
    'Key Strengths',
    'Areas for Growth',
    'Executive Summary',
    'Interview Recording',
  ];

  const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
  summaryHeaderRow.height = 28;
  summaryHeaderRow.eachCell((cell) => {
    cell.fill = kulkulEmeraldFill;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });

  applicants.forEach((app, idx) => {
    const sRowValues = [
      app.full_name || [app.first_name, app.last_name].filter(Boolean).join(' ') || 'Unnamed Candidate',
      app.email || '-',
      app.track_name || 'General',
      formatStageLabel(app.current_stage),
      app.mcq_score !== undefined ? `${app.mcq_score}%` : '-',
      app.mcq_passed !== undefined ? (app.mcq_passed ? 'Passed' : 'Failed') : app.mcq_status || '-',
      formatSeconds(app.time_spent_seconds),
      app.ai_score !== undefined ? `${app.ai_score} / 100` : '-',
      app.ai_recommendation || '-',
      app.ai_technical_acumen !== undefined ? `${app.ai_technical_acumen} / 10` : '-',
      app.ai_communication !== undefined ? `${app.ai_communication} / 10` : '-',
      app.ai_problem_solving !== undefined ? `${app.ai_problem_solving} / 10` : '-',
      app.ai_key_strengths && app.ai_key_strengths.length > 0 ? app.ai_key_strengths.join('; ') : '-',
      app.ai_areas_for_growth && app.ai_areas_for_growth.length > 0 ? app.ai_areas_for_growth.join('; ') : '-',
      app.ai_executive_summary || '-',
      app.ai_recording_url || '-',
    ];

    const sRow = summarySheet.addRow(sRowValues);
    sRow.height = 22;

    const isEven = idx % 2 === 1;
    sRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 9.5 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      if (isEven) {
        cell.fill = zebraRowFill;
      }

      const textVal = String(cell.value || '');
      if (isValidUrl(textVal)) {
        cell.value = {
          text: textVal,
          hyperlink: textVal,
        };
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF2563EB' }, underline: true };
      }
    });
  });

  summarySheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber <= 3) return;
      const val = cell.value;
      let len = 0;
      if (typeof val === 'string') {
        len = val.length;
      } else if (typeof val === 'object' && val && 'text' in val) {
        len = String(val.text).length;
      } else if (val !== null && val !== undefined) {
        len = String(val).length;
      }
      if (len > maxLength) {
        maxLength = len;
      }
    });
    column.width = Math.min(Math.max(maxLength + 3, 12), 45);
  });

  summarySheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: summaryHeaders.length },
  };

  // ---------------------------------------------------------------------------
  // 4. Generate Workbook Buffer & Trigger Browser Download (if in browser)
  // ---------------------------------------------------------------------------
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof window.URL?.createObjectURL === 'function'
  ) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const sanitizedProg = effectiveProgramName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${sanitizedProg || 'candidates'}_candidates_${dateStr}.xlsx`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return workbook;
}
