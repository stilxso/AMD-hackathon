"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";
import { fetchThumbnail } from "@/lib/cabinet";
import { cn } from "@/lib/utils";

/**
 * An <img> for an endpoint that requires the bearer token.
 *
 * The browser issues `<img src>` without an Authorization header, so a history
 * thumbnail pointed at directly would 401 and render as a broken image. This
 * fetches the bytes through authFetch and shows them as an object URL, revoking
 * it on unmount so the blob is not retained for the life of the tab.
 */
export function AuthImage({
  url,
  alt,
  className,
  fallback,
}: {
  url: string | null;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const { authFetch } = useAuth();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    let revoked: string | null = null;

    fetchThumbnail(authFetch, url, ctrl.signal)
      .then((blobUrl) => {
        if (ctrl.signal.aborted) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        revoked = blobUrl;
        setObjectUrl(blobUrl);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });

    return () => {
      ctrl.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url, authFetch]);

  if (!url || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-white/[0.03]", className)}>
        {fallback}
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={cn("animate-pulse bg-white/[0.06]", className)} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt={alt} className={cn("object-cover", className)} />;
}
