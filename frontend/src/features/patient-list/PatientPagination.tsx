import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { clampPage, validateListSearch, type ListSearch } from './search-params'

export default function PatientPagination({
  search,
  total,
  busy,
  onChange,
}: {
  search: ListSearch
  total: number
  busy: boolean
  onChange: (patch: Partial<ListSearch>) => void
}) {
  const pages = clampPage(total, search.page_size)
  const first = total === 0 ? 0 : (search.page - 1) * search.page_size + 1
  const last = Math.min(search.page * search.page_size, total)
  return (
    <div className="ac-pagination">
      <p className="ac-pagination-info">
        <b>
          {first}–{last}
        </b>{' '}
        of <b>{total}</b> patients
      </p>
      <div className="ac-page-size">
        <Label htmlFor="patient-page-size">Rows per page</Label>
        <Select
          value={String(search.page_size)}
          onValueChange={(value) =>
            onChange({ page_size: validateListSearch({ page_size: value }).page_size, page: 1 })
          }
        >
          <SelectTrigger id="patient-page-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="ac-page-nav">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={search.page <= 1 || busy}
          onClick={() => onChange({ page: search.page - 1 })}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span>
          Page {search.page} of {pages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={search.page >= pages || busy}
          onClick={() => onChange({ page: search.page + 1 })}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
