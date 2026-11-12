/** Sidebar panel icon: two stacked notes. */
export function SidebarIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <path d="M6.2 13.6V4.2l8-1.4v9.2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="4.6" cy="13.6" r="1.7" fill="currentColor" />
      <circle cx="12.6" cy="12.1" r="1.7" fill="currentColor" />
    </svg>
  )
}
