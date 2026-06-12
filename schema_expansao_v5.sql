-- ============================================================
-- SCHEMA EXPANSÃO V5: Campos Adicionais
-- ============================================================

-- Adicionando a coluna de telefone na tabela de servidores
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS telefone TEXT;
