import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import FeedbackContext from './feedbackContext'

const feedbackMeta = {
  error: { title: 'Action needed', Icon: AlertCircle },
  info: { title: 'Information', Icon: Info },
  success: { title: 'Success', Icon: CheckCircle2 },
  warning: { title: 'Attention', Icon: TriangleAlert },
}

export function FeedbackProvider({ children }) {
  const [feedback, setFeedback] = useState(null)

  const dismissFeedback = useCallback(() => setFeedback(null), [])
  const showFeedback = useCallback((message, options = {}) => {
    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) return
    const type = feedbackMeta[options.type] ? options.type : 'info'
    setFeedback({
      id: `${Date.now()}-${Math.random()}`,
      message: normalizedMessage,
      title: options.title || feedbackMeta[type].title,
      type,
      duration: options.duration ?? (type === 'error' ? 9000 : 5000),
    })
  }, [])

  useEffect(() => {
    if (!feedback?.duration) return undefined
    const timeoutId = window.setTimeout(dismissFeedback, feedback.duration)
    return () => window.clearTimeout(timeoutId)
  }, [dismissFeedback, feedback])

  const value = useMemo(() => ({ dismissFeedback, showFeedback }), [dismissFeedback, showFeedback])
  const meta = feedback ? feedbackMeta[feedback.type] : null
  const FeedbackIcon = meta?.Icon

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {feedback && (
        <div
          className={`global-feedback global-feedback--${feedback.type}`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
        >
          <FeedbackIcon className="global-feedback__icon" aria-hidden="true" />
          <div className="global-feedback__content">
            <strong>{feedback.title}</strong>
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={dismissFeedback} aria-label="Dismiss message">
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}
