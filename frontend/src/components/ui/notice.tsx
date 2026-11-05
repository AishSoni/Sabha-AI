import * as React from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"

import { cn } from "@/lib/utils"

type NoticeTone = "info" | "success" | "warning" | "danger"

const toneStyles: Record<NoticeTone, string> = {
  info: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
}

const toneIcons: Record<NoticeTone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
}

type NoticeProps = {
  tone?: NoticeTone
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: NoticeProps) {
  const Icon = toneIcons[tone]
  const role = tone === "danger" || tone === "warning" ? "alert" : "status"

  return (
    <div
      data-slot="notice"
      data-tone={tone}
      role={role}
      className={cn(
        "border-separator flex gap-3 rounded-group border p-4",
        toneStyles[tone],
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="type-control">{title}</p> : null}
        {children ? <div className="type-body">{children}</div> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  )
}

export { Notice }
export type { NoticeProps, NoticeTone }
