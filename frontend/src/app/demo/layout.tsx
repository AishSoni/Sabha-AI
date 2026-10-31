import type { ReactNode } from "react";
import { DemoShell } from "./demo-shell";

export default function DemoLayout({ children }: { children: ReactNode }) {
    return <DemoShell>{children}</DemoShell>;
}
