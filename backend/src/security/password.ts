import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with OWASP-recommended parameters (19 MiB, 2 passes, 1 lane).
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// A real hash of a random string, used so that "unknown email" takes as long
// as "wrong password" and the two can't be told apart by timing.
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password-' + Math.random());
  await verifyPassword(await dummy, password);
}

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'welcome1', 'admin123', 'letmein1',
  'abc12345', 'monkey123', 'dragon12', 'trustno1', '11111111', '00000000', 'passw0rd', 'music123',
]);

/** Returns a human-readable problem, or null if the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters';
  if (password.length > 128) return 'Use at most 128 characters';
  if (COMMON.has(password.toLowerCase())) return 'That password is too common';
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating one character';
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Password can’t be your email';
  return null;
}
