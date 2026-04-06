type Props = {
  instructions: string | null | undefined
  className?: string
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

/** Prominent callout for allergies, dietary notes, etc. */
export function CustomerInstructionsBanner({ instructions, className = '' }: Props) {
  const text = typeof instructions === 'string' ? instructions.trim() : ''
  if (!text) return null

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border border-amber-300/80 bg-gradient-to-br from-amber-100/90 via-amber-50 to-orange-50/90
        px-3 py-2.5 shadow-sm ring-1 ring-amber-200/50
        ${className}
      `.trim()}
      role="alert"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 to-amber-600 rounded-l-lg"
        aria-hidden
      />
      <div className="flex items-start gap-2.5 pl-2 sm:gap-3 sm:pl-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm"
          aria-hidden
        >
          <AlertIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-orange-900/85">
            Instructions & alerts
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-amber-950 sm:text-[0.9375rem]">
            {text}
          </p>
        </div>
      </div>
    </div>
  )
}
