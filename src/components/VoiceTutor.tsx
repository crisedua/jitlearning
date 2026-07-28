'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';

interface Turn {
  role: 'user' | 'agent';
  text: string;
}

/**
 * Voice interface to the tutor agent.
 *
 * The browser never sees the ElevenLabs API key: it asks `/api/signed-url` for
 * a short-lived signed WebSocket URL and connects with that.
 */
export function VoiceTutor() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [starting, setStarting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onMessage: ({ message, source }: { message: string; source: string }) => {
      setTurns((prev) => [
        ...prev,
        { role: source === 'user' ? 'user' : 'agent', text: message },
      ]);
    },
    onError: (message: string) => setError(message),
  });

  const { status, isSpeaking, startSession, endSession, sendUserMessage } = conversation;
  const connected = status === 'connected';

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      // Must originate from a user gesture, or the browser rejects it.
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const res = await fetch('/api/signed-url');
      const data = (await res.json()) as { signedUrl?: string; error?: string };
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error ?? 'Could not reach the agent.');
      }

      setTurns([]);
      await startSession({ signedUrl: data.signedUrl, connectionType: 'websocket' });

      // Seed the agent with the learner's goal without spending a spoken turn.
      if (objective.trim()) {
        conversation.sendContextualUpdate(
          `The learner's stated goal for this session: ${objective.trim()}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the session.');
    } finally {
      setStarting(false);
    }
  }, [startSession, conversation, objective]);

  return (
    <div className="space-y-6">
      <label className="block max-w-xl">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
          What are you stuck on?
        </span>
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="rolling back a bad release"
          disabled={connected}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>

      <div className="flex items-center gap-4">
        {connected ? (
          <button
            onClick={() => void endSession()}
            className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium hover:bg-red-500"
          >
            End session
          </button>
        ) : (
          <button
            onClick={() => void start()}
            disabled={starting || status === 'connecting'}
            className="rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:brightness-110"
          >
            {starting || status === 'connecting' ? 'Connecting…' : 'Start learning'}
          </button>
        )}

        <span className="flex items-center gap-2 text-sm text-gray-400">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${
              connected
                ? isSpeaking
                  ? 'animate-pulse bg-[var(--color-accent)]'
                  : 'bg-emerald-500'
                : 'bg-gray-600'
            }`}
          />
          {connected ? (isSpeaking ? 'Coach is speaking' : 'Listening') : status}
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <section
        ref={transcriptRef}
        className="h-80 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
      >
        {turns.length === 0 ? (
          <p className="text-sm text-gray-500">
            Transcript appears here once the session starts.
          </p>
        ) : (
          <ul className="space-y-3">
            {turns.map((turn, i) => (
              <li key={i} className="text-sm">
                <span
                  className={
                    turn.role === 'user'
                      ? 'font-medium text-gray-400'
                      : 'font-medium text-[var(--color-accent)]'
                  }
                >
                  {turn.role === 'user' ? 'You' : 'Coach'}:{' '}
                </span>
                <span className="text-gray-200">{turn.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {connected && <TextFallback onSend={sendUserMessage} />}
    </div>
  );
}

/** Typing fallback for noisy rooms or when the mic misfires. */
function TextFallback({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (!text) return;
        onSend(text);
        setValue('');
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Or type your question…"
        className="flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <button className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm hover:border-gray-500">
        Send
      </button>
    </form>
  );
}
