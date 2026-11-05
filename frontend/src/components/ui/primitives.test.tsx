import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AnimatedDisclosure } from "./animated-disclosure"
import { Button } from "./button"
import { EmptyState } from "./empty-state"
import { FormField } from "./form-field"
import { IconButton } from "./icon-button"
import { Notice } from "./notice"
import { Skeleton } from "./skeleton"
import { StatusBadge } from "./status-badge"

describe("shared UI contracts", () => {
  it("announces a busy button without changing its accessible action", () => {
    render(
      <Button busy busyLabel="Saving">
        Save changes
      </Button>
    )

    const button = screen.getByRole("button")
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toBeDisabled()
    expect(screen.getByText("Saving")).toBeInTheDocument()
  })

  it("gives icon controls an accessible name", () => {
    render(<IconButton label="Close panel" icon={<span aria-hidden="true">x</span>} />)

    expect(
      screen.getByRole("button", { name: "Close panel" })
    ).toBeInTheDocument()
  })

  it("ties a field label, description, and error to the control", () => {
    render(
      <FormField
        label="Workspace name"
        description="Shown to everyone in the meeting."
        error="Enter at least two characters."
        required
      >
        <input />
      </FormField>
    )

    const input = screen.getByLabelText(/workspace name/i)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-required", "true")
    expect(input.getAttribute("aria-describedby")).toContain("-description")
    expect(input.getAttribute("aria-describedby")).toContain("-error")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter at least two characters."
    )
  })

  it("renders status as text plus tone, never colour alone", () => {
    render(<StatusBadge tone="success">Ready</StatusBadge>)

    const badge = screen
      .getByText("Ready")
      .closest("[data-slot='badge']") as HTMLElement
    expect(badge).toHaveAttribute("data-tone", "success")
    expect(badge).toHaveAttribute("data-variant", "success")
  })

  it("uses alert semantics for actionable failure and status semantics for information", () => {
    const { rerender } = render(
      <Notice tone="danger" title="Upload failed">
        Choose a smaller file and try again.
      </Notice>
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed")

    rerender(
      <Notice tone="info" title="Replay only">
        This meeting is not connected to a provider.
      </Notice>
    )
    expect(screen.getByRole("status")).toHaveTextContent("Replay only")
  })

  it("keeps skeleton blocks decorative and stops pulsing when loaded", () => {
    const { container, rerender } = render(<Skeleton />)
    const skeleton = container.firstElementChild
    expect(skeleton).toHaveAttribute("aria-hidden", "true")
    expect(skeleton).toHaveAttribute("data-loading", "true")

    rerender(<Skeleton loading={false} />)
    expect(container.firstElementChild).not.toHaveAttribute("data-loading")
  })

  it("explains an empty scope and offers its next action", () => {
    render(
      <EmptyState
        title="No documents yet"
        description="Add a document to give this meeting context."
        action={<Button>Add document</Button>}
      />
    )

    expect(screen.getByText("No documents yet")).toBeInTheDocument()
    expect(
      screen.getByText("Add a document to give this meeting context.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Add document" })
    ).toBeInTheDocument()
  })

  it("exposes disclosure state and reveals content on activation", () => {
    render(
      <AnimatedDisclosure trigger={<button type="button">Details</button>}>
        <p>Supporting evidence</p>
      </AnimatedDisclosure>
    )

    const trigger = screen.getByRole("button", { name: "Details" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Supporting evidence")).not.toBeInTheDocument()

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Supporting evidence")).toBeInTheDocument()
  })
})
