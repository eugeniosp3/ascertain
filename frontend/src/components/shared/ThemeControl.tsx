import { Laptop, Lightbulb, LightbulbOff } from 'lucide-react'
import { useTheme } from '@/app/theme-provider'
import { isTheme } from '@/app/ui-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const choices = [
  { value: 'light', label: 'Light', Icon: Lightbulb },
  { value: 'dark', label: 'Dark', Icon: LightbulbOff },
  { value: 'system', label: 'System', Icon: Laptop },
] as const

/** The same preference control fits an icon rail or a labelled navigation menu. */
export function ThemeControl({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const choice = choices.find((option) => option.value === theme)!
  const CurrentIcon = resolvedTheme === 'dark' ? LightbulbOff : Lightbulb
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        className="ac-theme-control"
        aria-label="Theme"
        aria-description={`Current theme: ${choice.label}`}
      >
        <CurrentIcon aria-hidden="true" data-theme-icon={resolvedTheme} />
        <span className={collapsed ? 'sr-only' : undefined}>Theme</span>
        {!collapsed && <span className="ac-theme-value">{choice.label}</span>}
      </Button>
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">Theme</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side="top" className="ac-theme-menu" aria-label="Theme">
        <DropdownMenuRadioGroup
          value={theme}
          aria-label="Theme"
          onValueChange={(value) => {
            if (isTheme(value)) setTheme(value)
          }}
        >
          {choices.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
