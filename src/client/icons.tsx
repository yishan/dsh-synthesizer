/** 16px line icons drawn on one grid with one stroke weight. They take the text colour. */
const PATHS = {
  play: <path d="M5 3.2v9.6L12.8 8 5 3.2z" fill="currentColor" stroke="none" />,
  pause: <path d="M4.5 3.5h2.4v9H4.5zM9.1 3.5h2.4v9H9.1z" fill="currentColor" stroke="none" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" stroke="none" />,
  volume: <path d="M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5V6.2zM10.4 5.8a3 3 0 010 4.4M12.2 4a5.6 5.6 0 010 8" />,
  muted: <path d="M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5V6.2zM10.6 6l3.4 4M14 6l-3.4 4" />,
  loop: <path d="M3 7V6.2A2.2 2.2 0 015.2 4H13M11 2l2 2-2 2M13 9v.8a2.2 2.2 0 01-2.2 2.2H3M5 14l-2-2 2-2" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  close: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  undo: <path d="M6 3.5L3 6.5l3 3M3.4 6.5h6a3.3 3.3 0 010 6.6H7" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.6M9.2 7v3.6" />,
  help: <path d="M8 14A6 6 0 108 2a6 6 0 000 12zM6.4 6.4a1.7 1.7 0 113 1c-.6.6-1.4.9-1.4 1.8M8 11.4v.2" />,
  chevronDown: <path d="M4 6l4 4 4-4" />,
  chevronUp: <path d="M4 10l4-4 4 4" />,
  speaker: <path d="M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5V6.2zM10.6 6.2a2.6 2.6 0 010 3.6" />,
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  )
}
