import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { createAppRouter, parseSearch } from './router'

describe('router search parsing', () => {
  it.each([
    ['?q=47247945115246', '47247945115246'],
    ['?q=1e5', '1e5'],
    ['?q=true', 'true'],
    ['?q=Ada', 'Ada'],
    ['?q=%22212%22', '212'],
    ['?q=', ''],
  ])('keeps the free-text search term %s as text', (searchStr, q) => {
    expect(parseSearch(searchStr).q).toBe(q)
  })

  it('still decodes the other parameters with the default JSON rules', () => {
    expect(parseSearch('?q=12345&page=2&page_size=50')).toEqual({
      q: '12345',
      page: 2,
      page_size: 50,
    })
  })

  it.each(['/patients', '/notifications'])(
    'a deep link to %s keeps a numeric search term',
    (path) => {
      const router = createAppRouter(
        createMemoryHistory({ initialEntries: [`${path}?q=47247945115246`] }),
      )
      expect(router.state.location.search).toMatchObject({ q: '47247945115246' })
    },
  )
})
