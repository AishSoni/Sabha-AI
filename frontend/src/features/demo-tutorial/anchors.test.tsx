import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
    getAnchor,
    registerAnchor,
    resetAnchorRegistry,
    useAnchorCandidates,
    useAnchorElement,
    useAnchorRef,
} from "./anchors";
import type { TutorialAnchorId } from "./contract";

function Control({ id, label }: { id: TutorialAnchorId; label: string }) {
    const ref = useAnchorRef(id);
    return <button ref={ref}>{label}</button>;
}

function Probe({ id }: { id: TutorialAnchorId }) {
    const element = useAnchorElement(id);
    return <p data-testid="probe">{element?.textContent ?? "none"}</p>;
}

function CandidateProbe({ ids }: { ids: TutorialAnchorId[] }) {
    const match = useAnchorCandidates(ids);
    return (
        <p data-testid="candidates">
            {match ? `${match.id}:${match.element.textContent}` : "none"}
        </p>
    );
}

describe("anchor registry", () => {
    it("tracks a real control from mount until unmount", () => {
        resetAnchorRegistry();
        const { unmount } = render(<Control id="demo.start" label="Start" />);
        expect(getAnchor("demo.start")?.textContent).toBe("Start");

        unmount();
        expect(getAnchor("demo.start")).toBeNull();
    });

    it("re-renders readers when an anchor appears", async () => {
        resetAnchorRegistry();
        function Late() {
            const [shown, setShown] = useState(false);
            return (
                <div>
                    <button type="button" onClick={() => setShown(true)}>
                        mount
                    </button>
                    {shown ? <Control id="room.close" label="Close" /> : null}
                    <Probe id="room.close" />
                </div>
            );
        }
        render(<Late />);
        expect(screen.getByTestId("probe").textContent).toBe("none");
        fireEvent.click(screen.getByRole("button", { name: "mount" }));
        await waitFor(() =>
            expect(screen.getByTestId("probe").textContent).toBe("Close")
        );
    });

    it("keeps the latest registration and ignores a stale cleanup", () => {
        resetAnchorRegistry();
        const first = document.createElement("button");
        const second = document.createElement("button");
        first.textContent = "first";
        second.textContent = "second";

        const clearFirst = registerAnchor("room.vote", first);
        const clearSecond = registerAnchor("room.vote", second);
        expect(getAnchor("room.vote")).toBe(second);

        clearFirst();
        expect(getAnchor("room.vote")).toBe(second);

        clearSecond();
        expect(getAnchor("room.vote")).toBeNull();
    });

    it("prefers the first mounted candidate", () => {
        resetAnchorRegistry();
        render(
            <>
                <Control id="room.vote-confirm" label="Start Vote" />
                <CandidateProbe ids={["room.vote", "room.vote-confirm"]} />
            </>
        );
        expect(screen.getByTestId("candidates").textContent).toBe(
            "room.vote-confirm:Start Vote"
        );
    });

    it("reports no match when the alternate is missing too", () => {
        resetAnchorRegistry();
        render(<CandidateProbe ids={["room.vote", "room.vote-confirm"]} />);
        expect(screen.getByTestId("candidates").textContent).toBe("none");
    });
});
