/**
 * supabase-client.js — Sistema de Presença Docente IFAP
 * Inicializa o cliente Supabase e fornece funções CRUD para todas as entidades.
 */

const SUPABASE_URL = 'https://ubdugjepcslhotnugtfz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZHVnamVwY3NsaG90bnVndGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjU2MTksImV4cCI6MjA5NjYwMTYxOX0.dRdZocBmTlwYIf44bizlpWW1YUnv9iqibtd2ePqCXEk';

// Criado via CDN do Supabase JS v2 (carregado no index.html antes deste arquivo)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('[IFAP Presença] Supabase client inicializado.');

// ============================================================
// AUTENTICAÇÃO
// ============================================================

const Auth = {
    async login(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signUp(email, password, nome) {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { nome } }
        });
        if (error) throw error;
        return data;
    },

    async logout() {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    },

    async getCurrentUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },

    async getCurrentSession() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session;
    },

    onAuthStateChange(callback) {
        return supabaseClient.auth.onAuthStateChange(callback);
    },

    async getUserProfile(authId) {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*, servidor:servidores(*)')
            .eq('auth_id', authId)
            .single();
        if (error) throw error;
        return data;
    },

    async getUserProfileByEmail(email) {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*, servidor:servidores(*)')
            .eq('email', email)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }
};

// ============================================================
// CRUD GENÉRICO
// ============================================================

async function fetchAll(table, orderBy = 'id', ascending = true) {
    const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .order(orderBy, { ascending });
    if (error) throw error;
    return data || [];
}

async function fetchById(table, id) {
    const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

async function insertRow(table, row) {
    const { data, error } = await supabaseClient
        .from(table)
        .insert(row)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateRow(table, id, updates) {
    const { data, error } = await supabaseClient
        .from(table)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function deleteRow(table, id) {
    const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ============================================================
// ENTIDADES ESPECÍFICAS
// ============================================================

const DB = {
    // --- Instâncias ---
    instancias: {
        fetchAll: () => fetchAll('instancias'),
        create: (row) => insertRow('instancias', row),
        update: (id, data) => updateRow('instancias', id, data),
        delete: (id) => deleteRow('instancias', id),
    },

    // --- Colegiados ---
    colegiados: {
        fetchAll: () => fetchAll('colegiados'),
        create: (row) => insertRow('colegiados', row),
        update: (id, data) => updateRow('colegiados', id, data),
        delete: (id) => deleteRow('colegiados', id),
    },

    // --- Cursos ---
    cursos: {
        fetchAll: () => fetchAll('cursos'),
        create: (row) => insertRow('cursos', row),
        update: (id, data) => updateRow('cursos', id, data),
        delete: (id) => deleteRow('cursos', id),
    },

    // --- Turmas ---
    turmas: {
        fetchAll: () => fetchAll('turmas'),
        create: (row) => insertRow('turmas', row),
        update: (id, data) => updateRow('turmas', id, data),
        delete: (id) => deleteRow('turmas', id),
        async fetchByCurso(cursoId) {
            const { data, error } = await supabaseClient
                .from('turmas')
                .select('*')
                .eq('curso_id', cursoId)
                .order('nome', { ascending: true });
            if (error) throw error;
            return data || [];
        }
    },

    // --- Disciplinas ---
    disciplinas: {
        fetchAll: () => fetchAll('disciplinas'),
        create: (row) => insertRow('disciplinas', row),
        update: (id, data) => updateRow('disciplinas', id, data),
        delete: (id) => deleteRow('disciplinas', id),
        // Relação com cursos
        async fetchWithCursos(discId) {
            const { data, error } = await supabaseClient
                .from('disciplinas_cursos')
                .select('curso_id')
                .eq('disciplina_id', discId);
            if (error) throw error;
            return (data || []).map(r => r.curso_id);
        },
        async setCursos(discId, cursoIds) {
            // Remove todos os vínculos e recria
            await supabaseClient.from('disciplinas_cursos').delete().eq('disciplina_id', discId);
            if (cursoIds.length > 0) {
                const rows = cursoIds.map(cid => ({ disciplina_id: discId, curso_id: cid }));
                const { error } = await supabaseClient.from('disciplinas_cursos').insert(rows);
                if (error) throw error;
            }
        },
        async linkCurso(discId, cursoId) {
            // Insere relação se não existir (ignora se houver conflito devido a UNIQUE)
            const { error } = await supabaseClient
                .from('disciplinas_cursos')
                .insert({ disciplina_id: discId, curso_id: cursoId });
            if (error && !error.message.includes('duplicate key')) throw error;
        },
        async unlinkCurso(discId, cursoId) {
            const { error } = await supabaseClient
                .from('disciplinas_cursos')
                .delete()
                .eq('disciplina_id', discId)
                .eq('curso_id', cursoId);
            if (error) throw error;
        },
        async copiarVinculosCursos(cursoOrigemId, cursoDestinoId) {
            // 1. Obter todas as disciplinas do curso de origem
            const { data, error } = await supabaseClient
                .from('disciplinas_cursos')
                .select('disciplina_id')
                .eq('curso_id', cursoOrigemId);
            if (error) throw error;
            if (!data || data.length === 0) return;

            // 2. Obter as disciplinas que já estão no curso de destino para evitar duplicar/erro de UNIQUE
            const { data: destData, error: destError } = await supabaseClient
                .from('disciplinas_cursos')
                .select('disciplina_id')
                .eq('curso_id', cursoDestinoId);
            if (destError) throw destError;
            const destIds = new Set((destData || []).map(r => r.disciplina_id));

            // 3. Filtrar apenas as novas disciplinas a serem vinculadas
            const rowsToInsert = data
                .map(r => r.disciplina_id)
                .filter(did => !destIds.has(did))
                .map(did => ({ disciplina_id: did, curso_id: cursoDestinoId }));

            if (rowsToInsert.length > 0) {
                const { error: insertErr } = await supabaseClient
                    .from('disciplinas_cursos')
                    .insert(rowsToInsert);
                if (insertErr) throw insertErr;
            }
        }
    },

    // --- Servidores ---
    servidores: {
        fetchAll: () => fetchAll('servidores'),
        create: (row) => insertRow('servidores', row),
        update: (id, data) => updateRow('servidores', id, data),
        delete: (id) => deleteRow('servidores', id),
        async fetchWithDisciplinas(servId) {
            const { data, error } = await supabaseClient
                .from('servidores_disciplinas')
                .select('disciplina_id')
                .eq('servidor_id', servId);
            if (error) throw error;
            return (data || []).map(r => r.disciplina_id);
        },
        async setDisciplinas(servId, discIds) {
            await supabaseClient.from('servidores_disciplinas').delete().eq('servidor_id', servId);
            if (discIds.length > 0) {
                const rows = discIds.map(did => ({ servidor_id: servId, disciplina_id: did }));
                const { error } = await supabaseClient.from('servidores_disciplinas').insert(rows);
                if (error) throw error;
            }
        }
    },

    // --- Transferências de Servidor ---
    transferencias: {
        fetchAll: () => fetchAll('transferencias_servidor'),
        create: (row) => insertRow('transferencias_servidor', row),
        update: (id, data) => updateRow('transferencias_servidor', id, data),
        delete: (id) => deleteRow('transferencias_servidor', id),
        async responder(id, status, servidorId, novoVinculoId) {
            // se ACEITA, muda tbm o vinculo do servidor
            if (status === 'ACEITA') {
                const { error: errSrv } = await supabaseClient.from('servidores').update({ vinculo: 'Colegiado', vinculo_id: novoVinculoId }).eq('id', servidorId);
                if (errSrv) throw errSrv;
            }
            const { data, error } = await supabaseClient.from('transferencias_servidor').update({ status, data_resolucao: new Date() }).eq('id', id).select();
            if (error) throw error;
            return data[0];
        }
    },

    // --- Salas ---
    salas: {
        fetchAll: () => fetchAll('salas'),
        async fetchByTurno(turno) {
            const { data, error } = await supabaseClient
                .from('salas')
                .select('*')
                .eq('turno', turno)
                .order('id');
            if (error) throw error;
            return data || [];
        },
        create: (row) => insertRow('salas', row),
        update: (id, data) => updateRow('salas', id, data),
        delete: (id) => deleteRow('salas', id),
    },

    // --- Templates de Horário ---
    templates: {
        async fetchAll() {
            const templates = await fetchAll('templates_horario', 'id');
            for (const t of templates) {
                const { data, error } = await supabaseClient
                    .from('template_slots')
                    .select('*')
                    .eq('template_id', t.id)
                    .order('idx');
                if (error) throw error;
                t.slots = (data || []).map(s => ({ idx: s.idx, t: s.horario }));
            }
            return templates;
        }
    },

    // --- Etapas Avaliativas ---
    etapas: {
        fetchAll: () => fetchAll('etapas_avaliativas', 'etapa'),
        update: (id, data) => updateRow('etapas_avaliativas', id, data),
    },

    // --- Grades Semanais ---
    grades: {
        async fetchByCurso(cursoId, tipo) {
            const { data, error } = await supabaseClient
                .from('grades_semanais')
                .select('*')
                .eq('curso_id', cursoId)
                .eq('tipo', tipo || 'REG');
            if (error) throw error;
            // Converter para formato do appState.mod4GridTemp
            const result = {};
            (data || []).forEach(row => {
                const key = `${row.curso_id}_${row.tipo}_${row.dia_semana}_${row.slot_idx}`;
                result[key] = { discId: String(row.disciplina_id), profId: String(row.professor_id) };
            });
            return result;
        },
        async upsert(cursoId, tipo, diaSemana, slotIdx, disciplinaId, professorId) {
            const { data, error } = await supabaseClient
                .from('grades_semanais')
                .upsert({
                    curso_id: cursoId,
                    tipo: tipo,
                    dia_semana: diaSemana,
                    slot_idx: slotIdx,
                    disciplina_id: disciplinaId,
                    professor_id: professorId
                }, { onConflict: 'curso_id,tipo,dia_semana,slot_idx' })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async deleteSlot(cursoId, tipo, diaSemana, slotIdx) {
            const { error } = await supabaseClient
                .from('grades_semanais')
                .delete()
                .eq('curso_id', cursoId)
                .eq('tipo', tipo)
                .eq('dia_semana', diaSemana)
                .eq('slot_idx', slotIdx);
            if (error) throw error;
        }
    },

    // --- Presenças ---
    presencas: {
        async fetchByDateTurno(data, turno) {
            const { data: rows, error } = await supabaseClient
                .from('presencas')
                .select('*')
                .eq('data', data)
                .eq('turno', turno);
            if (error) throw error;
            return rows || [];
        },
        async upsert(salaId, data, turno, slotIdx, status, substitutoId, fiscalId, professorId) {
            const { data: row, error } = await supabaseClient
                .from('presencas')
                .upsert({
                    sala_id: salaId,
                    data: data,
                    turno: turno,
                    slot_idx: slotIdx,
                    status: status,
                    substituto_id: substitutoId || null,
                    fiscal_id: fiscalId || null,
                    professor_id: professorId || null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'sala_id,data,turno,slot_idx' })
                .select()
                .single();
            if (error) throw error;
            return row;
        },
        async fetchByProfessorMonth(professorId, yearMonth) {
            const startDate = `${yearMonth}-01`;
            const endDate = `${yearMonth}-31`;
            const { data, error } = await supabaseClient
                .from('presencas')
                .select('*')
                .eq('professor_id', professorId)
                .gte('data', startDate)
                .lte('data', endDate);
            if (error) throw error;
            return data || [];
        },
        async fetchAbsencesByMonth(yearMonth) {
            const startDate = `${yearMonth}-01`;
            const endDate = `${yearMonth}-31`;
            const { data, error } = await supabaseClient
                .from('presencas')
                .select('*, sala:salas(*), professor:servidores!presencas_professor_id_fkey(*), fiscal:servidores!presencas_fiscal_id_fkey(*)')
                .gte('data', startDate)
                .lte('data', endDate)
                .in('status', ['ausente_sem', 'ausente_com', 'ausente_justificado']);
            if (error) throw error;
            return data || [];
        }
    },

    // --- Rondas Finalizadas ---
    rondas: {
        async fetchByDate(data, turno) {
            const query = supabaseClient
                .from('rondas_finalizadas')
                .select('*')
                .eq('data', data);
            if (turno) query.eq('turno', turno);
            const { data: rows, error } = await query;
            if (error) throw error;
            return rows || [];
        },
        async finalizar(data, turno, slotIdx, fiscalId, fiscalNome) {
            const { data: row, error } = await supabaseClient
                .from('rondas_finalizadas')
                .upsert({
                    data: data,
                    turno: turno,
                    slot_idx: slotIdx,
                    fiscal_id: fiscalId,
                    fiscal_nome: fiscalNome,
                    finalizado_em: new Date().toISOString()
                }, { onConflict: 'data,turno,slot_idx' })
                .select()
                .single();
            if (error) throw error;
            return row;
        },
        async isFinalized(data, turno, slotIdx) {
            const { data: rows, error } = await supabaseClient
                .from('rondas_finalizadas')
                .select('*')
                .eq('data', data)
                .eq('turno', turno)
                .eq('slot_idx', slotIdx);
            if (error) throw error;
            return rows && rows.length > 0 ? rows[0] : null;
        }
    },

    // --- Antecipações ---
    antecipacoes: {
        async fetchByDateTurno(data, turno) {
            const { data: rows, error } = await supabaseClient
                .from('antecipacoes')
                .select('*')
                .eq('data', data)
                .eq('turno', turno);
            if (error) throw error;
            return rows || [];
        },
        async create(row) {
            return insertRow('antecipacoes', row);
        }
    },

    // --- Pendências de Coordenação ---
    pendencias: {
        async fetchAll() {
            const { data, error } = await supabaseClient
                .from('pendencias_coordenacao')
                .select('*, professor:servidores(*), sala:salas(*)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        async fetchByStatus(status) {
            const { data, error } = await supabaseClient
                .from('pendencias_coordenacao')
                .select('*, professor:servidores(*), sala:salas(*)')
                .eq('status', status)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        create: (row) => insertRow('pendencias_coordenacao', row),
        async updateStatus(id, status) {
            const { data, error } = await supabaseClient
                .from('pendencias_coordenacao')
                .update({ status })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    // --- Correções de Presença ---
    correcoes: {
        async fetchAll() {
            const { data, error } = await supabaseClient
                .from('correcoes_presenca')
                .select('*, professor:servidores!correcoes_presenca_professor_id_fkey(*), coordenador:servidores!correcoes_presenca_coordenador_id_fkey(*)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        async fetchByProfessorMonth(professorId, yearMonth) {
            const startDate = `${yearMonth}-01`;
            const endDate = `${yearMonth}-31`;
            const { data, error } = await supabaseClient
                .from('correcoes_presenca')
                .select('*')
                .eq('professor_id', professorId)
                .gte('data', startDate)
                .lte('data', endDate);
            if (error) throw error;
            return data || [];
        },
        create: (row) => insertRow('correcoes_presenca', row),
    },

    // --- Audit Logs ---
    auditLogs: {
        async fetchAll(limit = 100) {
            const { data, error } = await supabaseClient
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return data || [];
        },
        async create(usuarioId, usuarioNome, acao, detalhes) {
            return insertRow('audit_logs', {
                usuario_id: usuarioId,
                usuario_nome: usuarioNome,
                acao: acao,
                detalhes: detalhes
            });
        }
    },

    // --- Usuários ---
    usuarios: {
        fetchAll: () => fetchAll('usuarios'),
        async fetchByAuthId(authId) {
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select('*')
                .eq('auth_id', authId)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        },
        async fetchByEmail(email) {
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select('*')
                .eq('email', email)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        },
        create: (row) => insertRow('usuarios', row),
        update: (id, data) => updateRow('usuarios', id, data),
    },

    // --- Solicitações de Substituição (Painel do Servidor) ---
    solicitacoesSubstituicao: {
        async fetchBySolicitante(solicitanteId) {
            const { data, error } = await supabaseClient
                .from('solicitacoes_substituicao')
                .select('*, substituto:usuarios!solicitacoes_substituicao_substituto_id_fkey(*)')
                .eq('solicitante_id', solicitanteId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        create: (row) => insertRow('solicitacoes_substituicao', row),
        update: (id, data) => updateRow('solicitacoes_substituicao', id, data),
    },

    // --- Delegações Temporárias (Painel DIR_GERAL) ---
    delegacoesTemporarias: {
        async fetchAtivas() {
            const { data, error } = await supabaseClient
                .from('delegacoes_temporarias')
                .select('*, titular:servidores!delegacoes_temporarias_titular_id_fkey(*), substituto:servidores!delegacoes_temporarias_substituto_id_fkey(*)')
                .eq('status', 'ATIVA')
                .order('data_inicio', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        create: (row) => insertRow('delegacoes_temporarias', row),
        update: (id, data) => updateRow('delegacoes_temporarias', id, data),
    },

    // --- Notificações ---
    notificacoes: {
        async fetchByUser(usuarioId) {
            const { data, error } = await supabaseClient
                .from('notificacoes')
                .select('*')
                .eq('usuario_id', usuarioId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        async markAsRead(id) {
            return updateRow('notificacoes', id, { lida: true, lida_em: new Date().toISOString() });
        },
        create: (row) => insertRow('notificacoes', row),
    },

    // --- Feedbacks e Suporte ---
    feedbacksSuporte: {
        fetchAll: () => fetchAll('feedbacks_suporte', 'created_at', false),
        create: (row) => insertRow('feedbacks_suporte', row),
        update: (id, data) => updateRow('feedbacks_suporte', id, data),
    }
};

console.log('[IFAP Presença] Módulo DB carregado com sucesso.');
