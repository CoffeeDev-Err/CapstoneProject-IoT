import { meetsPasswordRequirements, POLICE_RANKS } from '../../utils/accountValidation'

export const rankOptions = POLICE_RANKS
export const createTempPassword = (length = 12) => {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%&*?',
  ]
  const requestedLength = Math.max(10, Math.min(Number(length) || 12, 128))
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure password generation is unavailable in this browser.')

  const secureIndex = (max) => {
    const upperBound = 256 - (256 % max)
    const byte = new Uint8Array(1)
    do globalThis.crypto.getRandomValues(byte)
    while (byte[0] >= upperBound)
    return byte[0] % max
  }
  const allCharacters = groups.join('')
  const characters = groups.map((group) => group[secureIndex(group.length)])
  while (characters.length < requestedLength) {
    characters.push(allCharacters[secureIndex(allCharacters.length)])
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureIndex(index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }
  const password = characters.join('')
  if (!meetsPasswordRequirements(password)) throw new Error('Secure password generation failed validation.')
  return password
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
