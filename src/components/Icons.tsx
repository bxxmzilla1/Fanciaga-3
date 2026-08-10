import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 18, className, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
    ...rest
  }
}

export function MenuIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

export function CloseIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function ChevronLeftIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function ChevronUpIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  )
}

export function ChevronDownIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function HomeIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  )
}

export function SendIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M4 12l16-7-7 16-2.5-6.5L4 12z" />
    </svg>
  )
}

export function ScriptIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M7 3.5h7.5L19 8v12.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14.5 3.5V8H19M9 12h6M9 15.5h6" />
    </svg>
  )
}

export function CreatorIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  )
}

export function HistoryIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 5v4.5H9M12 8v4.5l3 1.5" />
    </svg>
  )
}

export function SparklesIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M12 3l1.2 4.2L17.5 8.5 13.2 9.8 12 14l-1.2-4.2L6.5 8.5l4.3-1.3L12 3z" />
      <path d="M18.5 13l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z" />
    </svg>
  )
}

export function FilmIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3.5 9h4.5M3.5 15h4.5M16 9h4.5M16 15h4.5" />
    </svg>
  )
}

export function RocketIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M14 4c3 1.5 5 4.5 5.5 8.5-2.5.8-5.2.3-7.2-1.7S9.7 6 10.5 3.5C12 3.2 13.2 3.5 14 4z" />
      <path d="M9.5 14.5L6 18M9 12.5l-3.5.5M11.5 15l-.5 3.5M8 16l-2.5 2.5" />
    </svg>
  )
}

export function ImageIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M3.5 15.5l4.5-4 4 4 3-2.5 5.5 4" />
    </svg>
  )
}

export function PlayIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
      <path d="M8 6.5v11l9-5.5-9-5.5z" />
    </svg>
  )
}

export function StopIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  )
}

export function PencilIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M14.5 5.5l4 4L8 20H4v-4L14.5 5.5z" />
      <path d="M12.5 7.5l4 4" />
    </svg>
  )
}

export function RefreshIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </svg>
  )
}

export function CheckIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

export function PanelRightIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </svg>
  )
}

export function TrashIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M4.5 6.5h15M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5l.8 12A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.1" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  )
}

export function KeyIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <circle cx="8" cy="14" r="3.5" />
      <path d="M11 12.5L20 3.5M16.5 3.5H20v3.5M14.5 5.5l2.5 2.5" />
    </svg>
  )
}

export function FolderIcon(p: IconProps): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10z" />
    </svg>
  )
}
