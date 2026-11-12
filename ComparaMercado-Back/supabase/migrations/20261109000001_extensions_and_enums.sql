-- 0001 · Extensões e tipos enumerados
-- Extensões ficam no schema `extensions` (padrão do Supabase). Sempre qualificar os tipos.

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists postgis   with schema extensions;  -- geografia, distância
create extension if not exists pg_trgm   with schema extensions;  -- busca tolerante a erro de digitação
create extension if not exists unaccent  with schema extensions;  -- busca sem acento
create extension if not exists vector    with schema extensions;  -- embeddings (usado na Fase 2)

create type public.user_role          as enum ('user', 'contributor', 'admin');
create type public.base_unit          as enum ('kg', 'l', 'un');
create type public.size_unit          as enum ('g', 'kg', 'ml', 'l', 'un');
create type public.store_status       as enum ('pending', 'active', 'inactive');
create type public.record_status      as enum ('active', 'archived');
create type public.alias_status       as enum ('pending', 'approved', 'rejected');
create type public.observation_source as enum ('manual', 'flyer', 'label_photo', 'receipt', 'store_panel');
create type public.observation_status as enum ('pending', 'approved', 'rejected', 'superseded');
create type public.source_kind        as enum ('flyer', 'label', 'receipt');
create type public.source_status      as enum ('uploaded', 'processing', 'extracted', 'failed', 'reviewed');
create type public.review_target      as enum ('price_observation', 'product_alias', 'source');
create type public.review_status      as enum ('open', 'in_progress', 'resolved', 'dismissed');
