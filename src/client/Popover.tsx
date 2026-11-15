import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Button with a dropdown that closes on outside click or Escape. */
export function Popover({
  label,
  trigger,
  icon = false,
  buttonClassName = '',
  menuClassName = '',
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  label: string
  trigger: ReactNode
  icon?: boolean
  buttonClassName?: string
  menuClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: (close: () => void) => ReactNode
}): JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const root = useRef<HTMLDivElement>(null)
  const setOpen = (next: boolean): void => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  useEffect(() => {
    if (!open) return
    const closeMenu = (): void => {
      if (controlledOpen === undefined) setUncontrolledOpen(false)
      onOpenChange?.(false)
    }
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) closeMenu()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, controlledOpen, onOpenChange])
  return (
    <div ref={root} className="dsyn-pop">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        title={icon ? label : undefined}
        onClick={() => { setOpen(!open) }}
        className={`dsyn-btn${icon ? ' is-icon' : ''} ${buttonClassName}`}
      >
        {trigger}
      </button>
      {open ? <div className={`dsyn-menu ${menuClassName}`}>{children(() => { setOpen(false) })}</div> : null}
    </div>
  )
}
