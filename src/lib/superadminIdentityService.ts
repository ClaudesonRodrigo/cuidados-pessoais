import { isCredentialVerificationError } from "./onboardingService.ts";

const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export type SuperadminIdentity = Readonly<{ uid: string }>;

export type SuperadminIdentityDependencies = {
  verifyIdToken(token: string): Promise<{ uid?: unknown }>;
  isOfficialSuperAdminUid(uid: string): boolean;
  logError?(context: { phase: "verify"; error: unknown }): void;
};

type SuperadminIdentityErrorCode =
  | "UNAUTHORIZED"
  | "SUPERADMIN_REQUIRED"
  | "SUPERADMIN_IDENTITY_UNAVAILABLE";

export class SuperadminIdentityError extends Error {
  readonly status: number;
  readonly code: SuperadminIdentityErrorCode;

  constructor(status: number, code: SuperadminIdentityErrorCode, message: string) {
    super(message);
    this.name = "SuperadminIdentityError";
    this.status = status;
    this.code = code;
  }
}

const unauthorized = (message = "Autenticação necessária.") =>
  new SuperadminIdentityError(401, "UNAUTHORIZED", message);

const unavailable = () => new SuperadminIdentityError(
  503,
  "SUPERADMIN_IDENTITY_UNAVAILABLE",
  "Identidade Master indisponível.",
);

export const requireSuperadminIdentity = async (
  request: Request,
  dependencies: SuperadminIdentityDependencies,
): Promise<SuperadminIdentity> => {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match || !JWT_STRUCTURE_PATTERN.test(match[1])) throw unauthorized();

  let decoded: { uid?: unknown };
  try {
    decoded = await dependencies.verifyIdToken(match[1]);
  } catch (error) {
    if (isCredentialVerificationError(error)) throw unauthorized("Token inválido.");
    dependencies.logError?.({ phase: "verify", error });
    throw unavailable();
  }

  if (typeof decoded.uid !== "string" || decoded.uid.length === 0) {
    throw unauthorized("Token inválido.");
  }
  if (!dependencies.isOfficialSuperAdminUid(decoded.uid)) {
    throw new SuperadminIdentityError(
      403,
      "SUPERADMIN_REQUIRED",
      "Superadmin necessário.",
    );
  }

  return { uid: decoded.uid };
};

export const superadminIdentityErrorResponse = (
  error: SuperadminIdentityError,
): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);
