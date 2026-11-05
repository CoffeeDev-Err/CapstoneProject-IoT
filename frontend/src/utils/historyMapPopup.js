import { hourLabel, patrolLabel } from './dutyGpsHistory'

const element = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
const format = (value, options) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', ...options })
const measured = (value, unit) => value == null || value === '' || value === 'unknown' ? 'Not recorded' : `${value}${unit}`

// MapLibre popups are DOM content. Use textContent for all saved/user data.
// Hours at the same location share a marker, but retain their own timestamps.
export const createHistoryPopupContent = ({ hours, point, context = {} }) => {
  const container = element('section', 'history-point-popup')
  container.setAttribute('aria-label', 'GPS location details')
  const content = element('div', 'history-point-popup__content')
  let selected = 0
  const render = () => {
    const hour = hours?.[selected]
    const sample = hour?.checkpoint || point
    const heading = element('header', 'history-point-popup__heading')
    heading.append(element('span', 'history-point-popup__eyebrow', hour ? `Checkpoint ${hour.hour + 1}` : 'Recorded GPS point'),
      element('h3', '', sample.location_name || 'Recorded GPS location'),
      element('p', '', `${Number(sample.latitude).toFixed(6)}, ${Number(sample.longitude).toFixed(6)}`))
    const details = element('dl', 'history-point-popup__facts')
    const facts = [
      ['Date', format(sample.recorded_at, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })],
      ['GPS time', `${format(sample.recorded_at, { hour: 'numeric', minute: '2-digit', second: '2-digit' })} PHT`],
      ...(hour ? [['Duty hour', hourLabel(hour)]] : []),
      ['Speed', measured(sample.speed, ' km/h')], ['Battery', measured(sample.battery_level, '%')],
      ['Accuracy', measured(sample.accuracy, ' m')], ['Satellites', measured(sample.satellites, '')],
    ]
    facts.forEach(([label, value]) => {
      const row = element('div')
      row.append(element('dt', '', label), element('dd', '', value))
      details.append(row)
    })
    const footer = element('footer', 'history-point-popup__footer')
    if (context.personnelName) footer.append(element('strong', '', context.personnelName))
    footer.append(element('span', '', [context.rank, context.badge].filter(Boolean).join(' · ')),
      element('span', '', [context.deploymentType && patrolLabel(context), context.patrolArea].filter(Boolean).join(' · ')))
    if (sample.device_assignment_id) footer.append(element('span', '', `GPS assignment: ${sample.device_assignment_id}`))
    content.replaceChildren(heading, details, footer)
  }
  if (hours?.length > 1) {
    const group = element('div', 'history-point-popup__group')
    group.append(element('p', '', `${hours.length} hourly readings at this location`))
    const choices = element('div', 'history-point-popup__choices')
    choices.setAttribute('role', 'group')
    choices.setAttribute('aria-label', 'Hours at this location')
    hours.forEach((hour, index) => {
      const button = element('button', '', `Hour ${hour.hour + 1}`)
      button.type = 'button'
      button.setAttribute('aria-pressed', String(index === selected))
      button.addEventListener('click', () => {
        selected = index
        choices.querySelectorAll('button').forEach((choice, offset) => choice.setAttribute('aria-pressed', String(offset === selected)))
        render()
      })
      choices.append(button)
    })
    group.append(choices)
    container.append(group)
  }
  container.append(content)
  render()
  return container
}
