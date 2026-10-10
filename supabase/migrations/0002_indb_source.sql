-- Adds "indb" (Indian Nutrient Databank) as a food source.
-- Run this on its own first, then run supabase/seed/indb_foods.sql in a NEW query.
-- (Postgres can't use a new enum value in the same transaction that adds it.)

alter type public.food_source add value if not exists 'indb';
