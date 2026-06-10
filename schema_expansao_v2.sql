-- ============================================================
-- SCHEMA EXPANSÃO v2 — Sistema de Presença Docente IFAP
-- Execute este script NO SUPABASE SQL EDITOR
-- Data: Junho 2026
-- ============================================================
-- IMPORTANTE: Execute na ordem. Pode rodar múltiplas vezes
--             com segurança (usa IF NOT EXISTS / ON CONFLICT).
-- ============================================================


-- ============================================================
-- PARTE 1: ALTERAR TABELA usuarios
-- Adiciona novos campos e atualiza o CHECK de perfis
-- ============================================================

-- 1.1 Novos campos
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS tipo_conta TEXT NOT NULL DEFAULT 'PESSOAL'
        CHECK (tipo_conta IN ('FUNCIONAL', 'PESSOAL')),
    ADD COLUMN IF NOT EXISTS cargo_institucional TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS siape TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS matricula_academica TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS cadastrado_por BIGINT DEFAULT NULL
        REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Fluxo de aprovação pelo DIR_GERAL
    ADD COLUMN IF NOT EXISTS status_cadastro TEXT NOT NULL DEFAULT 'ATIVO'
        CHECK (status_cadastro IN ('PENDENTE', 'ATIVO', 'REJEITADO')),
    ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS aprovado_por BIGINT DEFAULT NULL
        REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ DEFAULT NULL;

-- Contas funcionais já existentes ficam ATIVO por padrão (já definido acima)
-- Contas PESSOAL criadas via auto-cadastro começarão como PENDENTE (lógica no app)
-- Contas criadas pela COPED (FISCAL/ESTAGIARIO) são criadas como ATIVO direto

-- 1.2 REMOVER o constraint antigo PRIMEIRO (antes de qualquer UPDATE ou ADD)
-- O constraint antigo não inclui 'DEN', 'COGEN', etc., então
-- qualquer UPDATE para esses valores falharia enquanto o constraint existir
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;

-- 1.3 Corrigir dados legados (agora sem constraint bloqueando)
UPDATE usuarios SET perfil = 'DEN'   WHERE perfil = 'DIR_ENSINO';
UPDATE usuarios SET perfil = 'COGEN' WHERE perfil = 'COORD_GERAL';

-- 1.4 Adicionar o novo constraint com todos os perfis atualizados
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check
    CHECK (perfil IN (
        'SUPER_ADMIN',
        'DIR_GERAL',
        'DEN',
        'COGEN',
        'COPED',
        'COORD_COLEGIADO',
        'FISCAL',
        'ESTAGIARIO',
        'SERVIDOR'
    ));

-- 1.4 Índices para SIAPE e status_cadastro
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_siape
    ON usuarios(siape) WHERE siape IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_status_cadastro
    ON usuarios(status_cadastro)
    WHERE status_cadastro = 'PENDENTE';


-- ============================================================
-- PARTE 2: NOVAS TABELAS
-- ============================================================

-- 2.1 Delegações Temporárias (pelo DIR_GERAL)
CREATE TABLE IF NOT EXISTS delegacoes_temporarias (
    id BIGSERIAL PRIMARY KEY,
    delegante_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    delegado_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    acao_delegada TEXT NOT NULL,              -- Ex: 'CRIAR_CARGO', 'REDEFINIR_SENHA'
    senha_provisoria TEXT NOT NULL,           -- Armazena hash bcrypt no app
    data_inicio TIMESTAMPTZ DEFAULT NOW(),
    data_expiracao TIMESTAMPTZ DEFAULT NULL,  -- NULL = sem prazo (revogação manual)
    revogada_em TIMESTAMPTZ DEFAULT NULL,
    revogada_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    usada_em TIMESTAMPTZ DEFAULT NULL,        -- Quando o delegado acessou
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Feedbacks de Suporte Técnico
CREATE TABLE IF NOT EXISTS feedbacks_suporte (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('SUGESTAO', 'ERRO', 'DUVIDA')),
    descricao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOVO'
        CHECK (status IN ('NOVO', 'LIDO', 'EM_ANALISE', 'RESOLVIDO')),
    resposta_interna TEXT DEFAULT NULL,       -- Nota do SUPER_ADMIN (não visível ao usuário)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 Solicitações de Substituição / Troca de Horário
CREATE TABLE IF NOT EXISTS solicitacoes_substituicao (
    id BIGSERIAL PRIMARY KEY,
    solicitante_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    substituto_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    data_falta DATE NOT NULL,
    horarios_json JSONB NOT NULL DEFAULT '[]',  -- Ex: ["07:30 - 08:20", "08:20 - 09:10"]
    tipo TEXT NOT NULL CHECK (tipo IN ('COBERTURA', 'TROCA')),
    -- COBERTURA: substituto cobre os horários do ausente (Lista A)
    -- TROCA: troca recíproca de horários entre os dois (Lista B)
    status TEXT NOT NULL DEFAULT 'RASCUNHO'
        CHECK (status IN ('RASCUNHO', 'AGUARDANDO_CONFIRMACAO', 'FORMALIZADA', 'CANCELADA')),
    documento_suap_url TEXT DEFAULT NULL,       -- URL do doc SUAP anexado
    documento_nome TEXT DEFAULT NULL,           -- Nome do arquivo
    cancelamento_motivo TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Notificações do Sistema
CREATE TABLE IF NOT EXISTS notificacoes (
    id BIGSERIAL PRIMARY KEY,
    destinatario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    -- Tipos: 'TROCA_SOLICITADA', 'TROCA_CONFIRMADA', 'TROCA_CANCELADA',
    --        'DELEGACAO_RECEBIDA', 'FEEDBACK_RESPONDIDO'
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    dados_json JSONB DEFAULT NULL,             -- Dados adicionais (IDs, links, etc.)
    lida BOOLEAN DEFAULT FALSE,
    lida_em TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- PARTE 3: ÍNDICES PARA AS NOVAS TABELAS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_delegacoes_delegante
    ON delegacoes_temporarias(delegante_id);
CREATE INDEX IF NOT EXISTS idx_delegacoes_delegado
    ON delegacoes_temporarias(delegado_id);
CREATE INDEX IF NOT EXISTS idx_delegacoes_ativas
    ON delegacoes_temporarias(revogada_em, data_expiracao)
    WHERE revogada_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_feedbacks_status
    ON feedbacks_suporte(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_usuario
    ON feedbacks_suporte(usuario_id);

CREATE INDEX IF NOT EXISTS idx_substituicoes_solicitante
    ON solicitacoes_substituicao(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_substituicoes_substituto
    ON solicitacoes_substituicao(substituto_id);
CREATE INDEX IF NOT EXISTS idx_substituicoes_data
    ON solicitacoes_substituicao(data_falta);
CREATE INDEX IF NOT EXISTS idx_substituicoes_status
    ON solicitacoes_substituicao(status);

CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario
    ON notificacoes(destinatario_id, lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas
    ON notificacoes(destinatario_id)
    WHERE lida = FALSE;

-- Tipos de notificação previstos (documentação):
-- 'CADASTRO_PENDENTE'      → para DIR_GERAL: novo servidor aguardando aprovação
-- 'CADASTRO_APROVADO'      → para o servidor: cadastro foi aprovado
-- 'CADASTRO_REJEITADO'     → para o servidor: cadastro foi rejeitado (com motivo)
-- 'TROCA_SOLICITADA'       → para o substituto: alguém quer trocar horário
-- 'TROCA_CONFIRMADA'       → para o solicitante + coord. de ambos
-- 'TROCA_CANCELADA'        → para as partes envolvidas
-- 'DELEGACAO_RECEBIDA'     → para o servidor delegado
-- 'DELEGACAO_EXPIRADA'     → aviso automático de prazo


-- ============================================================
-- PARTE 4: RLS PARA AS NOVAS TABELAS
-- ============================================================

ALTER TABLE delegacoes_temporarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks_suporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_substituicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- Delegações: apenas autenticados
DROP POLICY IF EXISTS "Acesso autenticado" ON delegacoes_temporarias;
CREATE POLICY "Acesso autenticado" ON delegacoes_temporarias
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Feedbacks: apenas autenticados
DROP POLICY IF EXISTS "Acesso autenticado" ON feedbacks_suporte;
CREATE POLICY "Acesso autenticado" ON feedbacks_suporte
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Substituições: apenas autenticados
DROP POLICY IF EXISTS "Acesso autenticado" ON solicitacoes_substituicao;
CREATE POLICY "Acesso autenticado" ON solicitacoes_substituicao
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notificações: apenas autenticados
DROP POLICY IF EXISTS "Acesso autenticado" ON notificacoes;
CREATE POLICY "Acesso autenticado" ON notificacoes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- PARTE 5: INSERIR CONTAS FUNCIONAIS NA TABELA usuarios
-- ============================================================
-- ATENÇÃO: auth_id será NULL por enquanto.
-- Após criar cada conta no Supabase Auth (Authentication > Users),
-- você deve vincular o UUID aqui com:
--   UPDATE usuarios SET auth_id = 'UUID_AQUI' WHERE email = 'email@ifap.edu.br';
-- ============================================================

-- Contas funcionais: tipo_conta = FUNCIONAL, status_cadastro = ATIVO (não precisam de aprovação)
INSERT INTO usuarios (nome, email, perfil, tipo_conta, ativo, status_cadastro) VALUES
    -- Direção Geral
    ('Direção Geral do Campus',         'dirgeral.porto@ifap.edu.br',  'DIR_GERAL',        'FUNCIONAL', TRUE, 'ATIVO'),
    -- Departamento de Ensino
    ('Departamento de Ensino (DEN)',     'den.porto@ifap.edu.br',       'DEN',              'FUNCIONAL', TRUE, 'ATIVO'),
    -- Coordenação Geral de Ensino
    ('Coordenação Geral de Ensino',     'cogen.porto@ifap.edu.br',     'COGEN',            'FUNCIONAL', TRUE, 'ATIVO'),
    -- Coordenação Pedagógica
    ('Coordenação Pedagógica (COPED)',  'coped.porto@ifap.edu.br',     'COPED',            'FUNCIONAL', TRUE, 'ATIVO'),
    -- Colegiados Técnicos
    ('Colegiado Téc. Agroecologia',     'agroecologia@ifap.edu.br',    'COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO'),
    ('Colegiado Téc. Agronegócio',      'agronegocio@ifap.edu.br',     'COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO'),
    ('Colegiado Téc. Agropecuária',     'agropecuaria@ifap.edu.br',    'COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO'),
    ('Colegiado Téc. Administração',    'tecnicoadm.porto@ifap.edu.br','COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO'),
    ('Colegiado Téc. Veterinária',      'tecveterinaria@ifap.edu.br',  'COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO'),
    -- Cursos Superiores
    ('Colegiado Eng. Agronômica',       'engagronomica@ifap.edu.br',   'COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO'),
    ('Colegiado Medicina Veterinária',  'medicina.porto@ifap.edu.br',  'COORD_COLEGIADO',  'FUNCIONAL', TRUE, 'ATIVO')
ON CONFLICT (email) DO NOTHING;

-- Garantir que contas pessoais legadas (já existentes) fiquem como ATIVO
-- (foram criadas antes deste fluxo, então já são válidas)
UPDATE usuarios
    SET status_cadastro = 'ATIVO'
    WHERE tipo_conta = 'PESSOAL'
      AND status_cadastro = 'ATIVO'; -- sem alteração, só confirma

-- Resetar sequence de usuários para evitar conflitos
SELECT setval('usuarios_id_seq', (SELECT MAX(id) FROM usuarios));


-- ============================================================
-- PARTE 6: VERIFICAÇÃO FINAL
-- ============================================================
-- Execute estes SELECTs para confirmar:

-- 6.1 Todos os usuários com perfil e status:
-- SELECT id, nome, email, perfil, tipo_conta, status_cadastro, ativo
-- FROM usuarios
-- ORDER BY
--   CASE perfil
--     WHEN 'SUPER_ADMIN'     THEN 1
--     WHEN 'DIR_GERAL'       THEN 2
--     WHEN 'DEN'             THEN 3
--     WHEN 'COGEN'           THEN 4
--     WHEN 'COPED'           THEN 5
--     WHEN 'COORD_COLEGIADO' THEN 6
--     WHEN 'FISCAL'          THEN 7
--     WHEN 'ESTAGIARIO'      THEN 8
--     WHEN 'SERVIDOR'        THEN 9
--   END, nome;

-- 6.2 Novas tabelas criadas:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN (
--   'delegacoes_temporarias', 'feedbacks_suporte',
--   'solicitacoes_substituicao', 'notificacoes'
-- );

-- 6.3 Novos campos em usuarios:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'usuarios'
-- AND column_name IN (
--   'status_cadastro', 'motivo_rejeicao', 'aprovado_por',
--   'aprovado_em', 'siape', 'whatsapp', 'tipo_conta'
-- );
-- ============================================================
