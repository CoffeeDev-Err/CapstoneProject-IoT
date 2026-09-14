export const LOGIN_ID_PATTERN = /^\d{2}-\d{4}$/;
export const LOGIN_ID_FORMAT_MESSAGE = 'Login ID must use the NN-NNNN format, such as 12-2004.';

const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL_DOMAIN_CORRECTIONS: Record<string, string> = {
  'isu.edu.p': 'isu.edu.ph',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'ggmail.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'outlok.com': 'outlook.com',
};

export const validateLoginIdInput = (value: string) => {
  const loginId = value.trim();
  if (!loginId) return 'Enter your Login ID.';
  return LOGIN_ID_PATTERN.test(loginId) ? '' : LOGIN_ID_FORMAT_MESSAGE;
};

export const validateRecoveryIdentifier = (value: string) => {
  const identifier = value.trim();
  if (!identifier) return 'Enter your Login ID or official email.';
  if (identifier.includes('@')) {
    const normalizedIdentifier = identifier.toLowerCase();
    const [localPart, domain, ...extraParts] = normalizedIdentifier.split('@');
    if (!extraParts.length && localPart && EMAIL_DOMAIN_CORRECTIONS[domain]) {
      return `Check the email domain. Did you mean ${localPart}@${EMAIL_DOMAIN_CORRECTIONS[domain]}?`;
    }
    if (localPart?.startsWith('.') || localPart?.endsWith('.') || localPart?.includes('..')) {
      return 'The email username cannot start or end with a period or contain consecutive periods.';
    }
    return EMAIL_PATTERN.test(normalizedIdentifier)
      ? ''
      : 'Enter a complete official email address, such as name@pnp.gov.ph.';
  }
  return LOGIN_ID_PATTERN.test(identifier) ? '' : LOGIN_ID_FORMAT_MESSAGE;
};
