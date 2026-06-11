-- ============================================================
-- SCHEMA EXPANSÃO V4: Fluxo de Transferência de Servidores
-- ============================================================

-- Tabela para armazenar requisições de transferência entre colegiados
CREATE TABLE IF NOT EXISTS transferencias_servidor (
    id BIGSERIAL PRIMARY KEY,
    servidor_id BIGINT NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
    origem_id BIGINT NOT NULL REFERENCES colegiados(id) ON DELETE CASCADE,
    destino_id BIGINT NOT NULL REFERENCES colegiados(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ACEITA', 'RECUSADA')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    data_resolucao TIMESTAMPTZ
);

-- RLS
ALTER TABLE transferencias_servidor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura autenticada" ON transferencias_servidor;
CREATE POLICY "Leitura autenticada" ON transferencias_servidor FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Escrita autenticada" ON transferencias_servidor;
CREATE POLICY "Escrita autenticada" ON transferencias_servidor FOR ALL TO authenticated USING (true) WITH CHECK (true);
