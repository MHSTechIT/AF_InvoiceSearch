import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET!;
const COOKIE = 'mhs_auth';

const ADMINS: Record<string, string> = {
  [process.env.ADMIN_USER_1 ?? 'admin1']: process.env.ADMIN_PASS_1 ?? 'mhs@admin1',
  [process.env.ADMIN_USER_2 ?? 'admin2']: process.env.ADMIN_PASS_2 ?? 'mhs@admin2',
};

export function validateCredentials(username: string, password: string): boolean {
  return ADMINS[username] === password;
}

export function signToken(username: string): string {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): { username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { username: string };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ username: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { COOKIE };
