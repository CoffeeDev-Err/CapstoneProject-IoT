import { POLICE_RANKS } from '../../utils/accountValidation'

export const rankOptions = POLICE_RANKS
export const createTempPassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?'
  let value = ''
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure password generation is unavailable in this browser.')
  const upperBound = 256 - (256 % chars.length)
  while (value.length < length) {
    const bytes = new Uint8Array(Math.max(16, length - value.length))
    globalThis.crypto.getRandomValues(bytes)
    bytes.forEach((byte) => {
      if (value.length < length && byte < upperBound) value += chars[byte % chars.length]
    })
  }
  return value
}
export const createInitialAccountForm = () => ({
  fullName: '', badgeNumber: '', imei: '', flespiDeviceId: '', flespiDeviceName: '',
  rank: rankOptions[0], loginId: '', officialEmail: '', temporaryPassword: createTempPassword(),
  mobileNumber: '',
})
export const getDeviceCode = (device, index = 0) => {
  const source = `${device?.deviceCode || ''} ${device?.name || ''} ${device?.flespiDeviceName || ''}`
  const match = source.match(/\bGPS[-\s]?\d{1,4}\b/i)
  if (match) {
    const digits = match[0].match(/\d+/)?.[0] || String(index + 1)
    return `GPS-${digits.padStart(3, '0')}`
  }
  return `GPS-${String(index + 1).padStart(3, '0')}`
}
export const formatGpsOptionLabel = ({ device, index, assignedAccount }) => {
  const statusLabel = assignedAccount ? `Assigned to ${assignedAccount.fullName}` : 'Available'
  return `${getDeviceCode(device, index)} | Device ID: ${device.imei} | ${statusLabel}`
}
export const formatDateTime = (isoValue) => {
  if (!isoValue) return '-'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(isoValue))
}
