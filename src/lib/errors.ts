/**
 * The one error type services throw. Kept free of Next.js imports so the
 * service layer can be unit-tested outside the web runtime.
 */
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly fields?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
  }
}
