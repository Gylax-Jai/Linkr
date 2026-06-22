import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Absolute URLs (Cloudinary / Google) are public; relative ones hit an authenticated route. */
function isAbsolute(url: string): boolean {
  return /^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:");
}

/**
 * Resolve a URL to something the browser can render directly:
 *  - absolute/data/blob URLs are returned as-is (public);
 *  - relative URLs (e.g. `/chat/media/:id`, `/users/avatar/:id`) are fetched through the
 *    authenticated axios client and exposed as an object URL — an `<img src>` / `<a href>` cannot
 *    attach the Bearer token, so we fetch the blob ourselves.
 *
 * Object URLs are revoked on change/unmount to avoid leaks.
 */
export function useAuthedObjectUrl(url?: string): { src?: string; loading: boolean; error: boolean } {
  const [src, setSrc] = useState<string | undefined>(() =>
    url && isAbsolute(url) ? url : undefined,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setSrc(undefined);
      return;
    }
    if (isAbsolute(url)) {
      setSrc(url);
      setError(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;
    setLoading(true);
    setError(false);

    api
      .get(url, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, loading, error };
}
