import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PatientFilters from './PatientFilters'
import { defaultListSearch } from './search-params'

afterEach(() => vi.useRealTimers())

describe('patient search controls', () => {
  it('shows keystrokes immediately and debounces a page-resetting URL replacement', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(
      <PatientFilters
        search={{ ...defaultListSearch, page: 5 }}
        navigationKey="one"
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('searchbox', { name: 'Search patients' })
    fireEvent.change(input, { target: { value: 'Ada' } })
    expect(input).toHaveValue('Ada')
    act(() => vi.advanceTimersByTime(249))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: 'Ada', page: 1 }, true)
  })
  it('cancels an obsolete debounce and restores Back/Forward input, even when revisiting a key', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { rerender } = render(
      <PatientFilters search={defaultListSearch} navigationKey="one" onChange={onChange} />,
    )
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unfinished' } })
    rerender(
      <PatientFilters
        search={{ ...defaultListSearch, q: 'earlier' }}
        navigationKey="two"
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('searchbox')).toHaveValue('earlier')
    rerender(<PatientFilters search={defaultListSearch} navigationKey="one" onChange={onChange} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()
  })
  it('keeps a just-typed space when its trimmed query commits, without recommitting', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { rerender } = render(
      <PatientFilters search={defaultListSearch} navigationKey="one" onChange={onChange} />,
    )
    const input = screen.getByRole('searchbox', { name: 'Search patients' })
    fireEvent.change(input, { target: { value: 'John ' } })
    act(() => vi.advanceTimersByTime(250))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: 'John', page: 1 }, true)
    // The replace navigation lands with a new history key and the trimmed query.
    rerender(
      <PatientFilters
        search={{ ...defaultListSearch, q: 'John' }}
        navigationKey="two"
        onChange={onChange}
      />,
    )
    expect(input).toHaveValue('John ')
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { value: 'John S' } })
    act(() => vi.advanceTimersByTime(250))
    expect(onChange).toHaveBeenLastCalledWith({ q: 'John S', page: 1 }, true)
  })
  it('commits the current draft when a status filter is chosen', () => {
    const onChange = vi.fn()
    render(<PatientFilters search={defaultListSearch} navigationKey="one" onChange={onChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  Lee ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Active' }))
    expect(onChange).toHaveBeenCalledWith({ status: 'active', q: 'Lee', page: 1 })
  })
})
