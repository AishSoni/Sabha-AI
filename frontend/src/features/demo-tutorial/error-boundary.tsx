"use client";

/**
 * Failure boundary for the tutorial HUD (spec-29).
 *
 * A broken tutorial must never take the recorded room down with it. This
 * boundary wraps only the tutorial layer, so real meeting errors keep
 * propagating through the room's own error handling.
 */
import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    failed: boolean;
}

export class TutorialBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(): void {
        // Presentation-only: the room and the recording stay usable.
    }

    render(): ReactNode {
        if (this.state.failed) return null;
        return this.props.children;
    }
}
