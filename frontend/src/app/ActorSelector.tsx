import { useId } from 'react'
import { useActor } from './actor-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Demo display names read "Demo User 1 · Sam Rivera"; the person's name is the last part. */
function splitDisplayName(name: string): { role: string | null; person: string } {
  const separator = name.lastIndexOf(' · ')
  return separator === -1
    ? { role: null, person: name }
    : { role: name.slice(0, separator), person: name.slice(separator + 3) }
}

/** The header selector's id; "Select demo user" calls to action move focus there. */
export const actorSelectorId = 'demo-actor'

/**
 * The header and the phone menu sheet each render one selector, bound to the same actor state.
 * Only the header passes the fixed id; any other instance gets a generated one, so ids stay unique.
 */
export function ActorSelector({ id }: { id?: string }) {
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const { actorId, users, setActorId, isLoading, error, retry } = useActor()
  const selected = users.find((user) => user.id === actorId)
  const parts = selected ? splitDisplayName(selected.display_name) : null
  return (
    <div className="ac-actor-selector">
      <Label htmlFor={triggerId}>Demo user</Label>
      {error ? (
        <Button variant="outline" size="sm" onClick={retry}>
          Retry demo users
        </Button>
      ) : (
        <Select
          value={actorId ?? 'none'}
          onValueChange={(id) => setActorId(id === 'none' ? null : id)}
          disabled={isLoading}
        >
          <SelectTrigger id={triggerId} className="ac-actor-trigger" aria-label="Select demo user">
            <SelectValue placeholder={isLoading ? 'Loading users…' : 'Choose a user'}>
              {/* The full display name stays in the text and accessible name; narrow
                  headers visually keep only the person's name. */}
              {parts ? (
                // One inline run, so the select's flex gap never splits the name.
                <span className="ac-actor-name">
                  {parts.role && <span className="ac-actor-role">{parts.role} · </span>}
                  {parts.person}
                </span>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* A switcher, not a gate: "no user" is offered only until a user is in effect. */}
            {!actorId && <SelectItem value="none">Choose a user</SelectItem>}
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export function ActorRequired() {
  const { error, isLoading, retry } = useActor()
  return (
    <section className="ac-empty ac-surface" aria-labelledby="actor-required-title">
      <h1 id="actor-required-title">{isLoading ? 'Loading demo users…' : 'Choose a demo user'}</h1>
      <p>
        {error
          ? 'Demo users could not be loaded. Try again to continue.'
          : 'Choose a demo user to open records, notes and conversations.'}
      </p>
      <Button
        variant="outline"
        onClick={error ? retry : () => document.getElementById(actorSelectorId)?.focus()}
      >
        {error ? 'Retry' : 'Select demo user'}
      </Button>
    </section>
  )
}
