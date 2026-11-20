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

export function ActorSelector() {
  const { actorId, users, setActorId, isLoading, error, retry } = useActor()
  return (
    <div className="ac-actor-selector">
      <Label htmlFor="demo-actor">Demo user</Label>
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
          <SelectTrigger id="demo-actor" className="ac-actor-trigger" aria-label="Select demo user">
            <SelectValue placeholder={isLoading ? 'Loading users…' : 'Choose a user'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Choose a user</SelectItem>
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
          : 'Select a demo user above to open records, write notes, and see their unread conversations.'}
      </p>
      <Button
        variant="outline"
        onClick={error ? retry : () => document.getElementById('demo-actor')?.focus()}
      >
        {error ? 'Retry' : 'Select demo user'}
      </Button>
    </section>
  )
}
