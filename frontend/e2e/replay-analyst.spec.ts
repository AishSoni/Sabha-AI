import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * One real vertical slice (spec-17): prepared meeting/roster/document, the
 * Director starts the Credit Analyst, the recorded retrieval/tool/citation/
 * text streams, the completed canonical message replaces the provisional
 * text exactly once, and restart returns to the initial checkpoint.
 */
const env = JSON.parse(readFileSync('.e2e-env.json', 'utf8')) as {
    MEETING_ID: string;
};
const FINAL_TEXT = /This is a research checklist, not a recommendation\./;

test('recorded analyst journey from start to canonical settlement', async ({
    page,
}) => {
    await page.goto(`/demo/meetings/${env.MEETING_ID}`);

    await expect(
        page.getByText('Recorded placeholder: synthetic credit review')
    ).toBeVisible();
    await expect(
        page.getByText('The Credit Analyst', { exact: true })
    ).toBeVisible();
    await expect(
        page.getByText('Recorded session. Playback is read-only; no live action is available.')
    ).toBeVisible();

    await page.getByRole('button', { name: /Ask the Credit Analyst/ }).click();

    await expect(page.getByText(/Placeholder recording\./)).toBeVisible();
    await expect(page.getByText(FINAL_TEXT)).toHaveCount(1, { timeout: 20_000 });

    // The scoreboard and context reflect the completed checkpoint, not a
    // second domain workflow.
    await page.getByRole('tab', { name: /Consensus/ }).click();
    await expect(
        page.getByText('Cash-flow verification is required')
    ).toBeVisible();

    await page.getByRole('tab', { name: /Shared Docs/ }).click();
    await expect(page.getByText('synthetic-issuer-brief.md')).toBeVisible();

    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(
        page.getByText('Recorded placeholder: synthetic credit review')
    ).toBeVisible();
    await expect(page.getByText(FINAL_TEXT)).toHaveCount(0);
});
