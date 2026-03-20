# TallerLive – contexto para depuración

## Arquitectura

- App en React (App.tsx centraliza toda la lógica)
- Supabase:
  - Base de datos (orders, order_media)
  - Storage (fotos y audios)

## Estructura de datos

### orders
- id
- status
- description
- created_at

### order_media
- id
- order_id
- media_type (photo/audio)
- file_url
- created_at

## Flujo real

1. Se crea una orden
2. Se sube foto/audio a Supabase Storage
3. Se guarda registro en order_media
4. La app debería leer datos desde Supabase
5. Tras refrescar, los datos desaparecen en la UI

## Lo que está verificado

- Supabase funciona
- La subida funciona
- Los datos existen en base de datos
- El problema NO está en backend

## Problema

Tras refrescar:
- La UI pierde fotos/audios
- Pero siguen en Supabase

## Hipótesis

- localStorage sobrescribe datos correctos
- useEffect o lógica de carga pisa el estado

## Importante

- Toda la lógica está en App.tsx
- No hay servicios externos
- El problema es de estado en React
