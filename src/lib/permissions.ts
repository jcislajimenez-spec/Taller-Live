// ---------------------------------------------------------------------------
// TallerLive — Sistema de permisos
// Rol almacenado en profiles.role (Supabase)
// Para añadir roles o acciones: editar PERMISSIONS y ACTIONS únicamente
// ---------------------------------------------------------------------------

export const ACTIONS = {
  CREATE_ORDER:            'create_order',
  EDIT_VEHICLE:            'edit_vehicle',
  UPLOAD_MEDIA:            'upload_media',
  EDIT_DIAGNOSIS:          'edit_diagnosis',
  UPDATE_STATUS:           'update_status',
  GENERATE_BUDGET:         'generate_budget',
  EDIT_BUDGET:             'edit_budget',
  RESEND_BUDGET:           'resend_budget',
  DELETE_ORDER:            'delete_order',
  MANAGE_CLIENTS:          'manage_clients',
  DELETE_CLIENT:           'delete_client',
  DELETE_VEHICLE:          'delete_vehicle',
  VIEW_USERS:              'view_users',
  CREATE_USERS:            'create_users',
  EDIT_USERS:              'edit_users',
  DELETE_USERS:            'delete_users',
  CONFIGURE_NOTIFICATIONS: 'configure_notifications',
  EDIT_WORKSHOP:           'edit_workshop',
  VIEW_METRICS:            'view_metrics',
  VIEW_PRICES:             'view_prices',
  SHARE_LINK:              'share_link',
} as const;

const PERMISSIONS: Record<string, string[]> = {
  employee: [
    'create_order',
    'edit_vehicle',
    'upload_media',
    'edit_diagnosis',
    'update_status',
    'manage_clients',
  ],

  taller_admin: [
    'create_order',
    'edit_vehicle',
    'upload_media',
    'edit_diagnosis',
    'update_status',
    'manage_clients',
    'generate_budget',
    'edit_budget',
    'resend_budget',
    'delete_client',
    'delete_vehicle',
    'view_users',
    'create_users',
    'edit_users',
    'configure_notifications',
    'edit_workshop',
    'view_metrics',
    'view_prices',
    'share_link',
  ],

  taller_owner: [
    'create_order',
    'edit_vehicle',
    'upload_media',
    'edit_diagnosis',
    'update_status',
    'manage_clients',
    'generate_budget',
    'edit_budget',
    'resend_budget',
    'delete_client',
    'delete_vehicle',
    'delete_order',
    'view_users',
    'create_users',
    'edit_users',
    'delete_users',
    'configure_notifications',
    'edit_workshop',
    'view_metrics',
    'view_prices',
    'share_link',
  ],

  super_admin: ['*'],
};

export function can(role: string, action: string): boolean {
  const allowed = PERMISSIONS[role] ?? [];
  return allowed.includes('*') || allowed.includes(action);
}
