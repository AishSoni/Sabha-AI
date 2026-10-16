'use client';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BondJourney } from './BondJourney';

function mockFetchQueue(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift() ?? queue[queue.length - 1];
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('bond journey walkthrough', () => {
  it('starts the walkthrough and shows disclosures with the pinned instrument', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchQueue([
        {
          status: 201,
          body: {
            credential: 'tok-1',
            session: { generation: 1 },
            meeting: { meeting_id: 'm-1' },
          },
        },
      ]),
    );
    render(<BondJourney />);
    await userEvent.click(
      screen.getByRole('button', { name: /start walkthrough/i }),
    );
    await waitFor(() => {
      expect(screen.getAllByText(/INE001A07RW5/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();
    expect(screen.getByText(/2020-07-31/)).toBeInTheDocument();
  });

  it('advances one step and records the completed turn', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchQueue([
        {
          status: 201,
          body: {
            credential: 'tok-1',
            session: { generation: 1 },
            meeting: { meeting_id: 'm-1' },
          },
        },
        {
          status: 200,
          body: {
            completed_action: 'start_walkthrough',
            next_action: 'inspect_board',
            turn: {
              action_id: 'start_walkthrough',
              final_text: 'Welcome to the single-bond review.',
            },
          },
        },
      ]),
    );
    render(<BondJourney />);
    await userEvent.click(
      screen.getByRole('button', { name: /start walkthrough/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /begin/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /begin/i }));
    await waitFor(() => {
      expect(
        screen.getByText('Welcome to the single-bond review.'),
      ).toBeInTheDocument();
    });
  });

  it('surfaces a retryable message on stale revision conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchQueue([
        {
          status: 201,
          body: {
            credential: 'tok-1',
            session: { generation: 1 },
            meeting: { meeting_id: 'm-1' },
          },
        },
        { status: 409, body: { code: 'stale_revision' } },
      ]),
    );
    render(<BondJourney />);
    await userEvent.click(
      screen.getByRole('button', { name: /start walkthrough/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /begin/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /begin/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/moved on/i);
    });
  });

  it('resets to a fresh fenced walkthrough', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchQueue([
        {
          status: 201,
          body: {
            credential: 'tok-1',
            session: { generation: 1 },
            meeting: { meeting_id: 'm-1' },
          },
        },
        {
          status: 200,
          body: { session: { generation: 2 }, meeting: { meeting_id: 'm-2' } },
        },
      ]),
    );
    render(<BondJourney />);
    await userEvent.click(
      screen.getByRole('button', { name: /start walkthrough/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /reset walkthrough/i }),
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole('button', { name: /reset walkthrough/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/step 1 of 10/i)).toBeInTheDocument();
    });
  });
});
