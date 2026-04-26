// No-op stub for server-only in Vitest (Node runner).
// The real package throws unconditionally; Next.js replaces it at bundle
// time so it never throws in production Server Components.
// eslint-disable-next-line @typescript-eslint/no-empty-function
export default function serverOnly() {}
