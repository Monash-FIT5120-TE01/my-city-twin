/**
 * Fetch that reports how much has actually arrived.
 *
 * The building snapshot is 4.8 MB. Without a byte count the user is looking
 * at a spinner that cannot distinguish "downloading" from "hung", which is
 * the state this replaces.
 */
export async function fetchJsonWithProgress<T>(
  url: string,
  onBytes: (loaded: number, total: number | null) => void,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${url}`);

  const header = response.headers.get('content-length');
  // Absent behind compression or chunked transfer; the caller falls back to
  // an indeterminate bar rather than inventing a denominator.
  const total = header ? Number.parseInt(header, 10) : null;

  if (!response.body) {
    const text = await response.text();
    onBytes(text.length, total);
    return JSON.parse(text) as T;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded, total);
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(merged)) as T;
}

/** Lets the browser paint between two pieces of blocking work. */
export const yieldToPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
