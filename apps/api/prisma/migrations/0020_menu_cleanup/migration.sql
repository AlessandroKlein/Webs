-- Retira del menú de administración los ítems de las vistas eliminadas
-- (/admin/content y /admin/editor, que ahora redirigen a /admin/pages).
-- Idempotente: si ya no existen, no cambia nada.
UPDATE "menus"
SET "items" = COALESCE(
  (
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM jsonb_array_elements("items") WITH ORDINALITY AS t(elem, ord)
    WHERE elem->>'path' NOT IN ('/admin/content', '/admin/editor')
  ),
  '[]'::jsonb
)
WHERE "key" = 'admin';
