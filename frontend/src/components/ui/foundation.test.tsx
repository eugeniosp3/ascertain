import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { CountPill } from './count-pill'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'
import { Label } from './label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { StatusPill } from './status-pill'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

// jsdom has no scrolling layout. Radix still calls the browser method on focus.
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  }
})

describe('themed interaction primitives', () => {
  it('contains keyboard focus in a dialog and restores it after Escape', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open details</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Details</DialogTitle>
          <DialogDescription>Review the selected record.</DialogDescription>
          <Button>First action</Button>
          <Button>Last action</Button>
        </DialogContent>
      </Dialog>,
    )

    const trigger = screen.getByRole('button', { name: 'Open details' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Details' })
    await waitFor(() => expect(within(dialog).getByText('First action')).toHaveFocus())
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByText('First action')).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('initially focuses the safe cancel action in a confirmation', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn()
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Delete record</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>This action removes the record.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep record</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirm}>
              Confirm deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    )

    await user.click(screen.getByRole('button', { name: 'Delete record' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep record' })).toHaveFocus())
    await user.keyboard('{Enter}')
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the checkbox label and keyboard interaction connected', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Checkbox id="include-inactive" />
        <Label htmlFor="include-inactive">Include inactive records</Label>
      </div>,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Include inactive records' })
    await user.click(screen.getByText('Include inactive records'))
    expect(checkbox).toBeChecked()
    checkbox.focus()
    await user.keyboard(' ')
    expect(checkbox).not.toBeChecked()
  })

  it('supports selecting an option entirely with the keyboard', async () => {
    const user = userEvent.setup()
    render(
      <Select defaultValue="active">
        <SelectTrigger aria-label="Patient status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>,
    )

    const trigger = screen.getByRole('combobox', { name: 'Patient status' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Active' })).toHaveFocus())
    await user.keyboard('{ArrowDown}{Enter}')
    expect(trigger).toHaveTextContent('Inactive')
    expect(trigger).toHaveFocus()
  })

  it('moves between tabs with arrow keys and exposes the selected panel', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="Record views">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Profile information</TabsContent>
        <TabsContent value="discussion">Team comments</TabsContent>
      </Tabs>,
    )

    screen.getByRole('tab', { name: 'Overview' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Discussion' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Discussion' })).toHaveTextContent('Team comments')
  })
})

describe('patient and activity pills', () => {
  it('preserves an unknown patient status and labels a missing status', () => {
    render(
      <div>
        <StatusPill status="active" />
        <StatusPill status="unrecognized upstream value" />
        <StatusPill status={null} />
      </div>,
    )
    expect(screen.getByText('Active')).toBeVisible()
    expect(screen.getByText('unrecognized upstream value')).toBeVisible()
    expect(screen.getByText('Unknown')).toBeVisible()
  })

  it('retains the full accessible unread count behind a visual cap', () => {
    render(<CountPill count={120} variant="unread" />)
    expect(screen.getByText('99+')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('120 unread comments')).not.toHaveAttribute('aria-hidden')
  })

  it('announces singular counts without repeating the visual number', () => {
    const { rerender } = render(<CountPill count={1} variant="unread" />)
    expect(screen.getByText('1 unread comment')).not.toHaveAttribute('aria-hidden')
    rerender(<CountPill count={1} label="clinical notes" singularLabel="clinical note" />)
    expect(screen.getByText('1 clinical note')).not.toHaveAttribute('aria-hidden')
    rerender(<CountPill count={0} label="clinical notes" singularLabel="clinical note" />)
    expect(screen.getByText('0 clinical notes')).not.toHaveAttribute('aria-hidden')
  })
})
