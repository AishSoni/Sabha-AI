import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control type-control font-medium m-control m-press outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:outline-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-action text-action-foreground hover:bg-action-hover",
        destructive:
          "bg-danger text-on-danger hover:bg-danger-hover",
        outline:
          "border border-control bg-surface text-ink hover:bg-surface-raised",
        secondary:
          "bg-surface-raised text-ink hover:bg-surface-selected",
        ghost: "text-ink hover:bg-surface-raised",
        link: "text-action underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3 pointer-coarse:h-11",
        xs: "h-7 gap-1 rounded-control px-2 type-meta has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-control gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:h-11",
        lg: "h-12 rounded-control px-6 has-[>svg]:px-4",
        icon: "size-10 pointer-coarse:size-11",
        "icon-xs": "size-7 rounded-control [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 pointer-coarse:size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  busy = false,
  busyLabel = "Working",
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    busy?: boolean
    busyLabel?: string
  }) {
  const Comp = asChild ? Slot : "button"
  const content =
    busy && !asChild ? (
      <>
        <span aria-hidden="true" className="invisible inline-flex items-center gap-2">
          {children}
        </span>
        <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{busyLabel}</span>
        </span>
      </>
    ) : (
      children
    )

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-busy={busy || undefined}
      aria-busy={busy || undefined}
      aria-disabled={asChild ? busy || disabled || undefined : undefined}
      disabled={asChild ? undefined : busy || disabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
