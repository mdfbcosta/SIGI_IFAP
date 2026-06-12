-- ============================================================
-- EXPANSÃO V6: TABELA DE CONFIGURAÇÕES DO SISTEMA (PERMISSÕES)
-- ============================================================

CREATE TABLE IF NOT EXISTS sistema_config (
    id TEXT PRIMARY KEY,
    valor JSONB NOT NULL
);

ALTER TABLE sistema_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura anon config" ON sistema_config;
CREATE POLICY "Leitura anon config" ON sistema_config FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Atualizacao anon config" ON sistema_config;
CREATE POLICY "Atualizacao anon config" ON sistema_config FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "Insercao anon config" ON sistema_config;
CREATE POLICY "Insercao anon config" ON sistema_config FOR INSERT TO anon WITH CHECK (true);

-- Inserir permissões padrão iniciais
INSERT INTO sistema_config (id, valor) VALUES (
    'permissoes_modulos',
    '{
        "MOD_1": ["ESTAGIARIO", "DIR_GERAL", "SUPER_ADMIN"],
        "MOD_2": ["ESTAGIARIO", "DIR_GERAL", "SUPER_ADMIN"],
        "MOD_3": ["ESTAGIARIO", "DIR_GERAL", "SUPER_ADMIN", "COPED"],
        "MOD_4": ["ESTAGIARIO", "DIR_GERAL", "SUPER_ADMIN"],
        "MOD_5": ["FISCAL", "DIR_GERAL", "ESTAGIARIO", "SUPER_ADMIN"],
        "MOD_6": ["COORD_COLEGIADO", "DIR_GERAL", "ESTAGIARIO", "SUPER_ADMIN"],
        "MOD_7": ["COORD_COLEGIADO", "COGEN", "DEN", "DIR_GERAL", "ESTAGIARIO", "COPED", "SUPER_ADMIN"],
        "MOD_8": ["DIR_GERAL", "DEN", "COGEN", "ESTAGIARIO", "SUPER_ADMIN"],
        "MOD_CONFIG": ["DIR_GERAL", "ESTAGIARIO", "SUPER_ADMIN"],
        "MOD_COPED": ["COPED", "SUPER_ADMIN"],
        "MOD_SERVIDOR": ["SERVIDOR", "COORD_COLEGIADO", "COPED", "COGEN", "DEN", "DIR_GERAL", "DIR_ENSINO", "FISCAL", "ESTAGIARIO", "SUPER_ADMIN"],
        "MOD_SUPER": ["SUPER_ADMIN"]
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;
