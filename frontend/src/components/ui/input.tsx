import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-ink placeholder:text-ink-muted selection:bg-surface-selected selection:text-ink border-control h-10 w-full min-w-0 rounded-control border bg-surface px-3 py-1 text-base text-ink transition-[color,box-shadow] m-control outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-muted md:text-sm pointer-coarse:h-11",
        "focus-visible:border-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        "aria-invalid:border-danger aria-invalid:outline-danger",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
