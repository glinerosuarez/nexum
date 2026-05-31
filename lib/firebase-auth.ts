export interface FirebaseAuthSuccess {
  idToken: string;
  expiresIn: string;
}

function sanitizeErrorMessage(raw: unknown): string {
  const input = typeof raw === "string" ? raw : "";
  const compact = input.replace(/[^A-Z0-9_:/ -]/gi, "").trim();
  return compact.slice(0, 120) || "AUTH_FAILED";
}

function resolveFirebaseWebApiKey(): string {
  const direct = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (direct) return direct;

  const configRaw = process.env.FIREBASE_CLIENT_CONFIG?.trim();
  if (!configRaw) {
    throw new Error("Missing FIREBASE_WEB_API_KEY or FIREBASE_CLIENT_CONFIG.");
  }

  try {
    const parsed = JSON.parse(configRaw) as { apiKey?: string };
    const fromConfig = parsed.apiKey?.trim();
    if (!fromConfig) {
      throw new Error("apiKey missing in FIREBASE_CLIENT_CONFIG.");
    }
    return fromConfig;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Invalid FIREBASE_CLIENT_CONFIG: ${error.message}`
        : "Invalid FIREBASE_CLIENT_CONFIG",
    );
  }
}

async function firebaseAuthPost(
  path: string,
  payload: Record<string, unknown>,
): Promise<FirebaseAuthSuccess> {
  const apiKey = resolveFirebaseWebApiKey();
  const url = `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      returnSecureToken: true,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    idToken?: string;
    expiresIn?: string;
    error?: { message?: string };
  };

  if (!response.ok || !body.idToken || !body.expiresIn) {
    const detail = sanitizeErrorMessage(body.error?.message);
    throw new Error(detail);
  }

  return {
    idToken: body.idToken,
    expiresIn: body.expiresIn,
  };
}

export async function signInAnonymously(): Promise<FirebaseAuthSuccess> {
  return firebaseAuthPost("accounts:signUp", {});
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<FirebaseAuthSuccess> {
  return firebaseAuthPost("accounts:signInWithPassword", {
    email,
    password,
  });
}
