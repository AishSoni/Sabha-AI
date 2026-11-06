"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import { cn } from "@/lib/utils"

type AnimatedDisclosureProps = {
  trigger: React.ReactElement
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  contentClassName?: string
}

function AnimatedDisclosure({
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  disabled,
  className,
  contentClassName,
}: AnimatedDisclosureProps) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="animated-disclosure"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className={className}
    >
      <CollapsiblePrimitive.Trigger asChild>
        {trigger}
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content
        data-slot="animated-disclosure-content"
        className={cn("m-disclosure", contentClassName)}
      >
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}

export { AnimatedDisclosure }
export type { AnimatedDisclosureProps }
