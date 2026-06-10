-- ============================================================
-- SCHEMA EXPANSÃO V3: CRUD Completo Administrativo
-- ============================================================

-- 1. COLEGIADOS
-- Adicionando coluna para armazenar as modalidades suportadas pelo colegiado.
-- Adicionando coluna de status para permitir INATIVAR sem deletar.
ALTER TABLE colegiados 
ADD COLUMN IF NOT EXISTS modalidades JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'));

-- 2. CURSOS
-- Adicionando sigla (abreviação) e status.
ALTER TABLE cursos 
ADD COLUMN IF NOT EXISTS sigla TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'));

-- 3. TURMAS (Nova Tabela)
-- As turmas ficam dentro de um curso e herdam/limitam-se à modalidade.
CREATE TABLE IF NOT EXISTS turmas (
    id BIGSERIAL PRIMARY KEY,
    curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    modalidade TEXT NOT NULL CHECK (modalidade IN ('Ensino Médio Integrado', 'PROEJA', 'Subsequente', 'Superior', 'FIC')),
    status TEXT DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'INATIVA', 'FORMADA')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. OUTRAS INSTÂNCIAS
-- Adicionando status para não precisar excluir.
ALTER TABLE instancias 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'));

-- 5. DISCIPLINAS
-- Adicionando código da disciplina e status.
ALTER TABLE disciplinas 
ADD COLUMN IF NOT EXISTS codigo TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'));

-- 6. SERVIDORES
-- Adicionando status para inativar servidores desligados/afastados.
ALTER TABLE servidores
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'));

-- 7. RLS PARA TURMAS
-- Permitir leitura e escrita para usuários autenticados na tabela turmas
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura autenticada" ON turmas;
CREATE POLICY "Leitura autenticada" ON turmas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Escrita autenticada" ON turmas;
CREATE POLICY "Escrita autenticada" ON turmas FOR ALL TO authenticated USING (true) WITH CHECK (true);
