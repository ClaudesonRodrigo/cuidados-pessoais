import { isOfficialSuperAdminUid } from "./adminIdentity.ts";

const MAX_BODY_BYTES = 8_192;
const OWNER_TRIAL_MS = 7 * 24 * 60 * 60 * 1_000;
const SLUG_PATTERN = /^[a-z0-9-]{3,120}$/;

type AccountType = "customer" | "owner";
type DocumentData = Record<string, unknown>;

export type DecodedIdentity = {
  uid: string;
  email?: string;
};

export type OnboardingTransaction = {
  getUser(uid: string): Promise<DocumentData | null>;
  getPage(slug: string): Promise<DocumentData | null>;
  createUser(uid: string, data: DocumentData): void;
  createPage(slug: string, data: DocumentData): void;
};

export type OnboardingStore = {
  runTransaction<T>(operation: (transaction: OnboardingTransaction) => Promise<T>): Promise<T>;
};

export type OnboardingDependencies = {
  verifyIdToken(token: string): Promise<DecodedIdentity>;
  store: OnboardingStore;
  now?: () => Date;
};

type ParsedInput = {
  accountType: AccountType;
  slug?: string;
  title?: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  cpfCnpj?: string;
  bio?: string;
};

type ProvisioningResult = {
  status: "PROVISIONED" | "ALREADY_PROVISIONED";
  accountType: AccountType | "admin";
  pageSlug?: string;
};

type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SLUG"
  | "UNAUTHORIZED"
  | "SLUG_TAKEN"
  | "PROVISIONING_CONFLICT"
  | "ONBOARDING_UNAVAILABLE";

class OnboardingError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class InvalidOnboardingTokenError extends Error {
  constructor() {
    super("Invalid Firebase ID token.");
    this.name = "InvalidOnboardingTokenError";
  }
}

const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const DEFINITIVE_CREDENTIAL_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/user-disabled",
]);
const CREDENTIAL_ARGUMENT_ERROR_PREFIXES = [
  "Decoding Firebase ID token failed.",
  "verifyIdToken() expects an ID token, but was given a custom token.",
  "verifyIdToken() expects an ID token, but was given a legacy custom token.",
  'Firebase ID token has no "kid" claim.',
  "Firebase ID token has incorrect algorithm.",
  'Firebase ID token has incorrect "aud" (audience) claim.',
  'Firebase ID token has incorrect "iss" (issuer) claim.',
  'Firebase ID token has no "sub" (subject) claim.',
  'Firebase ID token has an empty "sub" (subject) claim.',
  'Firebase ID token has a "sub" (subject) claim longer than 128 characters.',
  "Firebase ID token has invalid signature.",
  'Firebase ID token has "kid" claim which does not correspond to a known public key.',
];

const errorProperty = (error: unknown, property: "code" | "message"): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" ? value : undefined;
};

export const isCredentialVerificationError = (error: unknown): boolean => {
  const code = errorProperty(error, "code");
  if (code && DEFINITIVE_CREDENTIAL_ERROR_CODES.has(code)) return true;
  if (code !== "auth/argument-error") return false;

  const message = errorProperty(error, "message");
  return Boolean(
    message && CREDENTIAL_ARGUMENT_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix)),
  );
};

export const verifyOnboardingIdToken = async (
  token: string,
  verify: (token: string) => Promise<DecodedIdentity>,
): Promise<DecodedIdentity> => {
  if (!JWT_STRUCTURE_PATTERN.test(token)) throw new InvalidOnboardingTokenError();

  try {
    return await verify(token);
  } catch (error) {
    if (isCredentialVerificationError(error)) throw new InvalidOnboardingTokenError();
    throw error;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicResponse = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const optionalString = (
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new OnboardingError(400, "INVALID_REQUEST", `${field} inválido.`);
  }
  return value;
};

const parseInput = (value: unknown): ParsedInput => {
  if (!isPlainObject(value)) {
    throw new OnboardingError(400, "INVALID_REQUEST", "Entrada inválida.");
  }

  const accountType = value.accountType;
  if (accountType !== "customer" && accountType !== "owner") {
    throw new OnboardingError(400, "INVALID_REQUEST", "accountType inválido.");
  }

  const customerKeys = new Set([
    "accountType",
    "displayName",
    "photoURL",
    "phone",
    "cpfCnpj",
  ]);
  const ownerKeys = new Set([...customerKeys, "slug", "title", "bio"]);
  const allowedKeys = accountType === "owner" ? ownerKeys : customerKeys;
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new OnboardingError(400, "INVALID_REQUEST", "Entrada contém campos proibidos.");
  }

  const parsed: ParsedInput = {
    accountType,
    displayName: optionalString(value.displayName, "displayName", 120),
    photoURL: optionalString(value.photoURL, "photoURL", 2_048),
    phone: optionalString(value.phone, "phone", 40),
    cpfCnpj: optionalString(value.cpfCnpj, "cpfCnpj", 40),
  };

  if (accountType === "owner") {
    const slug = value.slug;
    if (
      typeof slug !== "string" ||
      !SLUG_PATTERN.test(slug) ||
      slug.includes("..") ||
      slug.includes("/")
    ) {
      throw new OnboardingError(400, "INVALID_SLUG", "Slug inválido.");
    }

    if (typeof value.title !== "string" || value.title.trim().length === 0 || value.title.length > 160) {
      throw new OnboardingError(400, "INVALID_REQUEST", "title inválido.");
    }

    parsed.slug = slug;
    parsed.title = value.title;
    parsed.bio = optionalString(value.bio, "bio", 1_000);
  }

  return parsed;
};

const withPresentValues = (
  target: DocumentData,
  values: Record<string, string | undefined>,
) => {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) target[key] = value;
  }
  return target;
};

const dateMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  if (isPlainObject(value) && typeof value.toDate === "function") {
    const result = value.toDate();
    return result instanceof Date ? result.getTime() : null;
  }
  return null;
};

const isConsistentCustomer = (user: DocumentData): boolean =>
  user.role === "customer" &&
  (user.plan === undefined || user.plan === null) &&
  (user.trialDeadline === undefined || user.trialDeadline === null) &&
  (user.pageSlug === undefined || user.pageSlug === null) &&
  user.isSuperAdmin !== true &&
  user.admin !== true &&
  user.isPro !== true;

const isConsistentOwner = (
  user: DocumentData,
  page: DocumentData,
  uid: string,
  slug: string,
): boolean => {
  const userTrial = dateMillis(user.trialDeadline);
  const pageTrial = dateMillis(page.trialDeadline);
  return (
    user.role === "owner" &&
    user.plan === "pro" &&
    user.pageSlug === slug &&
    page.userId === uid &&
    page.slug === slug &&
    page.plan === "pro" &&
    userTrial !== null &&
    userTrial === pageTrial &&
    user.isSuperAdmin !== true &&
    user.admin !== true &&
    user.isPro !== true &&
    page.isSuperAdmin !== true &&
    page.admin !== true &&
    page.isPro !== true
  );
};

const customerDocument = (
  identity: DecodedIdentity,
  input: ParsedInput,
  now: Date,
): DocumentData =>
  withPresentValues(
    {
      uid: identity.uid,
      role: "customer",
      createdAt: now,
      ...(identity.email ? { email: identity.email } : {}),
    },
    {
      displayName: input.displayName,
      photoURL: input.photoURL,
      phone: input.phone,
      cpfCnpj: input.cpfCnpj,
    },
  );

const provisionCustomer = async (
  identity: DecodedIdentity,
  input: ParsedInput,
  transaction: OnboardingTransaction,
  now: Date,
): Promise<ProvisioningResult> => {
  const existingUser = await transaction.getUser(identity.uid);
  if (existingUser) {
    if (!isConsistentCustomer(existingUser)) {
      throw new OnboardingError(409, "PROVISIONING_CONFLICT", "Conta possui estado incompatível.");
    }
    return { status: "ALREADY_PROVISIONED", accountType: "customer" };
  }

  transaction.createUser(identity.uid, customerDocument(identity, input, now));
  return { status: "PROVISIONED", accountType: "customer" };
};

const provisionOwner = async (
  identity: DecodedIdentity,
  input: ParsedInput,
  transaction: OnboardingTransaction,
  now: Date,
): Promise<ProvisioningResult> => {
  const slug = input.slug!;
  const [existingUser, existingPage] = await Promise.all([
    transaction.getUser(identity.uid),
    transaction.getPage(slug),
  ]);

  if (existingUser) {
    if (existingPage && isConsistentOwner(existingUser, existingPage, identity.uid, slug)) {
      return { status: "ALREADY_PROVISIONED", accountType: "owner", pageSlug: slug };
    }
    throw new OnboardingError(409, "PROVISIONING_CONFLICT", "Conta possui estado incompatível.");
  }

  if (existingPage) {
    if (existingPage.userId !== identity.uid) {
      throw new OnboardingError(409, "SLUG_TAKEN", "Slug já está em uso.");
    }
    throw new OnboardingError(409, "PROVISIONING_CONFLICT", "Página possui estado incompatível.");
  }

  const trialDeadline = new Date(now.getTime() + OWNER_TRIAL_MS);
  const user = withPresentValues(
    {
      uid: identity.uid,
      role: "owner",
      plan: "pro",
      trialDeadline,
      pageSlug: slug,
      createdAt: now,
      ...(identity.email ? { email: identity.email } : {}),
    },
    {
      displayName: input.displayName,
      photoURL: input.photoURL,
      phone: input.phone,
      cpfCnpj: input.cpfCnpj,
    },
  );
  const page: DocumentData = {
    userId: identity.uid,
    slug,
    title: input.title!,
    bio: input.bio ?? "Agende seu horário e realce sua beleza!",
    links: [],
    createdAt: now,
    plan: "pro",
    trialDeadline,
    isOpen: true,
  };

  transaction.createUser(identity.uid, user);
  transaction.createPage(slug, page);
  return { status: "PROVISIONED", accountType: "owner", pageSlug: slug };
};

const readBody = async (request: Request): Promise<unknown> => {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_BODY_BYTES) {
    throw new OnboardingError(400, "INVALID_REQUEST", "Entrada inválida.");
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new OnboardingError(400, "INVALID_REQUEST", "Entrada inválida.");
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new OnboardingError(400, "INVALID_REQUEST", "JSON inválido.");
  }
};

export const handleOnboardingRequest = async (
  request: Request,
  dependencies: OnboardingDependencies,
): Promise<Response> => {
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) throw new OnboardingError(401, "UNAUTHORIZED", "Autenticação necessária.");

    let identity: DecodedIdentity;
    try {
      identity = await dependencies.verifyIdToken(match[1]);
    } catch (error) {
      if (error instanceof InvalidOnboardingTokenError) {
        throw new OnboardingError(401, "UNAUTHORIZED", "Token inválido.");
      }
      throw error;
    }
    if (!identity || typeof identity.uid !== "string" || identity.uid.length === 0) {
      throw new OnboardingError(401, "UNAUTHORIZED", "Token inválido.");
    }

    const input = parseInput(await readBody(request));
    if (isOfficialSuperAdminUid(identity.uid)) {
      return publicResponse(
        { status: "ALREADY_PROVISIONED", accountType: "admin" } satisfies ProvisioningResult,
        200,
      );
    }

    const now = new Date((dependencies.now ?? (() => new Date()))().getTime());
    const result = await dependencies.store.runTransaction((transaction) =>
      input.accountType === "customer"
        ? provisionCustomer(identity, input, transaction, now)
        : provisionOwner(identity, input, transaction, now),
    );
    return publicResponse(result, 200);
  } catch (error) {
    if (error instanceof OnboardingError) {
      return publicResponse(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    console.error("Falha interna no provisionamento de onboarding.");
    return publicResponse(
      { error: { code: "ONBOARDING_UNAVAILABLE", message: "Onboarding temporariamente indisponível." } },
      503,
    );
  }
};
