export const LOGIN_ID_PATTERN = /^\d{2}-\d{4}$/;
export const LOGIN_ID_FORMAT_MESSAGE = 'Login ID must use the NN-NNNN format, such as 12-2004.';

const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const validateLoginIdInput = (value: string) => {
  const loginId = value.trim();
  if (!loginId) return 'Enter your Login ID.';
  return LOGIN_ID_PATTERN.test(loginId) ? '' : LOGIN_ID_FORMAT_MESSAGE;
};

export const validateRecoveryIdentifier = (value: string) => {
  const identifier = value.trim();
  if (!identifier) return 'Enter your Login ID or official email.';
  if (identifier.includes('@')) {
    return EMAIL_PATTERN.test(identifier)
      ? ''
      : 'Enter a complete official email address, such as name@pnp.gov.ph.';
  }
  return LOGIN_ID_PATTERN.test(identifier) ? '' : LOGIN_ID_FORMAT_MESSAGE;
};
