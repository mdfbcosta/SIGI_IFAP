-- ============================================================
-- LIBERAÇÃO DE RLS PARA O PRIMEIRO ACESSO
-- ============================================================
-- O fluxo de "Primeiro Acesso" precisa que o usuário anônimo 
-- possa criar o seu próprio registro na tabela de usuários 
-- ANTES de estar logado.

-- 1. Permite inserção de novos usuários (apenas para contas PESSOAIS de SERVIDOR)
DROP POLICY IF EXISTS "Insercao anon usuarios" ON usuarios;
CREATE POLICY "Insercao anon usuarios" ON usuarios FOR INSERT TO anon WITH CHECK (
    tipo_conta = 'PESSOAL' AND perfil = 'SERVIDOR'
);

-- 2. Permite atualização do servidor_id pelo usuário anônimo (caso a conta já exista mas falte o vínculo)
-- Nota: limitamos para segurança, exigindo que o perfil seja 'SERVIDOR'
DROP POLICY IF EXISTS "Atualizacao anon usuarios" ON usuarios;
CREATE POLICY "Atualizacao anon usuarios" ON usuarios FOR UPDATE TO anon USING (
    tipo_conta = 'PESSOAL' AND perfil = 'SERVIDOR'
);

-- Dica: Execute este script no SQL Editor do Supabase!
