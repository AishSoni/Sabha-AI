/**
 * Tooling smoke test: proves the Vitest + happy-dom + Testing Library +
 * React 19 + zustand pipeline runs (Workstream A prerequisite). It does not
 * pin application behavior; per-finding tests do that.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { create } from "zustand";

interface CounterState {
  count: number;
  increment: () => void;
}

const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

function Counter() {
  const count = useCounterStore((s) => s.count);
  const increment = useCounterStore((s) => s.increment);
  return (
    <button type="button" onClick={increment}>
      clicked {count}
    </button>
  );
}

describe("test tooling pipeline", () => {
  it("renders TSX and drives a zustand store inside happy-dom", () => {
    render(<Counter />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("clicked 0");
    fireEvent.click(button);
    expect(button).toHaveTextContent("clicked 1");
  });
});
