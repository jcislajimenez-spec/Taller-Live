/**
 * create-workshop-user — Supabase Edge Function
 * ================================================
 * Crea un usuario nuevo en Auth y su fila en profiles,
 * ligado al workshop_id del owner llamante.
 *
 * Recibe: POST { email: string, password: string, role: 'taller_admin' | 'employee' }
 * Devuelve: { id: string } o { error: string }
 *
 * Deploy:
 *   supabase functions deploy create-workshop-user
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ROLES = ['taller_admin', 'employee'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Cliente con service_role para operaciones de admin
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Cliente con el JWT del llamante para verificar su identidad
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

    // Leer rol y workshop_id del llamante desde profiles
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
      return new Response(JSON.stringify({ error: 'No autorizado para crear usuarios' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Leer y validar body
    const body = await req.json();
    const { email, password, role } = body;

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios: email, password, role' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Rol no permitido. Solo taller_admin o employee.' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // El workshop_id viene del backend, nunca del cliente
    const workshopId = callerProfile.workshop_id;

    // Crear usuario en Auth
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // confirmar automáticamente sin email
    });

    if (createError) {
      const msg = createError.message.toLowerCase().includes('already')
        ? 'Este email ya está registrado'
        : `Error al crear el usuario: ${createError.message}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Crear perfil
    const { error: insertError } = await adminClient
      .from('profiles')
      .insert({ id: newUser.user.id, workshop_id: workshopId, role });

    if (insertError) {
      // Revertir: eliminar usuario de Auth para no dejar estado roto
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: 'Error al configurar el perfil del usuario. Inténtalo de nuevo.' }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ id: newUser.user.id }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
