import * as React from "react"

import { cn } from "@/lib/utils"

type SkeletonProps = React.ComponentProps<"div"> & {
  /** Keeps the pulse only while content is actually loading. */
  loading?: boolean
}

function Skeleton({ className, loading = true, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      data-loading={loading ? "true" : undefined}
      className={cn("m-skeleton rounded-control", className)}
      {...props}
    />
  )
}

export { Skeleton }
export type { SkeletonProps }
