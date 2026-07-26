"""
TTL cache with single-flight fetching, shared by the upstream API clients.

A plain TTL cache handles the second request for a point a minute later. It does
nothing for two requests that arrive together — both miss, and both call the
upstream. That is the common case here: the map fires a request per pan, and two
users in the same city hit the same rounded coordinate at the same time. Every
free tier behind this is quota- or rate-limited (IQAir allows 5 calls/minute),
so concurrent misses on one key are collapsed onto a single in-flight fetch.
"""

import asyncio
import logging
import time
from typing import Awaitable, Callable, Dict, Generic, Optional, Tuple, TypeVar

logger = logging.getLogger("airq.services.cache")

T = TypeVar("T")


class TTLCache(Generic[T]):
    """
    Fresh/stale reads, explicit stores, and in-flight deduplication.

    Storing is left to the caller rather than done inside the fetch wrapper:
    what counts as a cacheable answer differs per source (an upstream that
    replied "no data" is worth caching, one that replied 429 is not), and only
    the caller knows how to present a stale value it decides to fall back on.
    """

    def __init__(self, name: str, ttl_s: float = 300.0, max_entries: int = 512, stale_max_s: float = 3600.0):
        self.name = name
        self.ttl_s = ttl_s
        self.max_entries = max_entries
        self.stale_max_s = stale_max_s
        self._entries: Dict[str, Tuple[float, T]] = {}
        self._inflight: Dict[str, "asyncio.Task[T]"] = {}

    def fresh(self, key: str) -> Optional[T]:
        """The cached value if it is still within the TTL."""
        hit = self._entries.get(key)
        if hit and time.monotonic() - hit[0] < self.ttl_s:
            return hit[1]
        return None

    def stale(self, key: str) -> Optional[Tuple[T, float]]:
        """The cached value with its age in seconds, however old it is."""
        hit = self._entries.get(key)
        if not hit:
            return None
        return hit[1], time.monotonic() - hit[0]

    def store(self, key: str, value: T) -> None:
        now = time.monotonic()
        if len(self._entries) >= self.max_entries:
            # Stale entries are still useful as fallbacks, so only the ones too
            # old to be worth serving are dropped.
            cutoff = now - self.stale_max_s
            for k in [k for k, (ts, _) in self._entries.items() if ts < cutoff]:
                del self._entries[k]
        self._entries[key] = (now, value)

    async def single_flight(self, key: str, fetch: Callable[[], Awaitable[T]]) -> T:
        """
        Run `fetch` for this key, or join the call already running for it.

        Both leader and joiners await through a shield: FastAPI cancels a
        handler when its client disconnects, and without the shield one user
        closing a tab would cancel the fetch everyone else is waiting on.
        """
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(fetch())
            self._inflight[key] = task
            task.add_done_callback(lambda t: self._settle(key, t))
        else:
            logger.debug("[%s] joining in-flight fetch for %s", self.name, key)
        return await asyncio.shield(task)

    def _settle(self, key: str, task: "asyncio.Task[T]") -> None:
        self._inflight.pop(key, None)
        # Every awaiter may have been cancelled while the shielded task ran on.
        # Reading the exception here keeps asyncio from logging it as never
        # retrieved; the awaiters that survived still see it raised.
        if not task.cancelled():
            task.exception()
