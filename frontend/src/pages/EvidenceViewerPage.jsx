import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Download, ImageOff, Moon, RefreshCw, ShieldCheck, Sun } from 'lucide-react'
import { EvidenceLoadingSkeleton, SkeletonBlock } from '../components/LoadingSkeleton'
import { useNavigate, useParams } from 'react-router-dom'
import geosentriIcon from '../assets/geosentri-icon.png'
import { getReport } from '../services/operations'
import { getMediaDownloadUrl, resolveMediaUrl } from '../utils/mediaUrls'

const formatDateTime = (value) => {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function EvidenceViewerPage() {
  const { reportId = '' } = useParams()
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [loadVersion, setLoadVersion] = useState(0)
  const [state, setState] = useState({ reportId: '', status: 'loading', report: null, error: '' })
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const [loadedImageUrl, setLoadedImageUrl] = useState('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    let active = true

    getReport(reportId)
      .then((report) => {
        if (active) setState({ reportId, status: 'loaded', report, error: '' })
      })
      .catch((error) => {
        if (active) {
          setState({
            reportId,
            status: 'error',
            report: null,
            error: error.message || 'Unable to load the report evidence.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [loadVersion, reportId])

  useEffect(() => {
    const previousTitle = document.title
    document.title = state.reportId === reportId && state.report?.id
      ? `Evidence ${state.report.id} | GeoSentri`
      : 'Evidence Viewer | GeoSentri'
    return () => {
      document.title = previousTitle
    }
  }, [reportId, state.report?.id, state.reportId])

  const closeViewer = useCallback(() => {
    window.close()
    window.setTimeout(() => {
      if (!window.closed) navigate('/reports')
    }, 100)
  }, [navigate])

  const activeState = state.reportId === reportId
    ? state
    : { reportId, status: 'loading', report: null, error: '' }
  const report = activeState.report
  const evidence = report?.evidence_photo
  const evidenceUrl = resolveMediaUrl(evidence?.url)
  const downloadUrl = getMediaDownloadUrl(evidence?.url)
  const imageFailed = Boolean(evidenceUrl && failedImageUrl === evidenceUrl)
  const imageLoaded = Boolean(evidenceUrl && loadedImageUrl === evidenceUrl)

  const retryLoad = () => {
    setState({ reportId, status: 'loading', report: null, error: '' })
    setFailedImageUrl('')
    setLoadedImageUrl('')
    setLoadVersion((value) => value + 1)
  }

  return (
    <main className="evidence-viewer">
      <header className="evidence-viewer__topbar">
        <div className="evidence-viewer__brand">
          <img src={geosentriIcon} alt="" />
          <div>
            <strong>GeoSentri</strong>
            <span>Secure Evidence Viewer</span>
          </div>
        </div>
        <div className="evidence-viewer__topbar-actions">
          <button
            type="button"
            className="evidence-viewer__icon-button"
            onClick={() => setIsDark((value) => !value)}
            aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
            title={isDark ? 'Use light theme' : 'Use dark theme'}
          >
            {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button type="button" className="evidence-viewer__back" onClick={closeViewer}>
            <ArrowLeft aria-hidden="true" />
            Back to reports
          </button>
        </div>
      </header>

      <div className="evidence-viewer__content">
        {activeState.status === 'loading' && (
          <EvidenceLoadingSkeleton />
        )}

        {activeState.status === 'error' && (
          <section className="evidence-viewer__state" role="alert">
            <ImageOff aria-hidden="true" />
            <h1>Evidence unavailable</h1>
            <p>{activeState.error}</p>
            <button type="button" onClick={retryLoad}>
              <RefreshCw aria-hidden="true" />
              Try again
            </button>
          </section>
        )}

        {activeState.status === 'loaded' && report && (
          <article className="evidence-viewer__panel">
            <header className="evidence-viewer__heading">
              <div>
                <span className="evidence-viewer__eyebrow">Report {report.id}</span>
                <h1>{report.title}</h1>
                <p>{report.report_type} report submitted by {report.officer}</p>
              </div>
              {downloadUrl && (
                <a className="evidence-viewer__download" href={downloadUrl}>
                  <Download aria-hidden="true" />
                  Download image
                </a>
              )}
            </header>

            {evidenceUrl && !imageFailed ? (
              <figure className="evidence-viewer__figure">
                {!imageLoaded && (
                  <SkeletonBlock className="evidence-viewer__image-skeleton" width="100%" height="26rem" />
                )}
                <img
                  className={imageLoaded ? 'is-loaded' : 'is-loading'}
                  src={evidenceUrl}
                  alt={`Evidence attached to report ${report.id}`}
                  decoding="async"
                  onLoad={() => setLoadedImageUrl(evidenceUrl)}
                  onError={() => setFailedImageUrl(evidenceUrl)}
                />
              </figure>
            ) : (
              <section className="evidence-viewer__missing" role="status">
                <ImageOff aria-hidden="true" />
                <strong>No viewable evidence image</strong>
                <span>The report has no photo or its temporary media link has expired.</span>
              </section>
            )}

            <dl className="evidence-viewer__metadata">
              <div>
                <dt>Captured</dt>
                <dd>{formatDateTime(evidence?.captured_at)}</dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{evidence?.camera_facing === 'front' ? 'Front camera' : 'Back camera'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{report.location || 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>{report.validation_status || 'Pending'}</dd>
              </div>
            </dl>

            <footer className="evidence-viewer__security-note">
              <ShieldCheck aria-hidden="true" />
              <span>This evidence is stored privately. Its temporary media link expires automatically.</span>
            </footer>
          </article>
        )}
      </div>
    </main>
  )
}

export default EvidenceViewerPage
