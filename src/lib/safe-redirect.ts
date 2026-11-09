/**
 * Validates and sanitizes a redirect destination path to prevent Open Redirect attacks.
 *
 * Guarantees that the returned path is strictly a relative same-origin path
 * starting with a single forward slash ('/'). Disallows protocol-relative slashes ('//'),
 * backslashes ('/\'), schemes ('https://'), control characters, and encoded bypasses.
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/"
): string {
  if (!value) return fallback;
  const v = value.trim();

  // Must begin with a single slash, not double slash or backslash
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) {
    return fallback;
  }

  // Must not contain URI schemes
  if (v.includes("://")) {
    return fallback;
  }

  // Reject ASCII control characters and encoded traversal/protocol bypasses
  if (/[\u0000-\u001f\u007f]/.test(v) || /%2f%2f|%5c/i.test(v)) {
    return fallback;
  }

  return v;
}
