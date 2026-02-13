import { supabase } from './supabase';

export async function getSessionAndRole() {
  if (!supabase) {
    return { user: null, role: 'viewer' };
  }

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user || null;
  if (!user) {
    return { user: null, role: 'viewer' };
  }

  const { data: roleRow, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    // Auth succeeded but role query failed — still return the user.
    return { user, role: 'viewer' };
  }

  return { user, role: roleRow?.role || 'viewer' };
}

export async function signInWithPassword(email, password) {
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

export async function signUpWithPassword(email, password) {
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

export async function signOut() {
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
}
