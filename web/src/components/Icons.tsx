import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const)

/* ------------------------------------------------ brand */
export const LingoMark = ({ size = 40, ...rest }: P & { size?: number }) => (
  <svg viewBox="0 0 44 44" width={size} height={size} aria-hidden {...rest}>
    <path
      d="M22 9c-7.7 0-13 4.6-13 10.9 0 3.8 2 7 5.2 8.9V34l5.8-3.1c.7.1 1.3.1 2 .1 7.7 0 13-4.6 13-10.9S29.7 9 22 9Z"
      fill="#fff"
    />
    <circle cx="16.5" cy="20" r="2.3" fill="#3FC161" />
    <circle cx="22" cy="20" r="2.3" fill="#3FC161" />
    <circle cx="27.5" cy="20" r="2.3" fill="#3FC161" />
  </svg>
)

export const Heart = ({ size = 17, ...rest }: P & { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest}>
    <path
      d="M12 21s-8-5-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 6-8 11-8 11Z"
      fill="currentColor"
    />
  </svg>
)

export const Gem = ({ size = 17, ...rest }: P & { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest}>
    <path d="M8 2h8l4 6-8 14L4 8l4-6Z" fill="#22B8F0" />
    <path d="M4 8h16l-8 14L4 8Z" fill="#5BD0F7" />
  </svg>
)

export const Flame = ({ size = 18, ...rest }: P & { size?: number }) => (
  <svg viewBox="0 0 20 24" width={(size * 20) / 24} height={size} aria-hidden {...rest}>
    <path
      d="M10 1c.4 3.2 1.9 4.8 3.6 6.6C15.6 9.8 17 12 17 15a7 7 0 0 1-14 0c0-2.3 1-3.9 2.3-5.3.3 1 .9 1.8 1.7 2.2-.6-3.4.6-7.6 3-10.9Z"
      fill="#FF9600"
    />
    <path
      d="M10 21a4 4 0 0 1-4-4c0-2.4 2.4-3.6 3.3-5.6.5 1.3 1.4 2 1.4 3.6 1-.6 1.6-1.5 1.8-2.5.9 1.2 1.5 2.6 1.5 4.5a4 4 0 0 1-4 4Z"
      fill="#FFC24B"
    />
  </svg>
)

export const Shield = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest}>
    <path d="M12 2 4 5v7c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" fill="currentColor" />
  </svg>
)

export const Star = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest}>
    <path
      d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17.2 6.4 20l1.2-6.2L3 9.5l6.3-.8L12 3Z"
      fill="currentColor"
    />
  </svg>
)

export const Trophy = ({ size = 34, ...rest }: P & { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="#E5A11C"
    strokeWidth="1.9"
    strokeLinejoin="round"
    aria-hidden
    {...rest}
  >
    <path d="M7 4h10v5.5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4v1.7A3 3 0 0 0 7 10M17 5.5h3v1.7a3 3 0 0 1-3 2.8" />
    <path d="M10.4 14h3.2l-.6 4h-2l-.6-4Z" />
    <path d="M8 21h8" />
  </svg>
)

/* ------------------------------------------------ nav (prototype set) */
export const NavLearn = (p: P) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...p}
  >
    <path d="M4 11.2 12 4l8 7.2" />
    <path d="M6.2 9.6V20h11.6V9.6" />
  </svg>
)

export const NavRank = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M7 4h10v5.5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4v1.7A3 3 0 0 0 7 10M17 5.5h3v1.7a3 3 0 0 1-3 2.8" />
    <path d="M10.4 14h3.2l-.6 4h-2l-.6-4Z" />
    <path d="M8 21h8" />
  </svg>
)

export const NavShop = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M5 8h14l-1.1 12.2H6.1L5 8Z" />
    <path d="M9 8V6.2a3 3 0 0 1 6 0V8" />
  </svg>
)

export const NavQuest = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
)

export const NavMe = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden {...p}>
    <circle cx="12" cy="8.2" r="3.9" />
    <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
  </svg>
)

/* ------------------------------------------------ actions */
export const Close = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" {...rest}>
    <path d="M6 6 18 18M18 6 6 18" />
  </svg>
)

export const Check = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
)

export const Lock = ({ size = 24, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="currentColor" {...rest}>
    <path d="M7 10V7a5 5 0 0 1 10 0v3h.6c.8 0 1.4.6 1.4 1.4v7.2c0 .8-.6 1.4-1.4 1.4H6.4C5.6 20 5 19.4 5 18.6v-7.2C5 10.6 5.6 10 6.4 10H7Zm2.5 0h5V7a2.5 2.5 0 0 0-5 0v3Z" />
  </svg>
)

export const Speaker = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="currentColor" {...rest}>
    <path d="M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M15.4 8.6a5 5 0 0 1 0 6.8M18 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const Mic = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="currentColor" {...rest}>
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
    <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const Send = ({ size = 19, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="currentColor" {...rest}>
    <path d="M4 11.5 20 4l-6.5 16-2.6-6.4L4 11.5Z" />
  </svg>
)

export const Back = ({ size = 24, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M14.5 5 7.5 12l7 7" />
  </svg>
)

export const Camera = ({ size = 26, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.6" />
  </svg>
)

export const Album = ({ size = 26, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.8" />
    <path d="m4 17 5-5 4.5 4.5L17 13l3 3.5" />
  </svg>
)

export const Sparkle = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="currentColor" {...rest}>
    <path d="M12 3.5c.5 3 1.9 4.4 4.8 4.9-2.9.5-4.3 1.9-4.8 4.9-.5-3-1.9-4.4-4.8-4.9 2.9-.5 4.3-1.9 4.8-4.9ZM18.5 14c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6Z" />
  </svg>
)

export const Trash = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M4 7h16M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
    <path d="M6.5 7l.9 12.1A1.2 1.2 0 0 0 8.6 20h6.8a1.2 1.2 0 0 0 1.2-1.1L17.5 7" />
  </svg>
)

export const Chart = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M4 19V5M4 19h16" />
    <path d="M7.5 15.5c2-5 4-1.5 5.5-5s3 -2 4 -4" />
  </svg>
)

export const Clock = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.4l3.4 2" />
  </svg>
)

export const Refresh = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4.5V10h-5.5" />
  </svg>
)

export const Pencil = ({ size = 18, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M16.5 4.5 19.5 7.5 8 19H5v-3L16.5 4.5Z" />
  </svg>
)

export const Alert = ({ size = 20, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.4v.2" />
  </svg>
)

export const Settings = ({ size = 22, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M6.7 17.3 5 19M19 5l-1.7 1.7" />
  </svg>
)

export const Brain = ({ size = 22, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.2 3.2 0 0 0 7 18.4a3 3 0 0 0 5-1.4V6.7A2.8 2.8 0 0 0 9 4.5Z" />
    <path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2A3.2 3.2 0 0 1 17 18.4a3 3 0 0 1-5-1.4" />
  </svg>
)

export const Deck = ({ size = 22, ...rest }: P & { size?: number }) => (
  <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d="M5 4.5h6.5v15H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
    <path d="M11.5 4.5H18a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6.5" />
    <path d="M8 9h1.5M14.5 9H16M8 13h1.5M14.5 13H16" />
  </svg>
)
