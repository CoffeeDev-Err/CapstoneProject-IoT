import { useState } from 'react'

const getInitials = (name = '') => name
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase() || 'P'

function InitialsAvatar({ src, name, className = '', alt = '' }) {
  const [failedSrc, setFailedSrc] = useState('')
  const hasImage = Boolean(src && failedSrc !== src)

  if (hasImage) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
      />
    )
  }

  return (
    <span
      className={`${className} initials-avatar`}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : 'true'}
    >
      {getInitials(name)}
    </span>
  )
}

export default InitialsAvatar
