import * as React from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "pending"

const toneVariants: Record<
  StatusTone,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  neutral: "secondary",
  info: "default",
  success: "success",
  warning: "warning",
  danger: "destructive",
  pending: "outline",
}

type StatusBadgeProps = {
  tone?: StatusTone
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}

function StatusBadge({
  tone = "neutral",
  icon,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      data-tone={tone}
      variant={toneVariants[tone]}
      className={cn("gap-1.5", className)}
    >
      {tone === "pending" ? (
        <Loader2
          className="size-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : icon ? (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </Badge>
  )
}

export { StatusBadge }
export type { StatusBadgeProps, StatusTone }
