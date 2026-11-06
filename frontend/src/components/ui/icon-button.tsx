"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "aria-label" | "size"
> & {
  /** Accessible name. Rendered as the button label and optional tooltip. */
  label: string
  icon: React.ReactNode
  size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg"
  tooltip?: boolean
  className?: string
}

function IconButton({
  label,
  icon,
  size = "icon",
  tooltip = false,
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      aria-label={label}
      size={size}
      className={cn("shrink-0", className)}
      {...props}
    >
      {icon}
    </Button>
  )

  if (!tooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export { IconButton }
export type { IconButtonProps }
