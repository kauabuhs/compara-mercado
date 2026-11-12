-- 0008 · Status de publicação: adiciona 'draft' (rascunho) a record_status
--
-- Em arquivo próprio porque um valor novo de enum só pode ser USADO depois do commit da
-- transação que o criou. Nada existente muda: as políticas de leitura pública continuam
-- filtrando `status = 'active'`, então rascunho nunca aparece para o público.

alter type public.record_status add value if not exists 'draft' before 'active';
