export type DomainErrorCode = "invalid_input" | "invalid_transition" | "forbidden" | "not_found" | "conflict";

export type DomainError = {
  readonly code: DomainErrorCode;
  readonly message: string;
};

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const fail = (code: DomainErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});
