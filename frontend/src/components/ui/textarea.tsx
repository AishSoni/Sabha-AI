import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-control placeholder:text-ink-muted selection:bg-surface-selected selection:text-ink flex field-sizing-content min-h-20 w-full rounded-control border bg-surface px-3 py-2 text-base text-ink transition-[color,box-shadow] m-control outline-none focus-visible:border-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-invalid:border-danger aria-invalid:outline-danger disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-muted md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
