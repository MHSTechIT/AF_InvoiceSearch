import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(COOKIE);
  return res;
}
