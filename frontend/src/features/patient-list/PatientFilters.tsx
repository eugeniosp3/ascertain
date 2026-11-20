import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowDownAZ, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMediaQuery } from '@/hooks/use-media-query'
import { searchForSorting, tableSorting, type ListSearch } from './search-params'

const sortOptions = [
  ['name:asc', 'Name, A–Z'],
  ['name:desc', 'Name, Z–A'],
  ['age:asc', 'Age, youngest first'],
  ['age:desc', 'Age, oldest first'],
  ['last_visit:desc', 'Last visit, newest first'],
  ['last_visit:asc', 'Last visit, oldest first'],
  ['status:asc', 'Status, A–Z'],
  ['status:desc', 'Status, Z–A'],
  ['notes_count:desc', 'Most clinical notes'],
  ['notes_count:asc', 'Fewest clinical notes'],
  ['comments_count:desc', 'Most comments'],
  ['comments_count:asc', 'Fewest comments'],
] as const

export default function PatientFilters({
  search,
  navigationKey,
  onChange,
}: {
  search: ListSearch
  navigationKey: string
  onChange: (patch: Partial<ListSearch>, replace?: boolean) => void
}) {
  // Search draft: typing updates local input immediately; the URL remains the committed query.
  const [draftState, setDraftState] = useState({
    navigationKey,
    canonical: search.q,
    value: search.q,
  })
  // Navigation synchronization: Back/Forward cancels old drafts before effects commit.
  if (draftState.navigationKey !== navigationKey || draftState.canonical !== search.q) {
    setDraftState({ navigationKey, canonical: search.q, value: search.q })
  }
  const draft = draftState.value
  const setDraft = (value: string) => setDraftState({ navigationKey, canonical: search.q, value })
  const isMobile = useMediaQuery('(max-width: 767px)')
  // Debouncing: commit search after 250 ms without another edit, then restart pagination at page 1.
  // Cleanup cancels an outdated timer; the Effect Event reads the latest change handler.
  const commitSearch = useEffectEvent((q: string) => onChange({ q, page: 1 }, true))
  useEffect(() => {
    if (draft === search.q) return
    const timer = window.setTimeout(() => commitSearch(draft.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [draft, search.q, navigationKey])
  const sort = tableSorting(search)[0]
  return (
    <div className="ac-filters ac-surface">
      <div className="ac-search">
        <Label htmlFor="patient-search" className="sr-only">
          Search patients
        </Label>
        <Search aria-hidden="true" />
        <Input
          id="patient-search"
          type="search"
          value={draft}
          maxLength={200}
          placeholder="Search patients…"
          onChange={(event) => setDraft(event.target.value)}
        />
        {draft && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ac-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setDraft('')
              onChange({ q: '', page: 1 }, true)
              document.getElementById('patient-search')?.focus()
            }}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="ac-status-filters" role="group" aria-label="Filter by patient status">
        {(['all', 'active', 'inactive'] as const).map((status) => (
          <Button
            key={status}
            variant="ghost"
            size="sm"
            aria-pressed={search.status === status}
            onClick={() => onChange({ status, q: draft.trim(), page: 1 })}
          >
            {status === 'all' ? 'All patients' : status === 'active' ? 'Active' : 'Inactive'}
          </Button>
        ))}
      </div>
      {isMobile && (
        <div className="ac-mobile-sort">
          <ArrowDownAZ aria-hidden="true" />
          <Select
            value={`${sort?.id}:${sort?.desc ? 'desc' : 'asc'}`}
            onValueChange={(value) => {
              const [id, direction] = value.split(':')
              onChange({
                ...searchForSorting([{ id: id ?? 'name', desc: direction === 'desc' }]),
                q: draft.trim(),
              })
            }}
          >
            <SelectTrigger aria-label="Sort patients">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
