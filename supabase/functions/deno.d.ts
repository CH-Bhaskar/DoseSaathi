/* Type declarations for the Deno runtime globals used by the Edge
 * Functions — used ONLY by the Node-based `tsc --noEmit` check
 * (supabase/functions/tsconfig.json). Deno provides the real globals
 * at runtime; this file is not imported by any function and Deno
 * ignores it. */

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): unknown
}
