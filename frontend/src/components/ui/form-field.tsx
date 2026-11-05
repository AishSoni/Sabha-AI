"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type ControlProps = {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  "aria-required"?: boolean
}

type FormFieldProps = {
  label: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactElement<ControlProps>
}

function FormField({
  label,
  description,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId()
  const controlId = children.props.id ?? generatedId
  const descriptionId = `${generatedId}-description`
  const errorId = `${generatedId}-error`

  const describedBy = [
    children.props["aria-describedby"],
    description ? descriptionId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ")

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    "aria-required": required || undefined,
  })

  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {description ? (
        <p id={descriptionId} className="type-meta text-ink-secondary">
          {description}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="type-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { FormField }
export type { FormFieldProps }
