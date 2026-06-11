-- ============================================================
-- EXPANSÃO V4: E-MAILS INSTITUCIONAIS PARA COLEGIADOS E INSTÂNCIAS
-- ============================================================
-- Este script adiciona o campo 'email' nas tabelas colegiados e instancias,
-- permitindo vincular a conta institucional ao colegiado para fins de
-- login e validação do Primeiro Acesso Seguro via SIAPE.
-- ============================================================

-- 1. Adicionar coluna email na tabela colegiados
ALTER TABLE colegiados 
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- 2. Adicionar coluna email na tabela instancias
ALTER TABLE instancias 
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- 3. Permitir leitura anônima na tabela servidores para validação do SIAPE no Primeiro Acesso
DROP POLICY IF EXISTS "Leitura anon servidores" ON servidores;
CREATE POLICY "Leitura anon servidores" ON servidores FOR SELECT TO anon USING (true);

-- FIM DA EXPANSÃO V4
