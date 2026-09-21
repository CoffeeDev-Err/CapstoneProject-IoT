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
  ['Assigned area', report.assigned_area], ['Barangay', report.barangay], ['Exact place', report.location],
  ['Location source', ({ gps: 'Officer current GPS', backup_request: 'GPS recorded with backup request', manual: 'Manually entered / map pin' })[report.location_source] || report.location_source],
  ['GPS coordinates', report.latitude != null && report.longitude != null
    && report.latitude !== '' && report.longitude !== '' && Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
    ? `${Number(report.latitude).toFixed(6)}, ${Number(report.longitude).toFixed(6)}` : 'Unavailable'],
].map(([label, value]) => [label, text(value)])

const loadImage = async (url) => {
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
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { data: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height }
}
const pdfWriter = async (title, generatedAt) => {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), loadImage(pnpLogo),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title, author: 'Philippine National Police - Cabagan Municipal Police Station', subject: title })
  let y = 42
  const section = (heading, head, body, options = {}) => {
    if (y > 240) { doc.addPage(); y = 42 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(22, 48, 84)
    doc.text(heading, 16, y); y += 5
    autoTable(doc, { startY: y, head: head ? [head] : undefined, body,
      margin: { top: 42, bottom: 23, left: 16, right: 16 },
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: [24, 64, 120], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 248, 252] },
      ...options })
    y = doc.lastAutoTable.finalY + 10
  }
  const image = (heading, source) => {
    const size = fitImage(source.width, source.height, 178, 112)
    if (y + size.height + 15 > 272) { doc.addPage(); y = 42 }
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(heading, 16, y)
    doc.addImage(source.data, 'JPEG', 16 + (178 - size.width) / 2, y + 5, size.width, size.height)
    y += size.height + 16
  }
  const chart = (heading, rows, key) => {
    doc.addPage(); y = 42
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(heading, 16, y); y += 12
    const maximum = Math.max(1, ...rows.map((row) => row[key]))
    if (!rows.length) { doc.setFontSize(10); doc.text('No data for the selected period.', 16, y); y += 12 }
    for (const row of rows) {
      if (y > 252) { doc.addPage(); y = 42; doc.text(`${heading} (continued)`, 16, y); y += 12 }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59)
      doc.text(row.barangay, 16, y)
      doc.setFillColor(36, 107, 253); doc.rect(63, y - 4, 110 * row[key] / maximum, 5, 'F')
      doc.text(String(row[key]), 185, y, { align: 'right' }); y += 10
    }
    y += 6
  }
  const finish = () => {
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page)
      doc.setFillColor(15, 37, 69); doc.rect(0, 0, 210, 32, 'F')
      const logoSize = fitImage(logo.width, logo.height, 22, 22)
      doc.addImage(logo.data, 'JPEG', 16, 5, logoSize.width, logoSize.height)
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
      doc.text('Philippine National Police', 105, 12, { align: 'center' })
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.text('Cabagan Municipal Police Station', 105, 19, { align: 'center' })
      doc.text(title, 105, 26, { align: 'center' })
      doc.setTextColor(80); doc.setFontSize(8)
      doc.text(`Generated ${exportDateTime(generatedAt)} (Philippine time)`, 16, 285)
      doc.text(`Page ${page} of ${pages}`, 194, 285, { align: 'right' })
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
  if (photo) {
    writer.image(evidence.label, photo)
    if (evidence.reason) writer.section('Evidence correction note', null, [[evidence.reason]])
  } else writer.section('Evidence', null, [['No evidence photo attached.']])
  if (report.case_status === 'resolved') writer.section('Resolution', null, [
    ['Resolved', exportDateTime(report.resolved_at)], ['Resolver', text(report.resolved_by_name || report.resolved_by)],
    ['Resolution notes', text(report.resolution_notes)],
  ])
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
const ranked = (analytics, key) => [...analytics.barangays].sort((a, b) => b[key] - a[key] || a.barangay.localeCompare(b.barangay))
export const analyticsSheets = (analytics, reports, generatedAt) => [
  { name: 'Summary', rows: [['Metric', 'Value'], ['Selected period', analytics.periodLabel],
    ['From (Philippine time)', exportDateTime(analytics.start.toISOString())], ['To (Philippine time)', exportDateTime(analytics.end.toISOString())],
    ['Date basis', 'Report submission time'], ['Generated (Philippine time)', exportDateTime(generatedAt)],
    ...analyticsMetrics(analytics), ['Excluded outside Cabagan', analytics.excludedOutsideCabaganReports]] },
  { name: 'Report rankings', rows: [['Rank', 'Barangay', 'Submitted reports'], ...ranked(analytics, 'reportCount').map((b, i) => [i + 1, b.barangay, b.reportCount])] },
  { name: 'Incident rankings', rows: [['Rank', 'Barangay', 'Validated incidents'], ...ranked(analytics, 'validatedIncidentCount').map((b, i) => [i + 1, b.barangay, b.validatedIncidentCount])] },
  { name: 'Priority and coverage', rows: [['Barangay', 'Priority score', 'Level', 'Average severity', 'Assigned', 'Available', 'Required', 'Recommended action'],
    ...analytics.barangays.map((b) => [b.barangay, b.priorityScore, b.priorityLevel, b.averageSeverity, b.assignedPersonnel, b.availablePersonnel, b.requiredPersonnel, b.recommendation])] },
  { name: 'Reports', rows: [['Report ID', 'Officer', 'Type', 'Title', 'Severity', 'Validation', 'Case status', 'Barangay', 'Submitted (Philippine time)', 'Incident (Philippine time)'],
    ...reports.map((r) => [r.id, r.officer, r.report_type, r.title, r.severity, r.validation_status, r.case_status, r.barangay, exportDateTime(r.date_time), exportDateTime(r.occurred_at)])] },
]
export const buildAnalyticsPdf = async (analytics, generatedAt = new Date().toISOString()) => {
  const writer = await pdfWriter('Operational analytics', generatedAt)
  writer.section('Selected period', null, [[analytics.periodLabel],
    [`${exportDateTime(analytics.start.toISOString())} to ${exportDateTime(analytics.end.toISOString())} (Philippine time)`],
    ['Based on submission date. Coverage reflects currently available personnel.']])
  writer.section('Summary metrics', ['Metric', 'Value'], analyticsMetrics(analytics))
  writer.section('Barangay report ranking', ['Rank', 'Barangay', 'Reports'], ranked(analytics, 'reportCount').map((b, i) => [i + 1, b.barangay, b.reportCount]))
  writer.section('Validated incident ranking', ['Rank', 'Barangay', 'Validated incidents'], ranked(analytics, 'validatedIncidentCount').map((b, i) => [i + 1, b.barangay, b.validatedIncidentCount]))
  writer.section('Priority and personnel coverage', ['Barangay', 'Score', 'Level', 'Assigned', 'Available', 'Required'],
    analytics.barangays.map((b) => [b.barangay, b.priorityScore, b.priorityLevel, b.assignedPersonnel, b.availablePersonnel, b.requiredPersonnel]))
  writer.chart('Submitted reports by barangay', ranked(analytics, 'reportCount'), 'reportCount')
  writer.chart('Validated incidents by barangay', ranked(analytics, 'validatedIncidentCount'), 'validatedIncidentCount')
  writer.section('Recommended actions', ['Barangay', 'Recommended action'], analytics.barangays.map((b) => [b.barangay, b.recommendation]))
  writer.section('Interpretation', null, [['Priority scores are advisory. Final deployment decisions remain with the supervisor.'],
    [`${analytics.excludedOutsideCabaganReports} reports outside Cabagan excluded from these metrics.`]])
  return writer.finish()
}
export const buildAnalyticsWorkbook = async (analytics, reports, generatedAt = new Date().toISOString()) => {
  const { default: ExcelJS } = await import('exceljs')
  const book = new ExcelJS.Workbook()
  book.creator = 'GeoSentri / PNP'; book.created = new Date(generatedAt)
  for (const { name, rows } of analyticsSheets(analytics, reports, generatedAt)) {
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    // Values are assigned as string/number cells, never formula objects.
    sheet.addRows(rows.map((row) => row.map((value) => value ?? '')))
    sheet.columns.forEach((column, index) => { column.width = Math.min(65, Math.max(18, String(rows[0][index] || '').length + 4)) })
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF184078' } }
    sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true } })
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: rows[0].length } }
  }
  return book
}
export const downloadAnalytics = async (kind, analytics, reports) => {
  const generatedAt = new Date().toISOString()
  const name = `geosentri-analytics-${analytics.period}-${generatedAt.slice(0, 10)}`
  if (kind === 'pdf') { (await buildAnalyticsPdf(analytics, generatedAt)).save(`${name}.pdf`); return }
  const book = await buildAnalyticsWorkbook(analytics, reports, generatedAt)
  const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name}.xlsx`
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
