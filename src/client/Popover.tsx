import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Button with a dropdown that closes on outside click or Escape. */
export function Popover({
  label,
  trigger,
  icon = false,
  buttonClassName = '',
  menuClassName = '',
  children,
}: {
  label: string
  trigger: ReactNode
  icon?: boolean
  buttonClassName?: string
  menuClassName?: string
  children: (close: () => void) => ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
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
