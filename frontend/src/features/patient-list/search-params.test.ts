import { describe, expect, it } from 'vitest'
import {
  clampPage,
  defaultListSearch,
  listParams,
  searchForSorting,
  tableSorting,
  validateListSearch,
  validateWorkspaceSearch,
} from './search-params'

describe('patient list URLs', () => {
  it('defaults malformed and unsafe parameters independently', () => {
    expect(
      validateListSearch({
        q: ['not a string'],
        status: 'urgent',
        sort_by: 'injected',
        order: 'sideways',
        page: -4,
        page_size: 10000,
      }),
    ).toEqual(defaultListSearch)
    expect(
      validateListSearch({ q: '  Ada  ', page: '3', page_size: '100', status: 'active' }),
    ).toMatchObject({ q: 'Ada', page: 3, page_size: 100, status: 'active' })
    expect(validateListSearch({ page: 'Infinity' }).page).toBe(1)
  })
  it('limits return destinations and tabs to known workspace views', () => {
    expect(
      validateWorkspaceSearch({ returnTo: 'https://example.org', tab: 'delete' }),
    ).toMatchObject({ returnTo: 'patients', tab: 'overview' })
    expect(
      validateWorkspaceSearch({ returnTo: 'notifications', tab: 'discussion', q: 'Lee' }),
    ).toMatchObject({ returnTo: 'notifications', tab: 'discussion', q: 'Lee' })
  })
  it('maps age direction to the inverse DOB order in both directions', () => {
    expect(searchForSorting([{ id: 'age', desc: false }])).toEqual({
      sort_by: 'dob',
      order: 'desc',
      page: 1,
    })
    expect(searchForSorting([{ id: 'age', desc: true }])).toEqual({
      sort_by: 'dob',
      order: 'asc',
      page: 1,
    })
    expect(tableSorting({ ...defaultListSearch, sort_by: 'dob', order: 'asc' })).toEqual([
      { id: 'age', desc: true },
    ])
    expect(tableSorting({ ...defaultListSearch, sort_by: 'dob', order: 'desc' })).toEqual([
      { id: 'age', desc: false },
    ])
  })
  it('applies unread filtering before API pagination and omits the regular-list filter', () => {
    const search = { ...defaultListSearch, page: 4 as const }
    expect(listParams(search, 'notifications')).toMatchObject({
      has_unread_comments: true,
      page: 4,
      page_size: 20,
    })
    expect(listParams(search, 'patients')).not.toHaveProperty('has_unread_comments')
  })
  it('clamps a disappearing last queue page without creating page zero', () => {
    expect(clampPage(0, 20)).toBe(1)
    expect(clampPage(20, 20)).toBe(1)
    expect(clampPage(21, 20)).toBe(2)
  })
})
