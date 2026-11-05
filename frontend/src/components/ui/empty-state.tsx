import * as React from "react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className
      )}
    >
      {icon ? (
        <div className="text-ink-muted" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="type-item-title text-ink">{title}</p>
      {description ? (
        <p className="type-body text-ink-secondary max-w-[52ch]">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
