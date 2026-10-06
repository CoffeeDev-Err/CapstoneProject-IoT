import { resolveMediaUrl } from './mediaUrls'
import pnpLogo from '../assets/pnp-logo.png'

export const exportDateTime = (value) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))
  : 'Not recorded'
const text = (value) => String(value ?? '').trim() || 'Not recorded'
export const fitImage = (width, height, maxWidth, maxHeight) => {
  const scale = Math.min(maxWidth / width, maxHeight / height)
  return { width: width * scale, height: height * scale }
}
export const currentEvidence = (report) => {
  const corrections = report.evidence_corrections || []
  return corrections.length
    ? { ...corrections.at(-1), label: `Current evidence - corrected photo ${corrections.length}` }
    : report.evidence_photo?.url ? { ...report.evidence_photo, label: 'Current evidence - original photo' } : null
}
export const reportExportRows = (report) => [
  ['Report ID', report.id], ['Report type', report.report_type], ['Title', report.title],
  ['Severity', `${report.severity || 1}/5`], ['Validation status', report.validation_status],
  ['Case status', report.case_status || (report.is_incident ? 'open' : 'Not applicable')],
  ['Officer', report.officer], ['Rank', report.officer_rank], ['Badge number', report.badge_number],
  ['Incident / activity date', exportDateTime(report.occurred_at)], ['Submitted', exportDateTime(report.date_time)],
  ['Duty patrol area', report.assigned_area],
  ['Deployment style', report.assigned_area === 'No deployment recorded' ? 'No deployment recorded'
    : report.assigned_area_type === 'point' ? 'Fixed post'
      : report.assigned_area_type === 'route' ? 'Route patrol' : 'Area patrol'],
  ['Duty coverage barangay', report.assigned_barangays?.join(', ') || 'No deployment coverage recorded'],
  ['Deployment point', report.assigned_location_label || 'Not applicable'],
  ['Incident barangay', report.barangay], ['Exact incident place', report.location],
  ['Location source', ({ gps: 'Officer current GPS', backup_request: 'GPS recorded with backup request', manual: 'Manually entered / map pin' })[report.location_source] || report.location_source],
  ['GPS coordinates', report.latitude != null && report.longitude != null
    && report.latitude !== '' && report.longitude !== '' && Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
    ? `${Number(report.latitude).toFixed(6)}, ${Number(report.longitude).toFixed(6)}` : 'Unavailable'],
].map(([label, value]) => [label, text(value)])

const loadImage = async (url, transparent = false) => {
  // Signed media endpoints stream export bytes without redirecting fetch to S3.
  const imageUrl = new URL(url, window.location.href)
  if (imageUrl.pathname.startsWith('/api/media/')) imageUrl.searchParams.set('export', '1')
  let response
  try {
    response = await fetch(imageUrl.href, { credentials: 'include', signal: AbortSignal.timeout(20000) })
  } catch {
    throw new Error('The report photo could not be loaded for the PDF. Please retry the download.')
  }
  if (!response.ok) throw new Error('The photo could not be loaded. Retry the PDF download.')
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const size = fitImage(bitmap.width, bitmap.height, 1600, 1600)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(size.width)); canvas.height = Math.max(1, Math.round(size.height))
  const context = canvas.getContext('2d')
  if (!transparent) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height) }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { data: canvas.toDataURL(transparent ? 'image/png' : 'image/jpeg', 0.88), width: canvas.width, height: canvas.height }
}
const pdfWriter = async (title, generatedAt) => {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), loadImage(pnpLogo, true),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title, author: 'Philippine National Police - Cabagan Municipal Police Station', subject: title })
  let y = 49
  const section = (heading, head, body, options = {}) => {
    if (y > 240) { doc.addPage(); y = 49 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(22, 48, 84)
    doc.text(heading, 16, y); y += 5
    autoTable(doc, { startY: y, head: head ? [head] : undefined, body,
      margin: { top: 49, bottom: 23, left: 16, right: 16 },
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: [24, 64, 120], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 248, 252] },
      ...options })
    y = doc.lastAutoTable.finalY + 10
  }
  const image = (heading, source) => {
    if (272 - y - 16 < 65) { doc.addPage(); y = 49 }
    const size = fitImage(source.width, source.height, 178, Math.min(112, 272 - y - 16))
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(heading, 16, y)
    doc.addImage(source.data, 'JPEG', 16 + (178 - size.width) / 2, y + 5, size.width, size.height)
    y += size.height + 16
  }
  const chart = (heading, rows, key) => {
    if (y + 22 + Math.min(rows.length, 8) * 10 > 265) { doc.addPage(); y = 49 }
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(heading, 16, y); y += 12
    const maximum = Math.max(1, ...rows.map((row) => row[key]))
    if (!rows.length) { doc.setFontSize(10); doc.text('No data for the selected period.', 16, y); y += 12 }
    for (const row of rows) {
      if (y > 252) { doc.addPage(); y = 49; doc.text(`${heading} (continued)`, 16, y); y += 12 }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59)
      const label = doc.splitTextToSize(row.barangay, 58)
      doc.text(label, 16, y)
      doc.setFillColor(36, 107, 253); doc.rect(80, y - 4, 96 * row[key] / maximum, 5, 'F')
      doc.text(String(row[key]), 190, y, { align: 'right' }); y += Math.max(10, label.length * 4 + 4)
    }
    y += 6
  }
  const finish = () => {
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page)
      const logoSize = fitImage(logo.width, logo.height, 23, 28)
      doc.addImage(logo.data, 'PNG', 16 + (23 - logoSize.width) / 2, 7, logoSize.width, logoSize.height)
      doc.setTextColor(22, 48, 84); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text('Republic of the Philippines', 116, 10, { align: 'center' })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
      doc.text('PHILIPPINE NATIONAL POLICE', 116, 17, { align: 'center' })
      doc.setFontSize(10); doc.text('CABAGAN MUNICIPAL POLICE STATION', 116, 23, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text('Cabagan, Isabela', 116, 29, { align: 'center' })
      doc.setDrawColor(24, 64, 120); doc.setLineWidth(0.5); doc.line(16, 35, 194, 35)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text(title.toUpperCase(), 105, 42, { align: 'center' })
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(16, 279, 194, 279)
      doc.setTextColor(80); doc.setFontSize(8)
      doc.text(`Generated ${exportDateTime(generatedAt)} (Philippine time)`, 16, 285)
      doc.text(`Page ${page} of ${pages}`, 194, 285, { align: 'right' })
      doc.setFontSize(7); doc.text('GeoSentri system-generated record | All dates and times: Asia/Manila', 16, 290)
    }
    return doc
  }
  return { section, image, chart, finish }
}

export const buildIndividualReportPdf = async (report, generatedAt = new Date().toISOString()) => {
  const evidence = currentEvidence(report)
  // Fail clearly instead of silently downloading a PDF with missing evidence.
  const photo = evidence?.url ? await loadImage(resolveMediaUrl(evidence.url)) : null
  const writer = await pdfWriter('Individual report', generatedAt)
  writer.section('Report information', null, reportExportRows(report), { columnStyles: { 0: { cellWidth: 49, fontStyle: 'bold' } } })
  writer.section('Description', null, [[text(report.description)]])
  if (report.backup_response) {
    const backup = report.backup_response
    writer.section('Linked backup operation', null, [
      ['Request reference', text(backup.task_id)], ['Request location', text(backup.request_location)],
      ['Requested', exportDateTime(backup.requested_at)], ['Completed', exportDateTime(backup.completed_at)],
    ], { columnStyles: { 0: { cellWidth: 49, fontStyle: 'bold' } } })
    writer.section('Response team', ['Personnel / badge', 'Accepted', 'Arrival'],
      backup.responders?.length ? backup.responders.map((responder) => [
        text([responder.rank, responder.name, responder.badge_number ? `Badge ${responder.badge_number}` : ''].filter(Boolean).join(' / ')),
        exportDateTime(responder.accepted_at), responder.arrived_at ? exportDateTime(responder.arrived_at) : 'Arrival not recorded',
      ]) : [['No accepted responders recorded', '', '']])
  }
  if (report.case_status === 'resolved') writer.section('Resolution', null, [
    ['Resolved', exportDateTime(report.resolved_at)], ['Resolver', text(report.resolved_by_name || report.resolved_by)],
    ['Resolution notes', text(report.resolution_notes)],
  ], { columnStyles: { 0: { cellWidth: 49, fontStyle: 'bold' } } })
  if (photo) {
    writer.image(evidence.label, photo)
    if (evidence.reason) writer.section('Evidence correction note', null, [[evidence.reason]])
  } else writer.section('Evidence', null, [['No evidence photo attached.']])
  return writer.finish()
}
export const downloadIndividualReport = async (report) => {
  const pdf = await buildIndividualReportPdf(report)
  pdf.save(`${String(report.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`)
}

export const analyticsMetrics = (analytics) => [
  ['Submitted Reports', analytics.totalReports], ['Validated Incidents', analytics.totalValidatedIncidents],
  ['Resolved Cases', analytics.totalResolvedCases], ['High-Priority Barangays', analytics.highPriorityBarangays],
]
export const analyticsDefinitions = [
  ['Submitted Reports', 'All submitted report types within the selected submission-date period and Cabagan coverage.'],
  ['Validated Incidents', 'Incident reports with a validated review status. Routine reports and pending/rejected incidents are not counted.'],
  ['Resolved Cases', 'Incident reports marked resolved, independently of review status. This is not a count of resolutions occurring within the period.'],
  ['High-Priority Barangays', 'Barangays classified as High or Critical by the current advisory scoring model.'],
  ['Personnel coverage', 'Current deployment availability at generation time; not historical coverage for the selected period.'],
]
const ranked = (analytics, key) => [...analytics.barangays].sort((a, b) => b[key] - a[key] || a.barangay.localeCompare(b.barangay))
export const analyticsSheets = (analytics, reports, generatedAt) => [
  { name: 'Summary', rows: [['Metric', 'Value'], ['Selected period', analytics.periodLabel],
    ['From (Philippine time)', exportDateTime(analytics.start.toISOString())], ['To (Philippine time)', exportDateTime(analytics.end.toISOString())],
    ['Date basis', 'Report submission time'], ['Generated (Philippine time)', exportDateTime(generatedAt)],
    ...analyticsMetrics(analytics), ['Excluded outside Cabagan', analytics.excludedOutsideCabaganReports],
    ['Workbook guide', 'Use the Report rankings, Incident rankings, Priority and coverage, and Reports sheets for supporting detail.'],
    ...analyticsDefinitions.map(([metric, definition]) => [`Definition: ${metric}`, definition])] },
  { name: 'Report rankings', rows: [['Rank', 'Barangay', 'Submitted reports'], ...ranked(analytics, 'reportCount').map((b, i) => [i + 1, b.barangay, b.reportCount])] },
  { name: 'Incident rankings', rows: [['Rank', 'Barangay', 'Validated incidents'], ...ranked(analytics, 'validatedIncidentCount').map((b, i) => [i + 1, b.barangay, b.validatedIncidentCount])] },
  { name: 'Priority and coverage', rows: [['Barangay', 'Priority score', 'Level', 'Average severity', 'Assigned', 'Available', 'Required', 'Recommended action'],
    ...analytics.barangays.map((b) => [b.barangay, b.priorityScore, b.priorityLevel, b.averageSeverity, b.assignedPersonnel, b.availablePersonnel, b.requiredPersonnel, b.recommendation])] },
  { name: 'Reports', rows: [['Report ID', 'Officer', 'Type', 'Title', 'Severity', 'Validation', 'Case status', 'Barangay', 'Submitted (Philippine time)', 'Incident (Philippine time)'],
    ...reports.map((r) => [r.id, r.officer, r.report_type, r.title, r.severity, r.validation_status, r.case_status, r.barangay, exportDateTime(r.date_time), exportDateTime(r.occurred_at)])] },
]
export const buildAnalyticsPdf = async (analytics, generatedAt = new Date().toISOString(), reports = []) => {
  const writer = await pdfWriter('Operational analytics', generatedAt)
  writer.section('Selected period', null, [[analytics.periodLabel],
    [`${exportDateTime(analytics.start.toISOString())} to ${exportDateTime(analytics.end.toISOString())} (Philippine time)`],
    ['Based on submission date. Coverage reflects currently available personnel.']])
  writer.section('Summary metrics', ['Metric', 'Value'], analyticsMetrics(analytics))
  writer.section('Basis and definitions', ['Measure', 'Definition'], analyticsDefinitions)
  writer.section('Barangay report ranking', ['Rank', 'Barangay', 'Reports'], ranked(analytics, 'reportCount').map((b, i) => [i + 1, b.barangay, b.reportCount]))
  writer.section('Validated incident ranking', ['Rank', 'Barangay', 'Validated incidents'], ranked(analytics, 'validatedIncidentCount').map((b, i) => [i + 1, b.barangay, b.validatedIncidentCount]))
  writer.section('Priority and personnel coverage', ['Barangay', 'Score', 'Level', 'Assigned', 'Available', 'Required'],
    analytics.barangays.map((b) => [b.barangay, b.priorityScore, b.priorityLevel, b.assignedPersonnel, b.availablePersonnel, b.requiredPersonnel]))
  writer.chart('Submitted reports by barangay', ranked(analytics, 'reportCount'), 'reportCount')
  writer.chart('Validated incidents by barangay', ranked(analytics, 'validatedIncidentCount'), 'validatedIncidentCount')
  writer.section('Recommended actions', ['Barangay', 'Recommended action'], analytics.barangays.map((b) => [b.barangay, b.recommendation]))
  if (reports.length) writer.section('Supporting report register', ['Reference / title', 'Officer / barangay', 'Type / review / case', 'Submitted'],
    reports.map((report) => [
      `${text(report.id)}\n${text(report.title)}`, `${text(report.officer)}\n${text(report.barangay)}`,
      [report.report_type, report.validation_status, report.case_status].filter(Boolean).join(' / '), exportDateTime(report.date_time),
    ]), { styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' } })
  writer.section('Interpretation', null, [['Priority scores are advisory. Final deployment decisions remain with the supervisor.'],
    [`${analytics.excludedOutsideCabaganReports} reports outside Cabagan excluded from these metrics.`]])
  return writer.finish()
}
export const buildAnalyticsWorkbook = async (analytics, reports, generatedAt = new Date().toISOString()) => {
  const { default: ExcelJS } = await import('exceljs')
  const book = new ExcelJS.Workbook()
  book.creator = 'GeoSentri / Cabagan Municipal Police Station'; book.created = new Date(generatedAt)
  book.title = 'Cabagan Operational Analytics'; book.subject = analytics.periodLabel
  const logoResponse = await fetch(new URL(pnpLogo, window.location.href).href)
  if (!logoResponse.ok) throw new Error('The station logo could not be loaded. Retry the Excel download.')
  const logoBytes = new Uint8Array(await logoResponse.arrayBuffer())
  const logoId = book.addImage({ base64: `data:image/png;base64,${btoa(Array.from(logoBytes, (byte) => String.fromCharCode(byte)).join(''))}`, extension: 'png' })
  const headerRow = 8
  for (const { name, rows } of analyticsSheets(analytics, reports, generatedAt)) {
    const count = Math.max(4, rows[0].length)
    const sheet = book.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: headerRow, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: count > 4 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        printTitlesRow: `1:${headerRow}`, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: 'GeoSentri | Philippine time (Asia/Manila)&RPage &P of &N' },
    })
    sheet.columns = Array.from({ length: count }, (_, index) => ({ width: name === 'Summary' ? [34, 58, 12, 12][index] : [18, 28, 23, 35, 14, 18, 18, 42, 26, 26][index] || 24 }))
    for (const [row, label] of [[1, 'REPUBLIC OF THE PHILIPPINES'], [2, 'PHILIPPINE NATIONAL POLICE'], [3, 'CABAGAN MUNICIPAL POLICE STATION'], [4, 'Cabagan, Isabela']]) {
      sheet.mergeCells(row, 2, row, count)
      const cell = sheet.getCell(row, 2); cell.value = label
      cell.font = { name: 'Calibri', size: row === 2 ? 14 : 10, bold: row === 2 || row === 3, color: { argb: 'FF163054' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }; sheet.getRow(row).height = 22
    }
    sheet.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 57, height: 80 } })
    sheet.mergeCells(5, 1, 5, count); sheet.getCell('A5').value = `OPERATIONAL ANALYTICS | ${name.toUpperCase()}`
    sheet.getRow(5).height = 28; sheet.getCell('A5').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF163054' } }
    sheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' }
    for (const [row, label] of [[6, `Period: ${analytics.periodLabel} | Submission-date basis`], [7, `Generated: ${exportDateTime(generatedAt)} (Philippine time) | Current personnel coverage`]]) {
      sheet.mergeCells(row, 1, row, count); sheet.getCell(row, 1).value = label
      sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } }
      sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' }; sheet.getRow(row).height = 30
    }
    // Values are assigned as string/number cells, never formula objects.
    sheet.addRows(rows.map((row) => row.map((value) => value ?? '')))
    sheet.eachRow((row, index) => {
      if (index < headerRow) return
      row.alignment = { vertical: 'middle', wrapText: true }; row.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } }
      let lines = 1
      row.eachCell((cell, column) => {
        lines = Math.max(lines, ...String(cell.value ?? '').split('\n').map((line) => Math.ceil(line.length / Math.max(8, sheet.getColumn(column).width - 3))))
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE3EC' } } }
        if (index > headerRow && index % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FA' } }
        if (typeof cell.value === 'number') { cell.numFmt = Number.isInteger(cell.value) ? '0' : '0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' } }
      })
      row.height = Math.max(28, lines * 16 + 12)
    })
    sheet.getRow(headerRow).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(headerRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF184078' } }
    if (name === 'Summary') {
      for (let row = headerRow; row <= sheet.rowCount; row += 1) sheet.mergeCells(row, 2, row, count)
    }
    if (name !== 'Summary') sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length - 1, column: rows[0].length } }
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(rows[0].length).letter}${sheet.rowCount}`
    if (name === 'Summary') sheet.pageSetup.printArea = `A1:D${sheet.rowCount}`
  }
  return book
}
export const downloadAnalytics = async (kind, analytics, reports) => {
  const generatedAt = new Date().toISOString()
  const name = `geosentri-analytics-${analytics.period}-${generatedAt.slice(0, 10)}`
  if (kind === 'pdf') { (await buildAnalyticsPdf(analytics, generatedAt, reports)).save(`${name}.pdf`); return }
  const book = await buildAnalyticsWorkbook(analytics, reports, generatedAt)
  const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name}.xlsx`
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
