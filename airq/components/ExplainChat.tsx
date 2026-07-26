"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

import { askAir } from "@/lib/chat";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { ALARM } from "@/lib/utils";
import type { ChatTurn, Coords } from "@/types";

type Props = {
  coords: Coords | null;
  /** The fused estimate on screen, when there is one. Passed through so the
   *  answer explains the number the user is reading rather than the nearest
   *  monitor's, which after a photo scan is a different figure. */
  pm25?: number | null;
};

/**
 * Ask-the-air chat.
 *
 * The transcript lives here and is posted whole each turn — the server refetches
 * its evidence per message and holds no session, so this component is the
 * conversation. A failed turn keeps the question that caused it in the box
 * rather than in the transcript, so retrying does not stack duplicates.
 */
export function ExplainChat({ coords, pm25 }: Props) {
  const { t } = useI18n();
  const { authFetch } = useAuth();

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Survives unmount-free re-renders and is aborted on unmount, so a reply that
  // lands after the user navigates away cannot setState on a dead component.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, loading]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || !coords || loading) return;

    const next: ChatTurn[] = [...turns, { role: "user", text: question }];
    setTurns(next);
    setDraft("");
    setError(null);
    setLoading(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const reply = await askAir(authFetch, coords, next, pm25 ?? null, ctrl.signal);
      setTurns([...next, { role: "model", text: reply }]);
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      // Drop the unanswered question back into the box: leaving it in the
      // transcript would send it twice on the next turn.
      setTurns(turns);
      setDraft(question);
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  function clear() {
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setError(null);
    setLoading(false);
  }

  const empty = turns.length === 0;

  return (
    <div className="lp-panel flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3">
        <div className="min-w-0">
          <div className="lp-mono text-white/70">{t.chatTitle}</div>
          <div className="mt-1 truncate text-[12px] text-white/35">{t.chatSubtitle}</div>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={clear}
            title={t.chatClear}
            aria-label={t.chatClear}
            className="shrink-0 text-white/35 transition-colors hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Fixed height so the panel does not resize the column as the thread
          grows — the map beside it would jump on every answer. */}
      <div ref={scrollRef} className="max-h-[22rem] min-h-[9rem] flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {empty ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-white/45">{t.chatDisclaimer}</p>
            <div className="flex flex-wrap gap-2">
              {t.chatSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!coords || loading}
                  onClick={() => send(s)}
                  className="border border-white/15 px-2.5 py-1.5 text-left text-[12px] text-white/55 transition-colors hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={turn.role === "user" ? "flex justify-end" : ""}
            >
              {turn.role === "user" ? (
                <div className="max-w-[85%] border border-white/20 px-3 py-2 text-[13px] leading-relaxed text-white">
                  {turn.text}
                </div>
              ) : (
                // Answers run full width and unboxed: they are the content, and
                // a bubble around three paragraphs just makes them harder to read.
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/75">
                  {turn.text}
                </div>
              )}
            </motion.div>
          ))
        )}

        {loading && (
          <div className="lp-mono flex items-center gap-2 text-white/45">
            <span className="h-3 w-3 animate-spin rounded-full border border-white/25 border-t-white" />
            {t.chatThinking}
          </div>
        )}

        {error && (
          <div className="lp-mono flex items-start gap-2" style={{ color: ALARM }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">
              {t.chatFailed} · {error}
            </span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-3 border-t border-white/[0.08] px-5 py-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!coords || loading}
          // Matches the server's per-message cap, so an over-long question is
          // stopped here rather than by a 422.
          maxLength={1000}
          placeholder={coords ? t.chatPlaceholder : t.chatNeedsLocation}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!coords || loading || draft.trim().length === 0}
          aria-label={error ? t.chatRetry : t.chatSend}
          className="shrink-0 border border-white/20 p-1.5 text-white/70 transition-colors hover:border-white/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
