const normalizeSearchValue = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const tokenizeSearchValue = (value) => normalizeSearchValue(value)
  .split(/[^a-z0-9]+/)
  .filter(Boolean)

/**
 * Matches every typed token against the beginning of any searchable word.
 * This keeps results live and predictable: "L" finds "Leo", while
 * "San P" finds "San Pablo" without requiring a full or exact value.
 */
export const matchesPrefixSearch = (query, values = []) => {
  const queryTokens = tokenizeSearchValue(query)
  if (queryTokens.length === 0) return true

  const candidateTokens = values.flatMap(tokenizeSearchValue)
  return queryTokens.every((queryToken) => (
    candidateTokens.some((candidateToken) => candidateToken.startsWith(queryToken))
  ))
}

export const searchTokens = tokenizeSearchValue
