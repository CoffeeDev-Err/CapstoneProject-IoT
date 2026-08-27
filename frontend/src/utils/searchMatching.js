const normalizeSearchValue = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const SEARCH_TOKEN_CACHE_LIMIT = 2500
const searchTokenCache = new Map()

const tokenizeSearchValue = (value) => {
  const normalizedValue = normalizeSearchValue(value)

  if (searchTokenCache.has(normalizedValue)) {
    return searchTokenCache.get(normalizedValue)
  }

  const tokens = normalizedValue
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  if (searchTokenCache.size >= SEARCH_TOKEN_CACHE_LIMIT) {
    searchTokenCache.clear()
  }

  searchTokenCache.set(normalizedValue, tokens)
  return tokens
}

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

export const filterDeploymentGroupsByPrefix = (groups = [], query = '') => {
  if (!String(query).trim()) return groups

  return groups.flatMap((group) => {
    const matchingAssignments = (group.assignments || []).filter((assignment) => (
      matchesPrefixSearch(query, [
        assignment.id,
        assignment.personnelName,
        assignment.rank,
        assignment.status,
        assignment.patrolArea,
      ])
    ))

    if (matchingAssignments.length === 0) return []

    const matchingPatrolAreas = [...new Set(
      matchingAssignments.map((assignment) => assignment.patrolArea).filter(Boolean),
    )]

    return [{
      ...group,
      patrolArea: matchingPatrolAreas.length === 1 ? matchingPatrolAreas[0] : group.patrolArea,
      assignments: matchingAssignments,
    }]
  })
}

export const searchTokens = tokenizeSearchValue
