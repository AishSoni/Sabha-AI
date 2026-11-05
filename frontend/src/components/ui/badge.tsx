import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2.5 py-0.5 type-meta font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-invalid:outline-2 aria-invalid:outline-danger m-control overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-action text-action-foreground",
        secondary: "bg-surface-raised text-ink",
        destructive: "bg-danger text-on-danger",
        outline: "border-control text-ink",
        ghost: "text-ink-secondary",
        link: "text-action underline-offset-4 [a&]:hover:underline",
        success: "bg-success text-on-success",
        warning: "bg-warning text-on-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
