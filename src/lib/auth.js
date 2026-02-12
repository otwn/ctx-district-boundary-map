import { supabase } from './supabase';

export async function getSessionAndRole() {
  if (!supabase) {
    return { user: null, role: 'viewer' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user || null;
  if (!user) {
    return { user: null, role: 'viewer' };
  }

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return { user, role: roleRow?.role || 'viewer' };
}

export async function signInWithPassword(email, password) {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function signUpWithPassword(email, password) {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { error } = await supabase.auth.signUp({ email, password });
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
