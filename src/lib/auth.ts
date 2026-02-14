import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AppRole } from '../types/domain';

type AuthResult = { ok: true } | { ok: false; message: string };

type SessionRoleResult = {
  user: User | null;
  role: AppRole;
};

export async function getSessionAndRole(): Promise<SessionRoleResult> {
  if (!supabase) {
    return { user: null, role: 'viewer' };
  }

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user ?? null;
  if (!user) {
    return { user: null, role: 'viewer' };
  }

  const { data: roleRow, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle<{ role: AppRole | null }>();

  if (error) {
    return { user, role: 'viewer' };
  }

  return { user, role: roleRow?.role || 'viewer' };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  if (!normalizedEmail || !normalizedPassword) {
    return { ok: false, message: 'Email and password are required.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: normalizedPassword,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  if (!normalizedEmail || !normalizedPassword) {
    return { ok: false, message: 'Email and password are required.' };
  }

  const { error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: normalizedPassword,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
}
