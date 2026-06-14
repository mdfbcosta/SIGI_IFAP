-- ============================================================
-- SCHEMA: Sistema de Presença Docente IFAP
-- Banco: Supabase (PostgreSQL)
-- Criado em: Junho 2026
-- ============================================================

-- ============================================================
-- 1. TABELAS ESTRUTURAIS (Cadastros)
-- ============================================================

-- 1.1 Instâncias Administrativas (Direções, Departamentos)
CREATE TABLE IF NOT EXISTS instancias (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    responsavel_id BIGINT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Colegiados
CREATE TABLE IF NOT EXISTS colegiados (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    sigla TEXT NOT NULL,
    coordenador_id BIGINT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Cursos Cadastrados
CREATE TABLE IF NOT EXISTS cursos (
    id BIGSERIAL PRIMARY KEY,
    modalidade TEXT NOT NULL,
    nome TEXT NOT NULL,
    vinculo TEXT NOT NULL CHECK (vinculo IN ('Colegiado', 'DEPPI', 'Instância')),
    vinculo_id BIGINT DEFAULT NULL,
    responsavel_id BIGINT DEFAULT NULL,
    turno TEXT DEFAULT 'Integral',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Disciplinas
CREATE TABLE IF NOT EXISTS disciplinas (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    nucleo TEXT DEFAULT 'Núcleo Básico',
    criador_colegiado_id BIGINT DEFAULT NULL REFERENCES colegiados(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relação N:N entre disciplinas e cursos
CREATE TABLE IF NOT EXISTS disciplinas_cursos (
    id BIGSERIAL PRIMARY KEY,
    disciplina_id BIGINT NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    UNIQUE(disciplina_id, curso_id)
);

-- 1.5 Servidores (Docentes e Técnicos)
CREATE TABLE IF NOT EXISTS servidores (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('Docente', 'Técnico Administrativo')),
    siape TEXT UNIQUE,
    email TEXT,
    vinculo TEXT NOT NULL CHECK (vinculo IN ('Colegiado', 'Instância')),
    vinculo_id BIGINT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relação N:N entre servidores e disciplinas
CREATE TABLE IF NOT EXISTS servidores_disciplinas (
    id BIGSERIAL PRIMARY KEY,
    servidor_id BIGINT NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
    disciplina_id BIGINT NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    UNIQUE(servidor_id, disciplina_id)
);

-- 1.6 Salas (para ronda)
CREATE TABLE IF NOT EXISTS salas (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    curso TEXT NOT NULL,
    ano TEXT NOT NULL,
    professor_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    turno TEXT DEFAULT 'Manhã',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. TABELAS DE CONFIGURAÇÃO
-- ============================================================

-- 2.1 Templates de Horário (Manhã, Tarde, Noite)
CREATE TABLE IF NOT EXISTS templates_horario (
    id TEXT PRIMARY KEY, -- 'T_MANHA', 'T_TARDE', 'T_NOITE'
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Slots de cada template
CREATE TABLE IF NOT EXISTS template_slots (
    id BIGSERIAL PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates_horario(id) ON DELETE CASCADE,
    idx INT NOT NULL, -- -1 para intervalo
    horario TEXT NOT NULL,
    UNIQUE(template_id, idx)
);

-- 2.3 Etapas Avaliativas
CREATE TABLE IF NOT EXISTS etapas_avaliativas (
    id BIGSERIAL PRIMARY KEY,
    etapa INT NOT NULL UNIQUE,
    inicio DATE DEFAULT NULL,
    fim DATE DEFAULT NULL
);

-- 2.4 Grades Semanais
CREATE TABLE IF NOT EXISTS grades_semanais (
    id BIGSERIAL PRIMARY KEY,
    curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'REG' CHECK (tipo IN ('REG', 'PROV')),
    dia_semana TEXT NOT NULL CHECK (dia_semana IN ('Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado')),
    slot_idx INT NOT NULL,
    disciplina_id BIGINT REFERENCES disciplinas(id) ON DELETE SET NULL,
    professor_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(curso_id, tipo, dia_semana, slot_idx)
);

-- ============================================================
-- 3. TABELAS OPERACIONAIS (Ronda e Presença)
-- ============================================================

-- 3.1 Registros de Presença (cada marcação do fiscal)
CREATE TABLE IF NOT EXISTS presencas (
    id BIGSERIAL PRIMARY KEY,
    sala_id BIGINT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    turno TEXT NOT NULL,
    slot_idx INT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('presente', 'ausente_sem', 'ausente_com', 'ausente_justificado')),
    substituto_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    fiscal_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    professor_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sala_id, data, turno, slot_idx)
);

-- 3.2 Rondas Finalizadas (consolidações)
CREATE TABLE IF NOT EXISTS rondas_finalizadas (
    id BIGSERIAL PRIMARY KEY,
    data DATE NOT NULL,
    turno TEXT NOT NULL,
    slot_idx INT NOT NULL,
    fiscal_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    fiscal_nome TEXT,
    finalizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(data, turno, slot_idx)
);

-- 3.3 Antecipações (Permutas e Substituições programadas)
CREATE TABLE IF NOT EXISTS antecipacoes (
    id BIGSERIAL PRIMARY KEY,
    professor_id BIGINT NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    turno TEXT NOT NULL,
    slot_idx INT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('CHEFIA_CIENTE', 'SUBSTITUICAO')),
    substituto_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    motivo TEXT,
    registrado_por BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(professor_id, data, turno, slot_idx)
);

-- 3.4 Pendências de Coordenação (notificações de ausência)
CREATE TABLE IF NOT EXISTS pendencias_coordenacao (
    id TEXT PRIMARY KEY, -- ID gerado pelo app
    data DATE NOT NULL,
    turno TEXT NOT NULL,
    slot_idx INT NOT NULL,
    professor_id BIGINT NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
    sala_id BIGINT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'justificado', 'confirmado')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.5 Correções de Presença (quando o coordenador altera o status)
CREATE TABLE IF NOT EXISTS correcoes_presenca (
    id BIGSERIAL PRIMARY KEY,
    professor_id BIGINT NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    status_original TEXT NOT NULL,
    status_corrigido TEXT NOT NULL,
    justificativa TEXT,
    coordenador_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. TABELAS DE AUTENTICAÇÃO E AUDITORIA
-- ============================================================

-- 4.1 Usuários do Sistema (vinculados ao Supabase Auth)
CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    auth_id UUID UNIQUE, -- Vincula ao Supabase Auth (auth.users.id)
    servidor_id BIGINT REFERENCES servidores(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    perfil TEXT NOT NULL CHECK (perfil IN (
        'FISCAL', 'COORD_COLEGIADO', 'COORD_GERAL', 
        'DIR_ENSINO', 'DIR_GERAL', 'ESTAGIARIO'
    )),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 Logs de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nome TEXT,
    acao TEXT NOT NULL,
    detalhes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. ÍNDICES PARA PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_presencas_data ON presencas(data);
CREATE INDEX IF NOT EXISTS idx_presencas_turno ON presencas(data, turno);
CREATE INDEX IF NOT EXISTS idx_presencas_professor ON presencas(professor_id, data);
CREATE INDEX IF NOT EXISTS idx_rondas_data ON rondas_finalizadas(data, turno);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pendencias_professor ON pendencias_coordenacao(professor_id);
CREATE INDEX IF NOT EXISTS idx_grades_curso ON grades_semanais(curso_id, tipo, dia_semana);
CREATE INDEX IF NOT EXISTS idx_servidores_vinculo ON servidores(vinculo, vinculo_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);
CREATE INDEX IF NOT EXISTS idx_usuarios_auth ON usuarios(auth_id);

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE instancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE colegiados ENABLE ROW LEVEL SECURITY;
ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas_cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE servidores_disciplinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_horario ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapas_avaliativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades_semanais ENABLE ROW LEVEL SECURITY;
ALTER TABLE presencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rondas_finalizadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE antecipacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendencias_coordenacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE correcoes_presenca ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas: Leitura pública para tabelas de cadastro (usuários autenticados)
DROP POLICY IF EXISTS "Leitura autenticada" ON instancias;
CREATE POLICY "Leitura autenticada" ON instancias FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON colegiados;
CREATE POLICY "Leitura autenticada" ON colegiados FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON cursos;
CREATE POLICY "Leitura autenticada" ON cursos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON disciplinas;
CREATE POLICY "Leitura autenticada" ON disciplinas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON disciplinas_cursos;
CREATE POLICY "Leitura autenticada" ON disciplinas_cursos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON servidores;
CREATE POLICY "Leitura autenticada" ON servidores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON servidores_disciplinas;
CREATE POLICY "Leitura autenticada" ON servidores_disciplinas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON salas;
CREATE POLICY "Leitura autenticada" ON salas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON templates_horario;
CREATE POLICY "Leitura autenticada" ON templates_horario FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON template_slots;
CREATE POLICY "Leitura autenticada" ON template_slots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON etapas_avaliativas;
CREATE POLICY "Leitura autenticada" ON etapas_avaliativas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON grades_semanais;
CREATE POLICY "Leitura autenticada" ON grades_semanais FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON presencas;
CREATE POLICY "Leitura autenticada" ON presencas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON rondas_finalizadas;
CREATE POLICY "Leitura autenticada" ON rondas_finalizadas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON antecipacoes;
CREATE POLICY "Leitura autenticada" ON antecipacoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON pendencias_coordenacao;
CREATE POLICY "Leitura autenticada" ON pendencias_coordenacao FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON correcoes_presenca;
CREATE POLICY "Leitura autenticada" ON correcoes_presenca FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON audit_logs;
CREATE POLICY "Leitura autenticada" ON audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada" ON usuarios;
CREATE POLICY "Leitura autenticada" ON usuarios FOR SELECT TO authenticated USING (true);

-- Políticas: Escrita — Apenas para leitura anônima por enquanto (para facilitar dev)
-- Em produção, restringir INSERT/UPDATE/DELETE por perfil
DROP POLICY IF EXISTS "Escrita autenticada" ON instancias;
CREATE POLICY "Escrita autenticada" ON instancias FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON colegiados;
CREATE POLICY "Escrita autenticada" ON colegiados FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON cursos;
CREATE POLICY "Escrita autenticada" ON cursos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON disciplinas;
CREATE POLICY "Escrita autenticada" ON disciplinas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON disciplinas_cursos;
CREATE POLICY "Escrita autenticada" ON disciplinas_cursos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON servidores;
CREATE POLICY "Escrita autenticada" ON servidores FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON servidores_disciplinas;
CREATE POLICY "Escrita autenticada" ON servidores_disciplinas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON salas;
CREATE POLICY "Escrita autenticada" ON salas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON templates_horario;
CREATE POLICY "Escrita autenticada" ON templates_horario FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON template_slots;
CREATE POLICY "Escrita autenticada" ON template_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON etapas_avaliativas;
CREATE POLICY "Escrita autenticada" ON etapas_avaliativas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON grades_semanais;
CREATE POLICY "Escrita autenticada" ON grades_semanais FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON presencas;
CREATE POLICY "Escrita autenticada" ON presencas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON rondas_finalizadas;
CREATE POLICY "Escrita autenticada" ON rondas_finalizadas FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON antecipacoes;
CREATE POLICY "Escrita autenticada" ON antecipacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON pendencias_coordenacao;
CREATE POLICY "Escrita autenticada" ON pendencias_coordenacao FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON correcoes_presenca;
CREATE POLICY "Escrita autenticada" ON correcoes_presenca FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON audit_logs;
CREATE POLICY "Escrita autenticada" ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Escrita autenticada" ON usuarios;
CREATE POLICY "Escrita autenticada" ON usuarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Política especial: Permitir leitura anônima para o login funcionar
DROP POLICY IF EXISTS "Leitura anon usuarios" ON usuarios;
CREATE POLICY "Leitura anon usuarios" ON usuarios FOR SELECT TO anon USING (true);

-- ============================================================
-- 7. SEED DATA (Dados iniciais — correspondem aos mocks atuais)
-- ============================================================

-- Instâncias Administrativas
INSERT INTO instancias (id, nome, responsavel_id) VALUES
    (1, 'Direção Geral', NULL),
    (2, 'Direção de Ensino (DEN)', NULL),
    (3, 'DEAP', NULL),
    (4, 'DEPPI', NULL),
    (5, 'Coordenação Pedagógica', NULL),
    (6, 'Coordenação Geral de Ensino', NULL)
ON CONFLICT (id) DO NOTHING;

-- Colegiados
INSERT INTO colegiados (id, nome, sigla, coordenador_id) VALUES
    (1, 'Colegiado de Agropecuária', 'C-AGRO', 1),
    (2, 'Colegiado de Informática', 'C-INFO', NULL),
    (3, 'Colegiado de Biologia', 'C-BIO', 3)
ON CONFLICT (id) DO NOTHING;

-- Servidores (Docentes e Técnicos)
INSERT INTO servidores (id, nome, tipo, siape, email, vinculo, vinculo_id) VALUES
    (1, 'Marcus Danilo', 'Docente', '123456', 'marcus@ifap.edu.br', 'Colegiado', 1),
    (2, 'Fulano Silva', 'Docente', '223456', 'fulano@ifap.edu.br', 'Colegiado', 2),
    (3, 'Ciclano Costa', 'Docente', '323456', 'ciclano@ifap.edu.br', 'Colegiado', 3),
    (4, 'João Técnico', 'Técnico Administrativo', '423456', 'joao@ifap.edu.br', 'Instância', 4),
    (5, 'Beltrano', 'Docente', '523456', 'beltrano@ifap.edu.br', 'Colegiado', 1),
    (6, 'Afrânio', 'Docente', '623456', 'afranio@ifap.edu.br', 'Colegiado', 1)
ON CONFLICT (id) DO NOTHING;

-- Cursos
INSERT INTO cursos (id, modalidade, nome, vinculo, vinculo_id, responsavel_id, turno) VALUES
    (1, 'Técnico Integrado', 'Técnico em Agropecuária', 'Colegiado', 1, NULL, 'Integral'),
    (2, 'FIC', 'Operador de Computador', 'DEPPI', NULL, 2, 'Noite'),
    (3, 'Pós-Graduação Lato Sensu (Especialização)', 'Especialização em Educação', 'DEPPI', NULL, 4, 'Noite')
ON CONFLICT (id) DO NOTHING;

-- Disciplinas
INSERT INTO disciplinas (id, nome, nucleo) VALUES
    (1, 'Matemática Básica', 'Núcleo Básico'),
    (2, 'Introdução à Programação', 'Núcleo Específico'),
    (3, 'Biologia Celular', 'Núcleo Básico')
ON CONFLICT (id) DO NOTHING;

-- Relação disciplinas <-> cursos
INSERT INTO disciplinas_cursos (disciplina_id, curso_id) VALUES
    (1, 1),
    (2, 2),
    (3, 1)
ON CONFLICT (disciplina_id, curso_id) DO NOTHING;

-- Relação servidores <-> disciplinas
INSERT INTO servidores_disciplinas (servidor_id, disciplina_id) VALUES
    (1, 1), (1, 2),
    (3, 3),
    (5, 1),
    (6, 2)
ON CONFLICT (servidor_id, disciplina_id) DO NOTHING;

-- Salas
INSERT INTO salas (id, nome, curso, ano, professor_id, turno) VALUES
    (1, 'Sala 1', 'Téc. Agropecuária', '1º ano', 1, 'Manhã'),
    (2, 'Sala 2', 'Téc. Agropecuária', '2º ano', 4, 'Manhã'),
    (3, 'Sala 3', 'Téc. Informática', '1º ano', 2, 'Manhã'),
    (4, 'Sala 4', 'Téc. Alimentos', '3º ano', 3, 'Manhã')
ON CONFLICT (id) DO NOTHING;

-- Templates de Horário
INSERT INTO templates_horario (id, nome) VALUES
    ('T_MANHA', 'Manhã (Padrão)'),
    ('T_TARDE', 'Tarde (Padrão)'),
    ('T_NOITE', 'Noite (Padrão)')
ON CONFLICT (id) DO NOTHING;

-- Slots de cada template
INSERT INTO template_slots (template_id, idx, horario) VALUES
    ('T_MANHA', 0, '07:30 - 08:20'),
    ('T_MANHA', 1, '08:20 - 09:10'),
    ('T_MANHA', 2, '09:10 - 10:00'),
    ('T_MANHA', -1, '10:00 - 10:20 (Intervalo)'),
    ('T_MANHA', 3, '10:20 - 11:10'),
    ('T_MANHA', 4, '11:10 - 12:00'),
    ('T_TARDE', 0, '13:30 - 14:20'),
    ('T_TARDE', 1, '14:20 - 15:10'),
    ('T_TARDE', 2, '15:10 - 16:00'),
    ('T_TARDE', -1, '16:00 - 16:20 (Intervalo)'),
    ('T_TARDE', 3, '16:20 - 17:10'),
    ('T_TARDE', 4, '17:10 - 18:00'),
    ('T_NOITE', 0, '18:50 - 19:40'),
    ('T_NOITE', 1, '19:40 - 20:30'),
    ('T_NOITE', 2, '20:30 - 21:20'),
    ('T_NOITE', 3, '21:20 - 22:10')
ON CONFLICT (template_id, idx) DO NOTHING;

-- Etapas Avaliativas
INSERT INTO etapas_avaliativas (etapa, inicio, fim) VALUES
    (1, NULL, NULL),
    (2, NULL, NULL),
    (3, NULL, NULL),
    (4, NULL, NULL)
ON CONFLICT (etapa) DO NOTHING;

-- Grades Semanais (dados pré-preenchidos do mock)
INSERT INTO grades_semanais (curso_id, tipo, dia_semana, slot_idx, disciplina_id, professor_id) VALUES
    (1, 'REG', 'Segunda', 0, 1, 1),
    (1, 'REG', 'Segunda', 1, 1, 1),
    (1, 'REG', 'Segunda', 2, 3, 3),
    (1, 'REG', 'Segunda', 3, 3, 3),
    (1, 'REG', 'Segunda', 4, 3, 3),
    (1, 'REG', 'Terça', 0, 3, 3),
    (1, 'REG', 'Terça', 1, 3, 3),
    (1, 'REG', 'Terça', 2, 1, 5),
    (1, 'REG', 'Terça', 3, 1, 5),
    (1, 'REG', 'Quarta', 0, 1, 1),
    (1, 'REG', 'Quarta', 1, 1, 1),
    (2, 'REG', 'Quinta', 0, 2, 1),
    (3, 'REG', 'Quinta', 0, 2, 1)
ON CONFLICT (curso_id, tipo, dia_semana, slot_idx) DO NOTHING;

-- Usuários do Sistema (serão vinculados ao Supabase Auth após criar os logins)
INSERT INTO usuarios (id, nome, email, perfil, servidor_id) VALUES
    (1, 'Angela (Fiscal)', 'angela@ifap.edu.br', 'FISCAL', NULL),
    (2, 'Alexandre (Fiscal)', 'alexandre@ifap.edu.br', 'FISCAL', NULL),
    (3, 'Josy (Fiscal)', 'josy@ifap.edu.br', 'FISCAL', NULL),
    (4, 'Marcus Danilo', 'marcus@ifap.edu.br', 'COORD_COLEGIADO', 1),
    (5, 'Ciclano Costa', 'ciclano@ifap.edu.br', 'COORD_COLEGIADO', 3),
    (6, 'Admin Estagiário', 'estagiario@ifap.edu.br', 'ESTAGIARIO', NULL),
    (7, 'Diretor Geral', 'diretor@ifap.edu.br', 'DIR_GERAL', NULL),
    (8, 'Diretor de Ensino', 'den@ifap.edu.br', 'DIR_ENSINO', NULL)
ON CONFLICT (id) DO NOTHING;

-- Logs de Auditoria (seed inicial)
INSERT INTO audit_logs (usuario_nome, acao, detalhes) VALUES
    ('Fiscal de Sala (Estevão)', 'Registro de Ronda', 'Marcou Prof. Marcus Danilo como Ausente na Sala 1 - Técnico em Agropecuária (1º Horário, Manhã)'),
    ('Coordenador (Marcus Danilo)', 'Permuta Prevista', 'Definiu Prof. Afrânio como substituto de Prof. Marcus Danilo na disciplina Introdução à Programação para a data 04/06/2026 no Turno Tarde'),
    ('Estagiário (Admin)', 'Configuração RBAC', 'Alterou permissões do módulo Ronda Diária de Presença para perfil Coordenador de Colegiado');

-- Resetar sequences para evitar conflitos com IDs futuros
SELECT setval('instancias_id_seq', (SELECT MAX(id) FROM instancias));
SELECT setval('colegiados_id_seq', (SELECT MAX(id) FROM colegiados));
SELECT setval('servidores_id_seq', (SELECT MAX(id) FROM servidores));
SELECT setval('cursos_id_seq', (SELECT MAX(id) FROM cursos));
SELECT setval('disciplinas_id_seq', (SELECT MAX(id) FROM disciplinas));
SELECT setval('salas_id_seq', (SELECT MAX(id) FROM salas));
SELECT setval('usuarios_id_seq', (SELECT MAX(id) FROM usuarios));
