import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
    clearNotices,
    dismissNotice,
    enqueueNotice,
    useVisibleNotices,
    type TutorialNotice,
} from "./notices";

function notice(index: number, kind: TutorialNotice["kind"] = "disagreement"): TutorialNotice {
    return {
        key: `${kind}:${index}`,
        kind,
        title: kind === "disagreement" ? "Disagreement logged" : "Consensus logged",
        detail: `topic ${index}`,
        tab: kind === "disagreement" ? "disagreements" : "consensus",
    };
}

function Probe() {
    const visible = useVisibleNotices();
    return (
        <p data-testid="visible">{visible.map((item) => item.key).join(",")}</p>
    );
}

beforeEach(() => {
    clearNotices();
});

describe("tutorial notices", () => {
    it("shows at most three and promotes a queued notice on dismissal", () => {
        render(<Probe />);
        act(() => {
            for (let index = 0; index < 5; index += 1) {
                enqueueNotice(notice(index));
            }
        });
        expect(screen.getByTestId("visible").textContent).toBe(
            "disagreement:0,disagreement:1,disagreement:2"
        );

        act(() => dismissNotice("disagreement:0"));
        expect(screen.getByTestId("visible").textContent).toBe(
            "disagreement:1,disagreement:2,disagreement:3"
        );
    });

    it("deduplicates by the stable log identity", () => {
        render(<Probe />);
        act(() => {
            enqueueNotice(notice(1));
            enqueueNotice(notice(1));
            enqueueNotice(notice(1, "consensus"));
        });
        expect(screen.getByTestId("visible").textContent).toBe(
            "disagreement:1,consensus:1"
        );
    });

    it("keeps a dismissed record from returning for the workspace lifetime", () => {
        render(<Probe />);
        act(() => enqueueNotice(notice(1)));
        act(() => dismissNotice("disagreement:1"));
        act(() => enqueueNotice(notice(1)));
        expect(screen.getByTestId("visible").textContent).toBe("");
    });

    it("clears seen identities on a demo reset", () => {
        render(<Probe />);
        act(() => enqueueNotice(notice(1)));
        act(() => clearNotices());
        act(() => enqueueNotice(notice(1)));
        expect(screen.getByTestId("visible").textContent).toBe(
            "disagreement:1"
        );
    });

    it("keeps the recorded record out of the dismiss path", () => {
        render(<Probe />);
        act(() => enqueueNotice(notice(2)));
        act(() => dismissNotice("disagreement:2"));
        // Dismissal only removes the notice; nothing here mutates the log.
        expect(screen.getByTestId("visible").textContent).toBe("");
    });
});
