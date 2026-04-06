/**
 * delete-workshop-user — Supabase Edge Function
 * ================================================
 * Elimina un usuario del equipo del taller.
 * Solo pueden invocarla taller_owner y super_admin.
 * El usuario objetivo debe pertenecer al mismo workshop_id del llamante.
 * No permite auto-eliminación ni eliminar al propietario del taller (salvo super_admin).
 *
 * Recibe: POST { userId: string }
 * Devuelve: { ok: true } o { error: string }
 *
 * Deploy:
 *   supabase functions deploy delete-workshop-user --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    // Verificar sesión del llamante
    const { data: { user: caller }, error: sessionError } = await callerClient.auth.getUser();
    if (sessionError || !caller) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Leer perfil del llamante
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, workshop_id')
      .eq('id', caller.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(JSON.stringify({ error: 'No se pudo verificar el perfil del llamante' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!['taller_owner', 'super_admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'No autorizado para eliminar usuarios' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Falta userId' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // No permitir auto-eliminación
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: 'No puedes eliminarte a ti mismo' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Verificar que el objetivo pertenece al mismo taller
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('workshop_id, role')
      .eq('id', userId)
      .single();

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (targetProfile.workshop_id !== callerProfile.workshop_id) {
      return new Response(JSON.stringify({ error: 'No autorizado: el usuario no pertenece a tu taller' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // taller_owner no puede eliminar a otro taller_owner
    if (targetProfile.role === 'taller_owner' && callerProfile.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'No puedes eliminar al propietario del taller' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Eliminar perfil primero (evita FK issues si no hay cascade)
    await adminClient.from('profiles').delete().eq('id', userId);

    // Eliminar usuario de Auth
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      return new Response(JSON.stringify({ error: `Error al eliminar: ${deleteError.message}` }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
