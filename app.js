// ============================================================
// DATA: Variáveis carregadas do Supabase (substituem os antigos mocks)
// ============================================================

let mockColegiados = [];
let mockCursosCadastrados = [];
let mockInstancias = [];
let mockServidores = [];
let mockTransferencias = [];
let mockDisciplinas = [];
let mockSalasManha = [];
let mockTurmas = [];
let mockTemplates = [];
let mockEtapasAvaliativas = [];
let mockGradesSemanais = {};
let mockProfessores = []; // Alias para servidores (mantido por compatibilidade)

// Dados derivados para visualização do Coordenador (serão calculados após carregar do DB)
let mockCursosCoord = [];
let mockDiarioCurso = [];
let mockProfessoresLivres = [];
let mockChefiadosStats = {};

const timeSlots = ["7:30 - 8:20", "8:20 - 9:10", "9:15 - 10:00", "10:20 - 11:10", "11:10 - 12:00"];

// ============================================================
// CARREGAMENTO ASSÍNCRONO DO BANCO DE DADOS
// ============================================================

function sortDataByStatusAndName(list) {
    return list.sort((a, b) => {
        const statusA = a.status || '';
        const statusB = b.status || '';
        const isAInactive = statusA.startsWith('INATIV');
        const isBInactive = statusB.startsWith('INATIV');
        
        if (isAInactive && !isBInactive) return 1;
        if (!isAInactive && isBInactive) return -1;
        
        const nameA = (a.nome || '').toLowerCase();
        const nameB = (b.nome || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
}

async function loadAllDataFromDB() {
    try {
        // Cadastros básicos
        mockInstancias = sortDataByStatusAndName((await DB.instancias.fetchAll()).map(i => ({
            ...i, responsavelId: i.responsavel_id
        })));
        mockColegiados = sortDataByStatusAndName((await DB.colegiados.fetchAll()).map(c => ({
            ...c, coordenadorId: c.coordenador_id
        })));
        mockCursosCadastrados = sortDataByStatusAndName((await DB.cursos.fetchAll()).map(c => ({
            ...c, vinculoId: c.vinculo_id, responsavelId: c.responsavel_id
        })));
        mockTurmas = sortDataByStatusAndName(await DB.turmas.fetchAll());
        mockDisciplinas = sortDataByStatusAndName(await DB.disciplinas.fetchAll());
        mockServidores = sortDataByStatusAndName((await DB.servidores.fetchAll()).map(s => ({
            ...s, vinculoId: s.vinculo_id
        })));

        mockTransferencias = await DB.transferencias.fetchAll();

        // Carregar disciplinas de cada servidor (relação N:N)
        for (const serv of mockServidores) {
            serv.disciplinas = await DB.servidores.fetchWithDisciplinas(serv.id);
        }

        // Carregar cursos de cada disciplina (relação N:N)
        for (const disc of mockDisciplinas) {
            disc.cursosIds = await DB.disciplinas.fetchWithCursos(disc.id);
        }

        mockProfessores = mockServidores; // Alias

        // Salas (mapear professor_id -> professorId)
        mockSalasManha = (await DB.salas.fetchAll()).map(s => ({
            ...s, professorId: s.professor_id
        }));

        // Templates de horário
        mockTemplates = await DB.templates.fetchAll();

        // Etapas avaliativas
        mockEtapasAvaliativas = await DB.etapas.fetchAll();

        // Grades semanais (carregar todas e converter para formato do appState)
        const allGrades = await fetchAll('grades_semanais');
        mockGradesSemanais = {};
        allGrades.forEach(row => {
            const key = `${row.curso_id}_${row.tipo}_${row.dia_semana}_${row.slot_idx}`;
            mockGradesSemanais[key] = { discId: String(row.disciplina_id), profId: String(row.professor_id) };
        });

        // Dados derivados para visão do Coordenador
        buildCoordViewData();

        console.log('[IFAP] Dados carregados do Supabase com sucesso.');
    } catch (err) {
        console.error('[IFAP] Erro ao carregar dados:', err);
        showToast('Erro ao carregar dados do servidor. Verifique sua conexão.');
    }
}

function buildCoordViewData() {
    // Construir mockCursosCoord a partir das salas e presenças
    mockCursosCoord = mockSalasManha.map((sala, idx) => ({
        id: sala.id,
        nome: sala.ano,
        curso: sala.curso,
        ano: '',
        status: 'verde',
        faltas: 0
    }));

    // Construir mockProfessoresLivres (servidores docentes sem aula no momento)
    mockProfessoresLivres = mockServidores
        .filter(s => s.tipo === 'Docente')
        .slice(0, 3)
        .map(s => ({
            nome: s.nome,
            area: mockDisciplinas.find(d => s.disciplinas && s.disciplinas.includes(d.id))?.nome || 'Geral',
            zap: '5596' + Math.floor(Math.random() * 100000000)
        }));

    // Construir mockChefiadosStats
    mockChefiadosStats = {};
    mockServidores.forEach(s => {
        mockChefiadosStats[String(s.id)] = {
            totalAusencias: 0,
            disciplinas: []
        };
    });

    // Construir mockDiarioCurso
    mockDiarioCurso = mockSalasManha.map(sala => {
        const prof = mockServidores.find(p => p.id === sala.professor_id);
        const col = prof ? mockColegiados.find(c => c.id === prof.vinculo_id) : null;
        return {
            time: timeSlots[0] || '7:30 - 8:20',
            prof: prof ? prof.nome : 'N/A',
            colegiado: col ? col.nome.replace('Colegiado de ', '') : 'N/A',
            status: 'presente'
        };
    });
}

function getAutoShiftAndDate() {
    const now = new Date();
    const hour = now.getHours();
    let shift = 'Manhã';
    if (hour >= 12 && hour < 18) shift = 'Tarde';
    else if (hour >= 18) shift = 'Noite';
    return { date: now.toISOString().split('T')[0], shift };
}

function getAutoTimeSlotIdx(shift) {
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    
    if (shift === 'Manhã') {
        if (min < 8 * 60 + 20) return 0; // 07:30 - 08:20
        if (min < 9 * 60 + 10) return 1; // 08:20 - 09:10
        if (min < 10 * 60) return 2;     // 09:10 - 10:00
        if (min < 11 * 60 + 10) return 3; // 10:20 - 11:10
        return 4; // 11:10 - 12:00
    }
    if (shift === 'Tarde') {
        if (min < 14 * 60 + 20) return 0; // 13:30 - 14:20
        if (min < 15 * 60 + 10) return 1; // 14:20 - 15:10
        if (min < 16 * 60) return 2;     // 15:10 - 16:00
        if (min < 17 * 60 + 10) return 3; // 16:20 - 17:10
        return 4; // 17:10 - 18:00
    }
    if (shift === 'Noite') {
        if (min < 19 * 60 + 40) return 0; // 18:50 - 19:40
        if (min < 20 * 60 + 30) return 1; // 19:40 - 20:30
        if (min < 21 * 60 + 20) return 2; // 20:30 - 21:20
        return 3; // 21:20 - 22:10
    }
    return 0;
}

const autoTime = getAutoShiftAndDate();


function registrarAcaoAuditoria(usuario, acao, detalhes) {
    const now = new Date();
    const timestampStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
    appState.auditLogs.unshift({
        timestamp: timestampStr,
        usuario: usuario || 'Sistema',
        acao: acao || 'Ação Geral',
        detalhes: detalhes || ''
    });
}

// State
let appState = {
    screen: 'HOME_PROFILES', // HOME_PROFILES, LOGIN, SHIFT_SELECTION, ROUND_VIEW, TEACHER_VALIDATION, DASHBOARD, COORD_VIEW, ADMIN_PANEL
    // Autenticação
    userName: null,
    userEmail: null,
    userId: null,
    loginLoading: false,
    loginError: '',
    selectedShift: null,
    selectedTimeSlot: 0,
    presences: {}, // "salaId_timeSlotIndex" -> { status, substitutoId }
    finalizedRondas: {}, // "date_shift_slotIdx" -> { finalizedAt, finalizedBy }
    antecipacoes: {}, // "profId_date_shift_slotIdx" -> { tipo, substitutoId, motivo }
    validationContext: null, 
    toast: null,
    modalMod4Timetable: false,
    mod4TimetableMode: 'TURMA',
    mod4TimetableSelectedProfId: '',
    highContrast: false,
    mod4GridTemp: {
        "1_REG_Segunda_0": { discId: "1", profId: "1" },
        "1_REG_Segunda_1": { discId: "1", profId: "1" },
        "1_REG_Segunda_2": { discId: "3", profId: "3" },
        "1_REG_Segunda_3": { discId: "3", profId: "3" },
        "1_REG_Segunda_4": { discId: "3", profId: "3" },
        "1_REG_Terça_0": { discId: "3", profId: "3" },
        "1_REG_Terça_1": { discId: "3", profId: "3" },
        "1_REG_Terça_2": { discId: "1", profId: "5" },
        "1_REG_Terça_3": { discId: "1", profId: "5" },
        "1_REG_Quarta_0": { discId: "1", profId: "1" },
        "1_REG_Quarta_1": { discId: "1", profId: "1" },
        "2_REG_Quinta_0": { discId: "2", profId: "1" },
        "3_REG_Quinta_0": { discId: "2", profId: "1" }
    },
    // Coordenador State
    coordTab: 'CURSOS', // 'CURSOS' ou 'CHEFIADOS'
    coordNivel0: null,
    chefiadosNivel0: null,
    coordCursoView: 'LIST', // 'LIST' ou 'DETAIL'
    coordShift: autoTime.shift,
    selectedCursoCoord: null,
    selectedChefiado: 'GERAL', // 'GERAL' ou ID
    selectedMonth: '2026-06', // Formato YYYY-MM, padrão Junho de 2026
    selectedDayDetail: null,  // Dia selecionado no calendário para exibir a fração X/Y
    highlightedDay: null,      // Dia que disparou o destaque das disciplinas
    modalProfessorSchedule: false, // Abre o modal de horário semanal do professor
    modalDisciplina: null,
    currentDate: autoTime.date,
    modalSubstituto: null,
    chefiadosTab: 'CARDS', // 'CARDS' ou 'PENDENCIAS'
    auditTab: 'RBAC', // 'RBAC' ou 'AUDIT'
    auditLogs: [
        {
            timestamp: "04/06/2026 09:30:15",
            usuario: "Fiscal de Sala (Estevão)",
            acao: "Registro de Ronda",
            detalhes: "Marcou Prof. Marcus Danilo como Ausente na Sala 1 - Técnico em Agropecuária (1º Horário, Manhã)"
        },
        {
            timestamp: "04/06/2026 10:15:22",
            usuario: "Coordenador (Marcus Danilo)",
            acao: "Permuta Prevista",
            detalhes: "Definiu Prof. Afrânio como substituto de Prof. Marcus Danilo na disciplina Introdução à Programação para a data 04/06/2026 no Turno Tarde"
        },
        {
            timestamp: "04/06/2026 11:00:00",
            usuario: "Estagiário (Admin)",
            acao: "Configuração RBAC",
            detalhes: "Alterou permissões do módulo Ronda Diária de Presença para perfil Coordenador de Colegiado"
        }
    ], // Histórico de logs de auditoria
    rondaPendencias: [], // Notificações pendentes de ronda para os coordenadores
    // Modulo 1 State
    mod1Tab: 'COLEGIADOS',
    mod1Modal: null,
    // Modulo 2 State
    mod2Modal: null,
    // Modulo 3 State
    mod3Modal: null,
    // Modulo 6 State
    mod6Modal: null,
    // Modulo 4 State
    mod4Tab: 'GRADE', // TEMPLATES, CALENDARIO, GRADE
    mod4GridContext: { cursoId: '', turno: 'T_MANHA', dia: 'Segunda', tipo: 'REG' },
    // NOVO: Controle de Acessos (RBAC)
    currentProfile: null,
    activeModule: null,
    sidebarCollapsed: false,
    mobileMenuOpen: false,
    permissions: {
        'MOD_1': ['ESTAGIARIO', 'DIR_GERAL', 'SUPER_ADMIN'],
        'MOD_2': ['ESTAGIARIO', 'DIR_GERAL', 'SUPER_ADMIN'],
        'MOD_3': ['ESTAGIARIO', 'DIR_GERAL', 'SUPER_ADMIN', 'COPED'],
        'MOD_4': ['ESTAGIARIO', 'DIR_GERAL', 'SUPER_ADMIN'],
        'MOD_5': ['FISCAL', 'DIR_GERAL', 'ESTAGIARIO', 'SUPER_ADMIN'],
        'MOD_6': ['COORD_COLEGIADO', 'DIR_GERAL', 'ESTAGIARIO', 'SUPER_ADMIN'],
        'MOD_7': ['COORD_COLEGIADO', 'COGEN', 'DEN', 'DIR_GERAL', 'ESTAGIARIO', 'COPED', 'SUPER_ADMIN'],
        'MOD_8': ['DIR_GERAL', 'DEN', 'COGEN', 'ESTAGIARIO', 'SUPER_ADMIN'],
        'MOD_CONFIG': ['DIR_GERAL', 'ESTAGIARIO', 'SUPER_ADMIN'],
        // Novos módulos
        'MOD_COPED':      ['COPED', 'SUPER_ADMIN'],          // Painel COPED
        'MOD_SERVIDOR':   ['SERVIDOR', 'SUPER_ADMIN'],       // Painel do Servidor (professor/técnico)
        'MOD_SUPER':      ['SUPER_ADMIN'],                   // Painel de suporte técnico
    }
};

window.saveOfflineData = function() {
    try {
        const dataToSave = {
            presences: appState.presences,
            finalizedRondas: appState.finalizedRondas,
            correcoesPresenca: appState.correcoesPresenca || {},
            rondaAbsences: appState.rondaAbsences || {}
        };
        localStorage.setItem('ifapOfflineData', JSON.stringify(dataToSave));
    } catch (e) {
        console.error("Erro ao salvar offline:", e);
    }
}

window.loadOfflineData = function() {
    try {
        const data = localStorage.getItem('ifapOfflineData');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.presences) Object.assign(appState.presences, parsed.presences);
            if (parsed.finalizedRondas) Object.assign(appState.finalizedRondas, parsed.finalizedRondas);
            if (parsed.correcoesPresenca) {
                appState.correcoesPresenca = appState.correcoesPresenca || {};
                Object.assign(appState.correcoesPresenca, parsed.correcoesPresenca);
            }
            if (parsed.rondaAbsences) {
                appState.rondaAbsences = appState.rondaAbsences || {};
                Object.assign(appState.rondaAbsences, parsed.rondaAbsences);
            }
        }
    } catch (e) {
        console.error("Erro ao carregar offline:", e);
    }
}

const MODULOS_INFO = {
    'MOD_1':         { id: 'MOD_1',         titulo: 'Cad. Colegiados e Cursos',        icone: '🏫' },
    'MOD_2':         { id: 'MOD_2',         titulo: 'Cad. Disciplinas',                icone: '📚' },
    'MOD_3':         { id: 'MOD_3',         titulo: 'Cadastrar Servidor',              icone: '👨‍💼' },
    'MOD_4':         { id: 'MOD_4',         titulo: 'Montagem do Horário Semanal',     icone: '📅' },
    'MOD_5':         { id: 'MOD_5',         titulo: 'Ronda Diária de Presença',        icone: '📱' },
    'MOD_6':         { id: 'MOD_6',         titulo: 'Painel do Chefiado',              icone: '👥' },
    'MOD_7':         { id: 'MOD_7',         titulo: 'Diário de Curso',                 icone: '📖' },
    'MOD_8':         { id: 'MOD_8',         titulo: 'Dashboard Geral',                 icone: '📊' },
    'MOD_CONFIG':    { id: 'MOD_CONFIG',    titulo: 'Configurações e Auditoria',       icone: '⚙️' },
    // Novos módulos
    'MOD_COPED':     { id: 'MOD_COPED',     titulo: 'Painel da Coord. Pedagógica',     icone: '🎓' },
    'MOD_SERVIDOR':  { id: 'MOD_SERVIDOR',  titulo: 'Meu Painel',                      icone: '🙋' },
    'MOD_SUPER':     { id: 'MOD_SUPER',     titulo: 'Suporte Técnico (Admin)',          icone: '🛠️' },
};

const appDiv = document.getElementById('app');

window.toggleHighContrast = function() {
    appState.highContrast = !appState.highContrast;
    if (appState.highContrast) {
        document.documentElement.classList.add('high-contrast');
    } else {
        document.documentElement.classList.remove('high-contrast');
    }
    render();
}

function renderHeader() {
    if (appState.screen === 'HOME_PROFILES' || appState.screen === 'LOGIN') return '';

    let menu = '';
    if (appState.currentProfile) {
        const perfisNomes = {
            'FISCAL':           'Fiscal',
            'COORD_COLEGIADO':  'Colegiado',
            'COGEN':            'Coord. Ensino',
            'COPED':            'COPED',
            'DEN':              'DEPPI/DEN',
            'DIR_GERAL':        'Diretor Geral',
            'ESTAGIARIO':       'Estagiário',
            'SERVIDOR':         'Servidor',
            'SUPER_ADMIN':      'Suporte Técnico',
        };
        menu = `
            <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; margin-right: 0.5rem;">
                <div class="sys-title" style="color: rgba(255, 255, 255, 0.9); font-weight: 600; font-size: 0.95rem; line-height: 1.2;">${perfisNomes[appState.currentProfile] || 'Outro'}</div>
                <div style="color: rgba(255, 255, 255, 0.75); font-size: 0.75rem; line-height: 1.2; letter-spacing: 0.3px;">${appState.userEmail || ''}</div>
            </div>
        `;
    }

    return `
        <header style="background-color: var(--if-green); color: white; display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; box-shadow: var(--shadow-sm); position: sticky; top: 0; z-index: 10;">
            <div style="display: flex; align-items: center; gap: 1.5rem;">
                <img src="logobranca.png" alt="IFAP Logo" style="height: 40px; cursor: pointer;" onclick="navigate('HOME_PROFILES')">
                <div style="width: 1px; height: 35px; background: rgba(255,255,255,0.3);"></div>
                <h2 style="font-size: 1.2rem; font-weight: 400; color: rgba(255,255,255,0.95); margin: 0; letter-spacing: 0.5px;">Registro de Presença Docente</h2>
            </div>
            <div class="nav-menu" style="display: flex; align-items: center; gap: 1rem;">
                ${menu}
                <button class="nav-btn outline-btn" onclick="window.toggleHighContrast()" style="border-color: rgba(255,255,255,0.3); color: white; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 0; border-radius: 50%;" title="Alternar Alto Contraste">
                    <span style="font-size: 1.2rem;">🌓</span>
                </button>
                <button class="nav-btn outline-btn" onclick="logout()" style="border-color: rgba(255,255,255,0.3); color: white; display: flex; align-items: center; gap: 0.4rem;">🚪 Sair</button>
            </div>
        </header>
    `;
}

function renderHomeProfiles() {
    return renderLoginScreen();
}

function renderLoginScreen() {
    const isLoading = appState.loginLoading || false;
    const errorMsg = appState.loginError || '';

    const registerModalHtml = '';
    const modalPrimeiroAcessoHtml = appState.modalPrimeiroAcesso ? `
        <div class="modal-overlay animate-fade-in" onclick="window.closePrimeiroAcesso()">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>🔐 Primeiro Acesso / Redefinir Senha</h3>
                    <button class="close-btn" onclick="window.closePrimeiroAcesso()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.4;">Para acessar uma conta funcional, informe o E-mail Institucional e comprove a sua Matrícula SIAPE. Enviaremos um link de acesso para o e-mail oficial.</p>
                    <form onsubmit="window.handlePrimeiroAcesso(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label style="font-weight: 500; font-size: 0.9rem;">E-mail Institucional</label>
                            <input type="email" id="paEmail" required placeholder="Ex: colegiado@ifap.edu.br" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                        </div>
                        <div>
                            <label style="font-weight: 500; font-size: 0.9rem;">Sua Matrícula SIAPE</label>
                            <input type="text" id="paSiape" required placeholder="Digite seu SIAPE" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                        </div>
                        <button type="submit" id="paSubmitBtn" class="nav-btn" style="width: 100%; margin-top: 1rem;">Solicitar Link de Acesso</button>
                    </form>
                </div>
            </div>
        </div>
    ` : '';

    return `
        <div class="profiles-container" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative;">
            <div style="background: var(--card-bg); padding: 3rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); max-width: 420px; width: 100%; border: 1px solid var(--border-color);">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <img src="logo.png" alt="IFAP Logo" style="height: 80px; margin-bottom: 1rem;" onerror="this.src='https://via.placeholder.com/80x80?text=IF'">
                    <h1 style="font-size: 1.4rem; color: var(--if-green); margin: 0;">Registro de Presença Docente</h1>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem;">IFAP — Campus Porto Grande</p>
                </div>

                ${errorMsg ? `<div style="background: #FEF2F2; color: #DC2626; padding: 0.8rem; border-radius: var(--radius-md); margin-bottom: 1rem; font-size: 0.9rem; border: 1px solid #FECACA; text-align: center;">${errorMsg}</div>` : ''}

                <form onsubmit="window.handleLogin(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label for="loginEmail" style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.5px;">E-mail Institucional</label>
                        <input type="email" id="loginEmail" placeholder="seunome@ifap.edu.br" required
                            style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem; font-family: inherit; box-sizing: border-box;"
                        >
                    </div>
                    <div>
                        <label for="loginPassword" style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.5px;">Senha</label>
                        <input type="password" id="loginPassword" placeholder="••••••••" required
                            style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem; font-family: inherit; box-sizing: border-box;"
                        >
                    </div>
                    <button type="submit" ${isLoading ? 'disabled' : ''}
                        style="width: 100%; padding: 0.9rem; background: var(--if-green); color: white; border: none; border-radius: var(--radius-md); font-size: 1rem; font-weight: 700; cursor: pointer; transition: background 0.2s; font-family: inherit; ${isLoading ? 'opacity: 0.7;' : ''}"
                    >
                        ${isLoading ? '⏳ Entrando...' : '🔐 Entrar'}
                    </button>
                </form>

                <div style="text-align: center; margin-top: 1rem;">
                    <a href="#" onclick="window.openPrimeiroAcesso(event)" style="color: var(--if-green); font-size: 0.9rem; text-decoration: none; font-weight: 600;">Primeiro Acesso / Cadastrar Senha</a>
                </div>

                <p style="text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-top: 1.5rem;">Acesso restrito a servidores autorizados do IFAP</p>
            </div>
            ${registerModalHtml}
            ${modalPrimeiroAcessoHtml}
        </div>
    `;
}

// FISCAL VIEWS
function renderShiftSelection() {
    return `
        <main>
            <div class="shift-selection">
                <h2 style="color: var(--text-muted); font-weight: 500;">Selecione o Turno da Ronda</h2>
                
                <div style="margin-bottom: 2rem; background: var(--card-bg); padding: 1rem; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; gap: 0.5rem; max-width: 300px; margin-left: auto; margin-right: auto;">
                    <label for="rondaDatePicker" style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Data da Ronda / Relatório</label>
                    <input type="date" id="rondaDatePicker" value="${appState.currentDate}" onchange="appState.currentDate = this.value; render();" style="padding: 0.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); width: 100%; font-size: 1rem; text-align: center; font-family: inherit;">
                </div>

                <button class="shift-btn manhã" onclick="selectShift('Manhã')">Manhã</button>
                <button class="shift-btn tarde" onclick="selectShift('Tarde')">Tarde</button>
                <button class="shift-btn noite" onclick="selectShift('Noite')">Noite</button>
                
                <div style="margin-top: 2rem;">
                    <button class="nav-btn hover-elevate" onclick="window.gerarRelatorioFiscal()" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; max-width: 300px; margin: 0 auto; background: white; border: 1px solid var(--border-color); color: var(--text-main); font-weight: 600; padding: 0.8rem; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); cursor: pointer; transition: all 0.2s;">
                        📄 Gerar Relatório Mensal
                    </button>
                </div>
            </div>
        </main>
    `;
}

function renderRoundView() {
    const keyFinalize = `${appState.currentDate}_${appState.selectedShift}_${appState.selectedTimeSlot}`;
    const isFinalized = appState.finalizedRondas && appState.finalizedRondas[keyFinalize];
    const inputDisabled = isFinalized ? 'disabled' : '';

    const timeSlotsHtml = timeSlots.map((time, index) => `
        <div class="time-slot ${appState.selectedTimeSlot === index ? 'active' : ''}" onclick="selectTimeSlot(${index})">
            ${time}
        </div>
    `).join('');

    const roomsHtml = mockSalasManha.map(sala => {
        const prof = mockProfessores.find(p => p.id === sala.professorId);
        const recordKey = `${sala.id}_${appState.selectedTimeSlot}`;
        const record = appState.presences[recordKey] || { status: null };

        const isAusente = record.status === 'ausente_sem' || record.status === 'ausente_com' || record.status === 'ausente_justificado';
        let profOptions = mockProfessores.map(p => `<option value="${p.id}" ${record.substitutoId == p.id ? 'selected' : ''}>${p.nome}</option>`).join('');

        let profName = prof ? prof.nome : 'N/A';
        let profStatusTag = '';
        
        const antKey = `${sala.professorId}_${appState.currentDate}_${appState.selectedShift}_${appState.selectedTimeSlot}`;
        const antecipacao = appState.antecipacoes[antKey];

        if (antecipacao) {
            if (antecipacao.tipo === 'CHEFIA_CIENTE') {
                profStatusTag = `<span class="badge-card-alert" style="background: #F59E0B; color: white; padding: 0.1rem 0.4rem; font-size: 0.7rem; margin-left: 0.5rem; display: inline-flex; align-items: center; border-radius: 4px;" title="${antecipacao.motivo}">⚠️ Chefia Ciente</span>`;
            } else if (antecipacao.tipo === 'SUBSTITUICAO') {
                const subProf = mockProfessores.find(p => p.id == antecipacao.substitutoId);
                if (subProf) {
                    profName = subProf.nome;
                    profStatusTag = `<div style="font-size: 0.75rem; color: #D97706; margin-top: 0.2rem; font-weight: 600;">🔄 Substituindo Prof. ${prof ? prof.nome : ''}</div>`;
                }
            }
        }

        return `
            <div class="room-card">
                <div class="room-header">
                    <div class="room-name">${sala.nome}</div>
                </div>
                <div class="course-info">${sala.curso} &nbsp; ${sala.ano}</div>
                <div class="teacher-name" style="display: flex; align-items: center;">Docente: ${profName} ${antecipacao && antecipacao.tipo === 'CHEFIA_CIENTE' ? profStatusTag : ''}</div>
                ${antecipacao && antecipacao.tipo === 'SUBSTITUICAO' ? profStatusTag : ''}
                
                <div class="presence-segment-control ${isFinalized ? 'disabled' : ''}">
                    <button type="button" class="segment-btn btn-presente ${record.status === 'presente' ? 'active' : ''}" 
                        ${inputDisabled}
                        onclick="window.updatePresence(${sala.id}, 'presente', '${profName}', '${sala.nome}')">
                        🟢 Presente
                    </button>
                    <button type="button" class="segment-btn btn-ausente ${isAusente ? 'active' : ''}" 
                        ${inputDisabled}
                        onclick="window.updatePresence(${sala.id}, '${antecipacao && antecipacao.tipo === 'CHEFIA_CIENTE' ? 'ausente_justificado' : 'ausente_sem'}', '${profName}', '${sala.nome}')">
                        🔴 Ausente
                    </button>
                </div>

                ${isAusente && record.status !== 'ausente_justificado' ? `
                    <div class="absence-options">
                        <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem;">Houve Substituição?</div>
                        <label style="display: block; margin-bottom: 0.25rem; ${isFinalized ? 'cursor: not-allowed; opacity: 0.75;' : ''}">
                            <input type="radio" ${inputDisabled} name="sub_${recordKey}" ${record.status === 'ausente_sem' ? 'checked' : ''} onchange="updatePresence(${sala.id}, 'ausente_sem', '${profName}', '${sala.nome}')"> Sem substituição (Notificar)
                        </label>
                        <label style="display: block; ${isFinalized ? 'cursor: not-allowed; opacity: 0.75;' : ''}">
                            <input type="radio" ${inputDisabled} name="sub_${recordKey}" ${record.status === 'ausente_com' ? 'checked' : ''} onchange="updatePresence(${sala.id}, 'ausente_com', '${profName}', '${sala.nome}')"> Com substituição
                        </label>

                        ${record.status === 'ausente_com' ? `
                            <select ${inputDisabled} onchange="updateSubstituto(${sala.id}, this.value)" style="${isFinalized ? 'cursor: not-allowed; background: #F1F5F9;' : ''}">
                                <option value="">Selecione o substituto...</option>
                                ${profOptions}
                            </select>
                        ` : ''}
                    </div>
                ` : ''}
                ${isAusente && record.status === 'ausente_justificado' ? `
                    <div style="margin-top: 1rem; padding: 0.5rem; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 4px; font-size: 0.8rem; color: #B45309;">
                        Ausência justificada previamente pela Coordenação.
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    let finalizeBannerOrButton = '';
    if (isFinalized) {
        finalizeBannerOrButton = `
            <div style="background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; padding: 1.2rem; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-sm); width: 100%;">
                <div>
                    <strong>✅ Ronda Consolidada e Travada</strong><br>
                    <span style="font-size: 0.9rem; opacity: 0.9;">Consolidada em ${isFinalized.finalizedAt} por ${isFinalized.finalizedBy}</span>
                </div>
                <span style="background: #065F46; color: white; padding: 0.4rem 1rem; border-radius: var(--radius-md); font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Imutável (Para Auditoria)</span>
            </div>
        `;
    } else {
        finalizeBannerOrButton = `
            <div style="display: flex; justify-content: flex-end; width: 100%;">
                <button class="nav-btn" onclick="window.finalizarRonda()" style="background: var(--if-red); border-color: var(--if-red); color: white; padding: 1rem 2rem; font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 0.6rem; box-shadow: var(--shadow-md); border-radius: var(--radius-md);">
                    🔒 Finalizar e Consolidar Ronda
                </button>
            </div>
        `;
    }

    return `
        <main>
            <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Data: ${appState.currentDate.split('-').reverse().join('/')}</div>
                    <h2 style="margin-top: 0.2rem;">Ronda: ${appState.selectedShift}</h2>
                </div>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    ${!isFinalized ? `
                        <button class="nav-btn-green" onclick="window.marcarTodosPresentes()" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1.2rem; font-size: 0.95rem;">
                            ✨ Marcar Todos como Presente
                        </button>
                    ` : ''}
                    <button onclick="goBackToShiftSelection()" style="background:none; border:none; color: var(--text-muted); cursor: pointer; font-weight:bold;">← Voltar</button>
                </div>
            </div>
            <div class="round-panel">
                <div class="time-sidebar">
                    ${timeSlotsHtml}
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="rooms-grid">
                        ${roomsHtml}
                    </div>
                    ${finalizeBannerOrButton}
                </div>
            </div>
        </main>
    `;
}

function renderTeacherValidation() {
    const ctx = appState.validationContext || { profNome: 'Professor', salaNome: 'Sala', hora: 'N/A' };
    
    return `
        <main>
            <div class="teacher-validation">
                <button class="outline-btn" style="border: none; background: none; font-weight: bold; cursor: pointer; color: var(--text-muted); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.3rem;" onclick="navigate('HOME_PROFILES')">
                    ← Voltar ao Início
                </button>
                <h2>Notificação de Ausência</h2>
                <p style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 1rem;">
                    Olá, <strong>${ctx.profNome}</strong>.
                </p>
                <p style="color: var(--text-muted); line-height: 1.5;">
                    Consta em nosso sistema um registro de ausência na sua disciplina ministrada na <strong>${ctx.salaNome}</strong> durante o horário das <strong>${ctx.hora}</strong>.
                </p>
                <p style="margin-top: 1rem; font-weight: 500;">Por favor, nos ajude a validar esta informação para fins de acompanhamento pedagógico:</p>
                
                <div class="validation-options" id="validation-options-container">
                    <button class="btn-outline" onclick="confirmValidation('ausente')">
                        ❌ Não estou no campus hoje
                    </button>
                    <button class="btn-outline" onclick="document.getElementById('extra-locations').style.display='block'">
                        📍 Estou em atividade pedagógica fora da sala padrão
                    </button>
                    
                    <div id="extra-locations" style="display: none; padding-left: 1rem; border-left: 2px solid var(--if-green); margin-top: 1rem;">
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">Selecione o local:</p>
                        <select style="padding: 0.5rem; width: 100%; border-radius: 4px; border: 1px solid var(--border-color); margin-bottom: 1rem;">
                            <option>Laboratório de Informática</option>
                            <option>Laboratório de Biologia</option>
                            <option>Aula na Fazenda</option>
                            <option>Aula de Campo</option>
                        </select>
                        <button onclick="confirmValidation('presente_outro')" style="background: var(--if-green); color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-weight:bold;">Confirmar Local</button>
                    </div>
                </div>
            </div>
        </main>
    `;
}

function renderDashboard() {
    let total = 0, presentes = 0, ausentes = 0, substituidos = 0;
    let turmasDescobertas = [];

    mockSalasManha.forEach(sala => {
        total++;
        const key = `${sala.id}_${appState.selectedTimeSlot}`;
        const record = appState.presences[key];
        
        if (!record || record.status === 'presente') presentes++;
        else if (record.status === 'ausente_com') substituidos++;
        else if (record.status === 'ausente_sem') {
            ausentes++;
            turmasDescobertas.push(sala);
        }
    });

    const turmasDescHtml = turmasDescobertas.length > 0 
        ? turmasDescobertas.map(s => `<div class="list-item"><span>${s.nome} - ${s.curso}</span><span class="badge red">Sem Docente</span></div>`).join('')
        : `<p style="color: var(--text-muted);">Nenhuma turma descoberta neste horário. 🎉</p>`;

    return `
        <main>
            <h2 style="margin-bottom: 1.5rem;">Dashboard - Monitoramento Pedagógico</h2>
            
            <div class="metrics-row">
                <div class="metric">
                    <div class="metric-value">${presentes}</div>
                    <div class="metric-label">Presenças Confirmadas</div>
                </div>
                <div class="metric warning">
                    <div class="metric-value" style="color: var(--if-red);">${ausentes}</div>
                    <div class="metric-label">Faltas S/ Substituição</div>
                </div>
                <div class="metric">
                    <div class="metric-value" style="color: #D69E2E;">${substituidos}</div>
                    <div class="metric-label">Substituições</div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="dash-card">
                    <h3>⚠️ Turmas Descobertas (Agora)</h3>
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">Horário: ${timeSlots[appState.selectedTimeSlot]}</p>
                    ${turmasDescHtml}
                </div>

                <div class="dash-card">
                    <h3>✅ Professores Disponíveis no Campus</h3>
                    <div class="list-item">
                        <span>Prof. João (Matemática)</span>
                        <span class="badge green">Livre</span>
                    </div>
                    <div class="list-item">
                        <span>Profa. Ana (Biologia)</span>
                        <span class="badge green">Livre</span>
                    </div>
                </div>
            </div>
        </main>
    `;
}

// COORDENADOR VIEWS
window.changeCoordDate = function(offset) {
    const d = new Date(appState.currentDate);
    d.setDate(d.getDate() + offset + 1); // +1 fuso horario compensation
    appState.currentDate = d.toISOString().split('T')[0];
    render();
}

window.selectCoordDate = function(val) {
    if(val) {
        appState.currentDate = val;
        render();
    }
}

window.changeCoordShift = function(shift) {
    appState.coordShift = shift;
    render();
}

window.selectCoordNivel0 = function(nivel0Id) {
    appState.coordNivel0 = nivel0Id;
    appState.coordCursoView = 'LIST';
    render();
}

window.clearCoordNivel0 = function() {
    appState.coordNivel0 = null;
    appState.coordCursoView = 'LIST';
    render();
}

window.selectChefiadosNivel0 = function(nivel0Id) {
    appState.chefiadosNivel0 = nivel0Id;
    appState.selectedChefiado = 'GERAL';
    render();
}

window.clearChefiadosNivel0 = function() {
    appState.chefiadosNivel0 = null;
    appState.selectedChefiado = 'GERAL';
    render();
}

const mockNivel0Cards = [
    { id: 'C_1', nome: "Colegiado de Agropecuária", tipo: "Técnico", icone: "🏫", status: "vermelho", faltas: 2 },
    { id: 'C_2', nome: "Colegiado de Informática", tipo: "Técnico", icone: "🏫", status: "verde", faltas: 0 },
    { id: 'C_3', nome: "Colegiado de Biologia", tipo: "Licenciatura", icone: "🎓", status: "verde", faltas: 0 },
    { id: 'FIC', nome: "Cursos FIC", tipo: "Formação Inicial e Continuada", icone: "🛠️", status: "amarelo", faltas: 1 },
    { id: 'POS', nome: "Pós-Graduação", tipo: "Especialização / Mestrado", icone: "🏆", status: "verde", faltas: 0 }
];

function renderCoordTelaZero() {
    const rowsHtml = mockNivel0Cards.map(c => {
        let borderColor = 'var(--if-green)';
        let statusNumber = `<div style="font-size: 2rem; font-weight: 700; color: var(--if-green); line-height: 1;">0</div>
                            <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 600; margin-top: 0.2rem;">Faltas</div>`;
        
        let bgStyle = 'background: white;';
        
        if (c.status === 'vermelho') {
            borderColor = 'var(--if-red)';
            bgStyle = 'background: #FEF2F2;'; // Light red bg
            statusNumber = `<div style="font-size: 2rem; font-weight: 700; color: var(--if-red); line-height: 1;" class="animate-pulse">${c.faltas}</div>
                            <div style="color: var(--if-red); font-size: 0.75rem; text-transform: uppercase; font-weight: 700; margin-top: 0.2rem;">Faltas</div>`;
        } else if (c.status === 'amarelo') {
            borderColor = '#D69E2E';
            bgStyle = 'background: #FFFAF0;'; // Light yellow bg
            statusNumber = `<div style="font-size: 2rem; font-weight: 700; color: #D69E2E; line-height: 1;">${c.faltas}</div>
                            <div style="color: #D69E2E; font-size: 0.75rem; text-transform: uppercase; font-weight: 700; margin-top: 0.2rem;">Subs.</div>`;
        }
        
        return `
            <div class="macro-area-row animate-slide-up" onclick="selectCoordNivel0('${c.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 1.5rem 2rem; border-radius: var(--radius-lg); ${bgStyle} border-left: 6px solid ${borderColor}; box-shadow: var(--shadow-sm); margin-bottom: 1rem; cursor: pointer; transition: all 0.2s ease;">
                <div style="display: flex; align-items: center; gap: 1.5rem;">
                    <div style="font-size: 2.5rem; background: rgba(255,255,255,0.5); width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">${c.icone}</div>
                    <div>
                        <h3 style="font-size: 1.3rem; color: var(--text-main); margin: 0; font-weight: 700;">${c.nome}</h3>
                        <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.3rem;">${c.tipo}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 2rem;">
                    <div style="text-align: center; min-width: 60px;">
                        ${statusNumber}
                    </div>
                    <div style="color: var(--text-muted); opacity: 0.5;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%; padding: 1.5rem; background: #F8FAFC;">
            ${renderMod7Topbar('📖 Diário de Turmas', 'Visão Global do Campus', false)}
            <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 1.5rem; padding-left: 0.5rem; margin-top: 1.5rem;">
                Abaixo estão as macro-áreas que possuem aula agendada para <strong>${appState.coordShift}</strong>. Clique em uma área para detalhar as turmas.
            </p>
            
            <div class="macro-areas-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${rowsHtml}
            </div>
        </div>
    `;
}

function renderMod7Topbar(title = '📖 Diário das Turmas', subtitle = '', showBack = true) {
    const formatDateStr = (dateStr) => {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    let backBtnHtml = '';
    if (showBack && appState.currentProfile !== 'COORD_COLEGIADO') {
        backBtnHtml = `
            <button class="icon-btn-back" onclick="clearCoordNivel0()" style="background: #F1F5F9; border: none; padding: 0.5rem; border-radius: 50%; cursor: pointer; margin-right: 1rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
        `;
    }

    return `
        <div class="diario-header" style="flex-direction: column; align-items: flex-start; gap: 1rem; border-bottom: none; padding-bottom: 0;">
            <div style="display: flex; align-items: center;">
                ${backBtnHtml}
                <div>
                    <h2 style="margin:0; color: var(--text-main); font-size: 1.5rem;">${title}</h2>
                    ${subtitle ? `<div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">${subtitle}</div>` : ''}
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; background: #F8FAFC; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 0.5rem; background: white; padding: 0.3rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
                    ${['Manhã', 'Tarde', 'Noite'].map(s => `
                        <button class="coord-tab ${appState.coordShift === s ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.4rem 1rem;" onclick="changeCoordShift('${s}')">${s}</button>
                    `).join('')}
                </div>
                
                <div class="date-selector-wrapper" style="margin: 0; background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.3rem 0.5rem; display: flex; align-items: center;">
                    <button class="btn-date-arrow" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);" onclick="changeCoordDate(-1)">&lt;</button>
                    <div class="date-display" onclick="document.getElementById('hidden-date-input').showPicker()" style="font-weight: 500; cursor: pointer; padding: 0 1rem; position: relative;">
                        📅 Hoje: <span id="display-date-text">${formatDateStr(appState.currentDate)}</span>
                        <input type="date" id="hidden-date-input" value="${appState.currentDate}" onchange="selectCoordDate(this.value)" style="opacity:0; position:absolute; z-index:-1; width:0; height:0;">
                    </div>
                    <button class="btn-date-arrow" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);" onclick="changeCoordDate(1)">&gt;</button>
                </div>
            </div>
        </div>
    `;
}

function renderCoordCursosList() {
    const cardsHtml = mockCursosCoord.map(c => {
        let badgeHtml = '';
        let cardClass = 'card-green'; // default
        
        if (c.status === 'vermelho') {
            cardClass = 'card-red';
            badgeHtml = `<div class="badge-card-alert animate-pulse" style="background: var(--if-red); color: white;">⚠️ ${c.faltas} Aula(s) Descoberta(s)</div>`;
        } else if (c.status === 'amarelo') {
            cardClass = 'card-yellow';
            badgeHtml = `<div class="badge-card-alert" style="background: #D69E2E; color: white;">🔄 ${c.faltas} Substituição(ões)</div>`;
        } else {
            badgeHtml = `<div class="badge-card-alert" style="background: var(--if-green); color: white;">✅ Tudo OK</div>`;
        }

        return `
            <div class="curso-coord-card animate-fade ${cardClass}" onclick="navigateCoordCursoDetail(${c.id})" style="position: relative; overflow: hidden; border-width: 2px;">
                ${badgeHtml}
                <div class="curso-card-title">${c.nome}</div>
                <div class="curso-card-subtitle">${c.curso}</div>
                ${c.ano ? `<div class="curso-card-ano">${c.ano}</div>` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%; padding: 1.5rem;">
            ${renderMod7Topbar()}
            <p style="color: var(--text-muted); margin-top: 1rem; margin-bottom: 2rem;">Abaixo estão as turmas que possuem aula agendada para <strong>${appState.coordShift}</strong>. Turmas com professores ausentes aparecerão em vermelho.</p>
            <div class="cursos-coord-grid">
                ${cardsHtml}
            </div>
        </div>
    `;
}

function renderCoordDiarioCurso() {
    const curso = mockCursosCoord.find(c => c.id == appState.selectedCursoCoord);
    
    const shiftsHtml = ['Manhã', 'Tarde', 'Noite'].map(s => `
        <button class="shift-subtab ${appState.coordShift === s ? 'active' : ''}" onclick="selectCoordShift('${s}')">${s}</button>
    `).join('');

     const listHtml = mockDiarioCurso.map((item, idx) => {
        let statusBadge = '';
        let actionBtn = '';
        let profNameHtml = `<strong>${item.prof}</strong>`;
        let substituteInfo = '';

        const profObj = mockProfessores.find(p => p.nome === item.prof);
        const antKey = profObj ? `${profObj.id}_${appState.currentDate}_${appState.coordShift}_${idx}` : null;
        const antecipacao = antKey ? appState.antecipacoes[antKey] : null;

        let displayStatus = item.status;
        if (antecipacao && antecipacao.tipo === 'CHEFIA_CIENTE') {
            displayStatus = 'ausente_justificado';
        } else if (antecipacao && antecipacao.tipo === 'SUBSTITUICAO') {
            displayStatus = 'substituido_previo';
        }

        if (displayStatus === 'presente') {
            statusBadge = `<div class="status-badge badge-green">Presente</div>`;
        } else if (displayStatus === 'ausente') {
            statusBadge = `<div class="status-badge badge-red">Ausente</div>`;
            actionBtn = `<button class="btn-buscar-substituto" style="margin-right: 1rem; border: 1px solid var(--if-red); color: var(--if-red); background: white; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 0.3rem;" onclick="openModalSubstituto('${item.time}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Buscar Substituto</button>`;
        } else if (displayStatus === 'ausente_justificado') {
            statusBadge = `<div class="status-badge" style="background: #FFFBEB; color: #D97706; border: 1px solid #FCD34D;">Ausente (Justificado)</div>`;
            substituteInfo = `<div style="display:block; font-size: 0.75rem; color: #B45309; margin-top:0.4rem; text-align: center;" title="${antecipacao.motivo}">⚠️ Chefia Ciente</div>`;
        } else if (displayStatus === 'substituido') {
            statusBadge = `<div class="status-badge badge-orange">Substituído</div>`;
            substituteInfo = `<div style="display:block; font-size: 0.75rem; color: var(--text-muted); margin-top:0.4rem; text-align: center;">${item.substituto}</div>`;
        } else if (displayStatus === 'substituido_previo') {
            const subProf = mockProfessores.find(p => p.id == antecipacao.substitutoId);
            profNameHtml = `<strong>${subProf ? subProf.nome : 'Desconhecido'}</strong>`;
            statusBadge = `<div class="status-badge badge-orange" style="background: #E0F2FE; color: #0369A1;">Permuta / Subs.</div>`;
            substituteInfo = `<div style="display:block; font-size: 0.75rem; color: var(--text-muted); margin-top:0.4rem; text-align: center;">No lugar de ${item.prof}</div>`;
        }

        return `
            <div class="diario-row animate-fade" style="display: flex; align-items: center;">
                <div class="diario-time" style="width: 120px;">${item.time}</div>
                <div class="diario-docente" style="flex: 1;">
                    ${profNameHtml}
                    <div class="colegiado-name" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.2rem;">(Colegiado de ${item.colegiado})</div>
                </div>
                <div class="diario-status-cell" style="width: auto; display: flex; align-items: center; justify-content: flex-end;">
                    ${actionBtn}
                    <div style="display: flex; flex-direction: column; align-items: center; min-width: 100px;">
                        ${statusBadge}
                        ${substituteInfo}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const formatDateStr = (dateStr) => {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    return `
        <div class="coord-panel animate-fade" style="padding: 1.5rem; background: white; border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
            <div class="diario-header" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <button class="icon-btn-back" onclick="navigateCoordCursosList()" style="background: #F1F5F9; border: none; padding: 0.5rem; border-radius: 50%; cursor: pointer;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <h2 style="margin: 0; font-size: 1.5rem; color: var(--text-main);">${curso.nome} - ${curso.curso} ${curso.ano}</h2>
                        <button class="outline-btn" style="border-color: var(--text-muted); color: var(--text-muted); font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; display: flex; align-items: center; gap: 0.3rem;">👁️ Ver Grade</button>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="color: var(--text-muted); font-size: 0.9rem;">Data da aula</div>
                    <div style="font-weight: 600; color: var(--text-main);">${formatDateStr(appState.currentDate)}</div>
                </div>
            </div>
            <div class="shift-subtabs" style="margin-top: 1rem; border-bottom: 2px solid #E2E8F0;">
                ${shiftsHtml}
            </div>
            <div class="diario-table-container" style="margin-top: 1.5rem;">
                <div class="diario-table">
                    ${listHtml}
                </div>
            </div>
        </div>
    `;
}

function renderDoughnutChart(label, faltas, maxFaltas, onClickStr) {
    const percentRed = Math.min((faltas / maxFaltas) * 100, 100);
    const conicStyle = `conic-gradient(var(--if-red) 0% ${percentRed}%, var(--if-green) ${percentRed}% 100%)`;
    const pointerStyle = onClickStr ? 'cursor: pointer;' : '';
    const hoverClass = onClickStr ? 'doughnut-interactive' : '';

    return `
        <div class="doughnut-container ${hoverClass}" style="${pointerStyle}" ${onClickStr ? `onclick="${onClickStr}"` : ''}>
            <div class="doughnut-chart" style="background: ${conicStyle};">
                <div class="doughnut-hole">
                    <span class="doughnut-number ${faltas > 0 ? 'text-red' : 'text-green'}">${faltas.toString().padStart(2, '0')}</span>
                </div>
            </div>
            <div class="doughnut-label">${label}</div>
        </div>
    `;
}

function getSelectedMonthName() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const [year, month] = appState.selectedMonth.split('-');
    return `${months[parseInt(month) - 1]} de ${year}`;
}

function getSelectedMonthOnlyName() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const [_, month] = appState.selectedMonth.split('-');
    return months[parseInt(month) - 1];
}

window.changeSelectedMonth = function(offset) {
    let [year, month] = appState.selectedMonth.split('-').map(Number);
    month += offset;
    if (month > 12) {
        month = 1;
        year += 1;
    } else if (month < 1) {
        month = 12;
        year -= 1;
    }
    appState.selectedMonth = `${year}-${month.toString().padStart(2, '0')}`;
    appState.selectedDayDetail = null;
    appState.highlightedDay = null;
    render();
}

window.selectSelectedMonth = function(val) {
    if(val) {
        appState.selectedMonth = val;
        appState.selectedDayDetail = null;
        appState.highlightedDay = null;
        render();
    }
}

function getMonthCalendarData(yearMonthStr) {
    const [year, month] = yearMonthStr.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const numDays = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    return { numDays, startDayOfWeek };
}

function getWeekIndexForDay(day, numDays, startDayOfWeek) {
    const totalIndex = startDayOfWeek + day - 1;
    const weekIdx = Math.floor(totalIndex / 7);
    return weekIdx;
}

function getDisciplineDetails(discId) {
    const disc = mockDisciplinas.find(d => d.id === discId);
    if (!disc) return { nome: "Disciplina Geral", curso: "Curso Geral", colegiado: "IFAP" };
    
    const courseId = disc.cursosIds && disc.cursosIds[0];
    const course = mockCursosCadastrados.find(c => c.id === courseId);
    let cursoNome = course ? course.nome : "Curso Técnico";
    let colegiadoSigla = "IFAP";
    
    if (course) {
        if (course.vinculo === 'DEPPI') {
            colegiadoSigla = 'DEPPI';
        } else {
            const col = mockColegiados.find(co => co.id === course.vinculoId);
            if (col) colegiadoSigla = col.sigla;
        }
    }
    
    return {
        nome: disc.nome,
        curso: cursoNome,
        colegiado: colegiadoSigla
    };
}

function getProfessorScheduleAndFaults(profId, dateStr) {
    const prof = mockProfessores.find(p => p.id == profId);
    if (!prof) return { scheduledHours: 0, faultsCount: 0, classes: [] };

    let discIds = prof.disciplinas || [];
    if (discIds.length === 0) {
        discIds = [profId % 3 + 1];
    }

    const d = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const dayOfMonth = d.getDate();
    const monthStr = dateStr.substring(0, 7);

    const classes = [];
    let scheduledHours = 0;
    let faultsCount = 0;

    discIds.forEach((discId, index) => {
        let hours = 0;
        if (index === 0) {
            if (dayOfWeek === 1) hours = 2;
            else if (dayOfWeek === 3) hours = 2;
            else if (dayOfWeek === 5) hours = 3;
        } else if (index === 1) {
            if (dayOfWeek === 2) hours = 2;
            else if (dayOfWeek === 4) hours = 2;
        } else {
            if (dayOfWeek === 5) hours = 2;
        }

        if (hours > 0) {
            let faults = 0;
            if (monthStr === '2026-06') {
                if (profId == 1) {
                    if (discId === 1) {
                        if (dayOfMonth === 3) faults = 2;
                        if (dayOfMonth === 5) faults = 3;
                    } else if (discId === 2) {
                        if (dayOfMonth === 16) faults = 2;
                        if (dayOfMonth === 18) faults = 2;
                    }
                } else if (profId == 5) {
                    if (discId === 1) {
                        if (dayOfMonth === 5) faults = 3;
                        if (dayOfMonth === 8) faults = 2;
                        if (dayOfMonth === 12) faults = 3;
                        if (dayOfMonth === 17) faults = 2;
                        if (dayOfMonth === 22) faults = 1;
                    }
                } else if (profId == 6) {
                    if (discId === 2) {
                        if (dayOfMonth === 2) faults = 2;
                        if (dayOfMonth === 4) faults = 2;
                        if (dayOfMonth === 9) faults = 2;
                        if (dayOfMonth === 11) faults = 2;
                        if (dayOfMonth === 16) faults = 2;
                    }
                } else {
                    if (dayOfMonth === 10) faults = Math.min(hours, 1);
                }
            } else {
                if ((dayOfMonth + profId) % 7 === 0) {
                    faults = Math.min(hours, 1);
                }
            }

            // Check real ronda registered absences (marked by fiscal)
            const rondaAbsence = appState.rondaAbsences && appState.rondaAbsences[`${profId}_${dateStr}`];
            if (rondaAbsence) {
                if (rondaAbsence !== 'presente') {
                    faults = hours;
                }
            }

            // Check coordinator corrections (takes precedence)
            if (appState.correcoesPresenca && appState.correcoesPresenca[`${profId}_${dateStr}`] === 'presente') {
                faults = 0;
            }

            scheduledHours += hours;
            faultsCount += faults;
            classes.push({
                disciplineId: discId,
                hours: hours,
                faults: faults
            });
        }
    });

    return { scheduledHours, faultsCount, classes };
}

function getProfessorMonthlyDetails(profId, monthStr) {
    const { numDays, startDayOfWeek } = getMonthCalendarData(monthStr);
    let totalFaults = 0;
    const dayData = {};
    const disciplineFaults = {};
    const disciplineWeeklyHours = {};

    for (let day = 1; day <= numDays; day++) {
        const dateStr = `${monthStr}-${day.toString().padStart(2, '0')}`;
        const dayInfo = getProfessorScheduleAndFaults(profId, dateStr);
        dayData[day] = dayInfo;
        totalFaults += dayInfo.faultsCount;

        dayInfo.classes.forEach(c => {
            if (!disciplineFaults[c.disciplineId]) disciplineFaults[c.disciplineId] = 0;
            disciplineFaults[c.disciplineId] += c.faults;

            if (!disciplineWeeklyHours[c.disciplineId]) disciplineWeeklyHours[c.disciplineId] = 0;
            disciplineWeeklyHours[c.disciplineId] = Math.max(disciplineWeeklyHours[c.disciplineId], c.hours);
        });
    }

    const totalIndexForLastDay = startDayOfWeek + numDays - 1;
    const numWeeks = Math.ceil((totalIndexForLastDay + 1) / 7);

    const disciplinesList = [];
    const prof = mockProfessores.find(p => p.id == profId);
    let discIds = prof ? (prof.disciplinas || []) : [];
    if (discIds.length === 0) {
        discIds = [profId % 3 + 1];
    }

    discIds.forEach(discId => {
        const totalDiscFaults = disciplineFaults[discId] || 0;
        let weeklyHours = disciplineWeeklyHours[discId] || 2;
        if (weeklyHours === 0) weeklyHours = 2;

        const weeksDots = [];
        for (let w = 0; w < numWeeks; w++) {
            weeksDots.push([]);
        }

        for (let day = 1; day <= numDays; day++) {
            const weekIdx = getWeekIndexForDay(day, numDays, startDayOfWeek);
            const dayInfo = dayData[day];
            const c = dayInfo.classes.find(cls => cls.disciplineId === discId);
            if (c) {
                for (let h = 0; h < c.hours; h++) {
                    if (h < c.faults) {
                        weeksDots[weekIdx].push({ type: 'red', day: day });
                    } else {
                        weeksDots[weekIdx].push({ type: 'green', day: day });
                    }
                }
            }
        }

        for (let w = 0; w < numWeeks; w++) {
            if (weeksDots[w].length > 4) {
                weeksDots[w] = weeksDots[w].slice(0, 4);
            }
        }

        const details = getDisciplineDetails(discId);
        disciplinesList.push({
            id: discId,
            nome: details.nome,
            curso: details.curso,
            colegiado: details.colegiado,
            totalFaults: totalDiscFaults,
            weeksDots: weeksDots
        });
    });

    return {
        totalFaults,
        dayData,
        disciplinesList,
        numWeeks,
        numDays,
        startDayOfWeek
    };
}

window.selectCalendarDay = function(day, faultsCount) {
    appState.selectedDayDetail = day;
    if (faultsCount > 0) {
        appState.highlightedDay = day;
        
        // Scroll to the first highlighted discipline row and vibrate
        setTimeout(() => {
            const firstAffected = document.querySelector('.shake-highlight');
            if (firstAffected) {
                firstAffected.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 120);

        // Keep shake active for 1.5 seconds, then clear highlightedDay (which stops shake) but keep selection
        setTimeout(() => {
            appState.highlightedDay = null;
            render();
        }, 1500);
    } else {
        appState.highlightedDay = null;
    }
    render();
}

window.openProfScheduleModal = function() {
    appState.modalProfessorSchedule = true;
    render();
}

window.closeProfScheduleModal = function() {
    appState.modalProfessorSchedule = false;
    render();
}

function renderModalProfSchedule() {
    if (!appState.modalProfessorSchedule) return '';
    const prof = mockProfessores.find(p => p.id == appState.selectedChefiado);
    if (!prof) return '';

    let discIds = prof.disciplinas || [];
    if (discIds.length === 0) {
        discIds = [prof.id % 3 + 1];
    }

    const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
    const rowsHtml = days.map((dayName, dIdx) => {
        const dayOfWeek = dIdx + 1; // 1 = Mon
        let scheduleItems = [];
        
        discIds.forEach((discId, index) => {
            let hours = 0;
            if (index === 0) {
                if (dayOfWeek === 1) hours = 2;
                else if (dayOfWeek === 3) hours = 2;
                else if (dayOfWeek === 5) hours = 3;
            } else if (index === 1) {
                if (dayOfWeek === 2) hours = 2;
                else if (dayOfWeek === 4) hours = 2;
            } else {
                if (dayOfWeek === 5) hours = 2;
            }
            if (hours > 0) {
                const details = getDisciplineDetails(discId);
                scheduleItems.push(`<strong>${details.nome}</strong> (${hours} horas) - ${details.curso}`);
            }
        });

        return `
            <div style="padding: 0.8rem; border-bottom: 1px solid var(--border-color); display: grid; grid-template-columns: 140px 1fr; align-items: center;">
                <div style="font-weight: 700; color: var(--if-green);">${dayName}</div>
                <div>${scheduleItems.join('<br>') || '<span style="color: var(--text-muted); font-style: italic;">Sem aulas programadas</span>'}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="modal-overlay animate-fade-in" onclick="closeProfScheduleModal()">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 600px;">
                <div class="modal-header" style="background: #ECFDF5; border-bottom-color: #A7F3D0;">
                    <h3 style="color: #065F46;">📅 Grade Semanal do Professor</h3>
                    <button class="close-btn" style="color: #065F46;" onclick="closeProfScheduleModal()">✕</button>
                </div>
                <div class="modal-body" style="padding: 1.5rem 2rem;">
                    <h4 style="margin-bottom: 1rem; color: var(--text-main);">${prof.nome}</h4>
                    <div style="display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderMod6Topbar(title, subtitle, showBack = true) {
    let backBtnHtml = '';
    if (showBack && appState.currentProfile !== 'COORD_COLEGIADO') {
        backBtnHtml = `
            <button class="icon-btn-back" onclick="clearChechefiadosNivel0 ? clearChefiadosNivel0() : clearChefiadosNivel0()" style="background: #F1F5F9; border: none; padding: 0.5rem; border-radius: 50%; cursor: pointer; margin-right: 1rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
        `;
    }

    // fallback check in case clearChefiadosNivel0 is not called
    const backCall = showBack ? `onclick="clearChefiadosNivel0()"` : '';

    return `
        <div class="diario-header" style="flex-direction: column; align-items: flex-start; gap: 1rem; border-bottom: none; padding-bottom: 0;">
            <div style="display: flex; align-items: center;">
                ${showBack ? `
                    <button class="icon-btn-back" ${backCall} style="background: #F1F5F9; border: none; padding: 0.5rem; border-radius: 50%; cursor: pointer; margin-right: 1rem;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                ` : ''}
                <div>
                    <h2 style="margin:0; color: var(--text-main); font-size: 1.5rem;">${title}</h2>
                    ${subtitle ? `<div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">${subtitle}</div>` : ''}
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; background: #F8FAFC; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <div style="font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
                    <span>📅 Filtro por Mês:</span>
                </div>
                
                <div class="date-selector-wrapper" style="margin: 0; background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.3rem 0.5rem; display: flex; align-items: center;">
                    <button class="btn-date-arrow" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);" onclick="changeSelectedMonth(-1)">&lt;</button>
                    <div class="date-display" onclick="document.getElementById('hidden-month-input-mod6').showPicker()" style="font-weight: 600; cursor: pointer; padding: 0 1rem; position: relative; color: var(--if-green);">
                        ${getSelectedMonthName()}
                        <input type="month" id="hidden-month-input-mod6" value="${appState.selectedMonth}" onchange="selectSelectedMonth(this.value)" style="opacity:0; position:absolute; z-index:-1; width:0; height:0;">
                    </div>
                    <button class="btn-date-arrow" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);" onclick="changeSelectedMonth(1)">&gt;</button>
                </div>
            </div>
        </div>
    `;
}

function renderChefiadosTelaZero() {
    // Calculate dynamic faults for each card for selectedMonth
    const getColegiadoFaults = (vinculoId) => {
        const profs = mockProfessores.filter(p => p.vinculo === 'Colegiado' && p.vinculoId === vinculoId);
        let total = 0;
        profs.forEach(p => {
            total += getProfessorMonthlyDetails(p.id, appState.selectedMonth).totalFaults;
        });
        return total;
    };

    const cardsWithDynamicData = mockNivel0Cards.map(c => {
        let totalFaltas = 0;
        if (c.id === 'C_1') totalFaltas = getColegiadoFaults(1);
        else if (c.id === 'C_2') totalFaltas = getColegiadoFaults(2);
        else if (c.id === 'C_3') totalFaltas = getColegiadoFaults(3);
        else if (c.id === 'FIC') {
            totalFaltas = appState.selectedMonth === '2026-06' ? 1 : 0;
        } else if (c.id === 'POS') {
            totalFaltas = appState.selectedMonth === '2026-06' ? 0 : 0;
        }

        let status = 'verde';
        if (totalFaltas > 5) status = 'vermelho';
        else if (totalFaltas > 0) status = 'amarelo';

        return { ...c, faltas: totalFaltas, status };
    });

    const cardsHtml = cardsWithDynamicData.map(c => {
        let borderColor = 'var(--if-green)';
        let statusBadge = `<span style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">OK</span>`;
        let faultsText = `<span style="color: var(--if-green); font-weight: 800; font-size: 1.8rem;">0</span> <span style="color: var(--text-muted); font-size: 0.9rem;">faltas</span>`;
        
        if (c.status === 'vermelho') {
            borderColor = 'var(--if-red)';
            statusBadge = `<span style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; animation: pulseGlow 1s infinite alternate;">ALERTA</span>`;
            faultsText = `<span style="color: var(--if-red); font-weight: 800; font-size: 1.8rem;">${c.faltas}</span> <span style="color: var(--if-red); font-weight: 700; font-size: 0.9rem;">faltas</span>`;
        } else if (c.status === 'amarelo') {
            borderColor = '#D69E2E';
            statusBadge = `<span style="background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">ATENÇÃO</span>`;
            faultsText = `<span style="color: #D69E2E; font-weight: 800; font-size: 1.8rem;">${c.faltas}</span> <span style="color: #D69E2E; font-weight: 700; font-size: 0.9rem;">faltas</span>`;
        }
        
        return `
            <div class="prof-coord-card animate-fade clickable-card" onclick="selectChefiadosNivel0('${c.id}')" style="border: 2px solid ${borderColor}; min-height: 200px; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; text-align: left;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <div style="font-size: 2.2rem; background: #F8FAFC; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid var(--border-color);">${c.icone}</div>
                    ${statusBadge}
                </div>
                <div style="margin-top: 1rem; margin-bottom: auto;">
                    <h3 style="font-size: 1.15rem; color: var(--text-main); font-weight: 700; margin: 0;">${c.nome}</h3>
                    <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">${c.tipo}</div>
                </div>
                <div style="margin-top: 1rem; width: 100%; border-top: 1px solid var(--border-color); padding-top: 0.8rem; display: flex; justify-content: space-between; align-items: center; min-height: 40px;">
                    <div>${faultsText}</div>
                    <div style="color: var(--if-green); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Painel ➔</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%; padding: 1.5rem; background: #F8FAFC;">
            ${renderMod6Topbar('👥 Painel de Chefiados', 'Visão Global do Campus', false)}
            <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 1.5rem; padding-left: 0.5rem; margin-top: 1.5rem;">
                Selecione o colegiado ou núcleo para acompanhar o desempenho e as faltas dos servidores alocados.
            </p>
            <div class="cursos-coord-grid">
                ${cardsHtml}
            </div>
        </div>
    `;
}

function renderCoordChefiados() {
    let painelHtml = '';
    const maxAulasMes = 20;
    
    let vinculoFiltroId = 1; // Default
    let macroAreaName = 'Colegiado de Agropecuária';
    let coordName = 'Coordenador não definido';

    if (appState.currentProfile !== 'COORD_COLEGIADO' && appState.chefiadosNivel0) {
        const c = mockNivel0Cards.find(card => card.id === appState.chefiadosNivel0);
        if (c) macroAreaName = c.nome;
        
        if (appState.chefiadosNivel0 === 'C_1') vinculoFiltroId = 1;
        if (appState.chefiadosNivel0 === 'C_2') vinculoFiltroId = 2;
        if (appState.chefiadosNivel0 === 'C_3') vinculoFiltroId = 3;
    }

    const colegiadoObj = mockColegiados.find(c => c.id === vinculoFiltroId);
    if (colegiadoObj && colegiadoObj.coordenadorId) {
        const profCoord = mockProfessores.find(p => p.id === colegiadoObj.coordenadorId);
        if (profCoord) coordName = 'Coordenador: ' + profCoord.nome;
    }

    const filteredPendencias = (appState.rondaPendencias || []).filter(pend => {
        const prof = mockProfessores.find(p => p.id === pend.profId);
        if (!prof) return false;
        return prof.vinculo === 'Colegiado' && prof.vinculoId === vinculoFiltroId;
    });

    if (appState.selectedChefiado === 'GERAL') {
        let mainContentHtml = '';

        if (appState.chefiadosTab === 'CARDS') {
            const graficos = mockProfessores.filter(p => p.vinculo === 'Colegiado' && p.vinculoId === vinculoFiltroId).map(prof => {
                const monthlyInfo = getProfessorMonthlyDetails(prof.id, appState.selectedMonth);
                const chartHtml = renderDoughnutChart('', monthlyInfo.totalFaults, maxAulasMes);
                return `
                    <div class="prof-coord-card animate-fade clickable-card" onclick="selectChefiado('${prof.id}')">
                        <div class="prof-card-title">${prof.nome}</div>
                        <div class="prof-card-chart">${chartHtml}</div>
                        <div class="prof-card-subtitle" style="font-weight: 700; margin-top: 0.5rem;">${monthlyInfo.totalFaults} faltas em ${getSelectedMonthOnlyName()}</div>
                        <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.5rem; text-align: center; border-top: 1px solid var(--border-color); padding-top: 0.5rem; width: 100%;">Clique para ver calendário ➔</div>
                    </div>
                `;
            }).join('');
            
            mainContentHtml = `
                <div class="cursos-coord-grid">
                    ${graficos || '<p style="color: var(--text-muted);">Nenhum professor encontrado neste colegiado.</p>'}
                </div>
            `;
        } else {
            if (filteredPendencias.length === 0) {
                mainContentHtml = `
                    <div style="text-align: center; padding: 3rem; background: white; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
                        <span style="font-size: 3rem;">🎉</span>
                        <h3 style="margin-top: 1rem; color: var(--text-main);">Nenhuma pendência pendente</h3>
                        <p style="color: var(--text-muted); margin-top: 0.5rem;">Todas as ausências reportadas pela Ronda da fiscalização já foram tratadas.</p>
                    </div>
                `;
            } else {
                const groups = {};
                filteredPendencias.forEach(p => {
                    if (!groups[p.data]) groups[p.data] = [];
                    groups[p.data].push(p);
                });
                const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
                
                const listHtml = sortedDates.map(dateStr => {
                    const [y, m, d] = dateStr.split('-');
                    const formattedDate = `${d}/${m}/${y}`;
                    
                    const itemsHtml = groups[dateStr].map(pend => {
                        const prof = mockProfessores.find(p => p.id === pend.profId);
                        const profNome = prof ? prof.nome : 'Professor';
                        const sala = mockSalasManha.find(s => s.id === pend.salaId);
                        const salaNome = sala ? sala.nome : `Sala ${pend.salaId}`;
                        const cursoNome = sala ? `${sala.curso} (${sala.ano})` : '';

                        return `
                            <div class="pendencia-row animate-fade" style="display: flex; align-items: center; justify-content: space-between; padding: 1.2rem; background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); margin-bottom: 0.8rem;">
                                <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                                    <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">${profNome}</div>
                                    <div style="font-size: 0.9rem; color: var(--text-muted);">
                                        📍 <strong>${salaNome}</strong> - ${cursoNome} &nbsp;|&nbsp; 🕒 <strong>${timeSlots[pend.slotIdx]}</strong> (${pend.turno})
                                    </div>
                                    <div style="margin-top: 0.3rem;">
                                        <span class="status-badge" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 600;">Ausência sem Substituição Registrada</span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 0.8rem; align-items: center;">
                                    <button class="nav-btn-green" onclick="corrigirParaPresente('${pend.id}')">
                                        ✅ Corrigir para Presente
                                    </button>
                                    <button class="nav-btn-outline-red" onclick="confirmarFaltaPendencia('${pend.id}')">
                                        ❌ Confirmar Falta
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div style="margin-bottom: 2rem;">
                            <div style="font-weight: 700; color: var(--text-muted); font-size: 1rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.4rem; margin-bottom: 0.8rem;">
                                📅 Ronda do dia ${formattedDate}
                            </div>
                            ${itemsHtml}
                        </div>
                    `;
                }).join('');

                mainContentHtml = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${listHtml}
                    </div>
                `;
            }
        }

        const tabsHtml = `
            <div style="display: flex; gap: 1rem; border-bottom: 2px solid var(--border-color); margin-top: 1.5rem; margin-bottom: 1.5rem;">
                <button class="coord-tab" style="border: none; background: none; padding: 0.8rem 1.2rem; font-weight: 600; cursor: pointer; border-bottom: 3px solid ${appState.chefiadosTab === 'CARDS' ? 'var(--if-green)' : 'transparent'}; color: ${appState.chefiadosTab === 'CARDS' ? 'var(--if-green)' : 'var(--text-muted)'};" onclick="window.changeChefiadosTab('CARDS')">
                    👥 Professores Chefiados
                </button>
                <button class="coord-tab" style="border: none; background: none; padding: 0.8rem 1.2rem; font-weight: 600; cursor: pointer; border-bottom: 3px solid ${appState.chefiadosTab === 'PENDENCIAS' ? 'var(--if-green)' : 'transparent'}; color: ${appState.chefiadosTab === 'PENDENCIAS' ? 'var(--if-green)' : 'var(--text-muted)'}; position: relative;" onclick="window.changeChefiadosTab('PENDENCIAS')">
                    🔔 Pendências da Ronda
                    ${filteredPendencias.length > 0 ? `<span style="background: var(--if-red); color: white; border-radius: 50%; padding: 0.1rem 0.4rem; font-size: 0.75rem; margin-left: 0.3rem;">${filteredPendencias.length}</span>` : ''}
                </button>
            </div>
        `;

        painelHtml = `
            ${renderMod6Topbar(macroAreaName, coordName, true)}
            ${tabsHtml}
            ${mainContentHtml}
        `;
    } else {
        const prof = mockProfessores.find(p => p.id == appState.selectedChefiado);
        const monthlyInfo = getProfessorMonthlyDetails(prof.id, appState.selectedMonth);

        // Render Calendar Days
        const calendarDaysHtml = [];
        // Add empty slots for starting day of week
        for (let i = 0; i < monthlyInfo.startDayOfWeek; i++) {
            calendarDaysHtml.push(`<div class="day-empty-slot"></div>`);
        }

        // Add calendar day cells
        for (let day = 1; day <= monthlyInfo.numDays; day++) {
            const dayInfo = monthlyInfo.dayData[day];
            let dayClass = 'day-empty'; // neutral
            let fractionHtml = '';

            if (dayInfo.scheduledHours > 0) {
                if (dayInfo.faultsCount > 0) {
                    dayClass = 'day-fault';
                } else {
                    dayClass = 'day-present';
                }
                fractionHtml = `
                    <div class="day-fraction">
                        <span class="num-faults">${dayInfo.faultsCount}</span>/<span class="num-total">${dayInfo.scheduledHours}</span>
                    </div>
                `;
            }

            const isSelected = appState.selectedDayDetail === day ? 'day-selected' : '';

            calendarDaysHtml.push(`
                <div class="calendar-day-cell ${dayClass} ${isSelected}" onclick="selectCalendarDay(${day}, ${dayInfo.faultsCount})">
                    <div class="day-num">${day}</div>
                    ${fractionHtml}
                </div>
            `);
        }

        // Selected Day info bar
        let dayDetailBarHtml = '';
        if (appState.selectedDayDetail) {
            const selDay = appState.selectedDayDetail;
            const selDayInfo = monthlyInfo.dayData[selDay];
            if (selDayInfo.scheduledHours > 0) {
                dayDetailBarHtml = `
                    <div style="background: #EFF6FF; border: 1px solid #93C5FD; color: #1E40AF; padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>Dia ${selDay} de ${getSelectedMonthOnlyName()}</strong>: 
                            ${selDayInfo.faultsCount > 0 
                                ? `<span style="color: var(--if-red); font-weight:700;">${selDayInfo.faultsCount} faltas registradas</span> em ${selDayInfo.scheduledHours} aulas programadas.` 
                                : `Presença confirmada em todas as ${selDayInfo.scheduledHours} aulas.`}
                        </div>
                        <button onclick="appState.selectedDayDetail = null; render();" style="background:none; border:none; color:#1E40AF; font-weight:700; cursor:pointer;">Limpar seleção ×</button>
                    </div>
                `;
            }
        }

        // Render Disciplines list
        const weekOfSelectedDay = appState.selectedDayDetail ? getWeekIndexForDay(appState.selectedDayDetail, monthlyInfo.numDays, monthlyInfo.startDayOfWeek) : -1;
        
        let disciplinasRowsHtml = '<p style="color: var(--text-muted); padding: 2rem; text-align: center;">Nenhum dado de disciplina encontrado para este período.</p>';
        if (monthlyInfo.disciplinesList.length > 0) {
            disciplinasRowsHtml = monthlyInfo.disciplinesList.map(disc => {
                // Check if this discipline had a fault on the highlightedDay
                let isHighlighted = false;
                if (appState.highlightedDay) {
                    const hDayInfo = monthlyInfo.dayData[appState.highlightedDay];
                    const discClass = hDayInfo.classes.find(c => c.disciplineId === disc.id);
                    if (discClass && discClass.faults > 0) {
                        isHighlighted = true;
                    }
                }

                // Check if the selectedDay has a fault in this discipline (to pulse the dots in that week)
                let isPulseWeekForThisDisc = false;
                let isTaughtOnSelectedDay = false;
                if (appState.selectedDayDetail) {
                    const sDayInfo = monthlyInfo.dayData[appState.selectedDayDetail];
                    const discClass = sDayInfo.classes.find(c => c.disciplineId === disc.id);
                    if (discClass) {
                        if (discClass.faults > 0) {
                            isPulseWeekForThisDisc = true;
                        }
                        if (discClass.hours > 0) {
                            isTaughtOnSelectedDay = true;
                        }
                    }
                }

                // Render weekly columns
                const weeklyColsHtml = disc.weeksDots.map((dots, wIdx) => {
                    const isSelectedWeek = wIdx === weekOfSelectedDay;
                    const pulseThisWeek = isSelectedWeek && isPulseWeekForThisDisc;

                    const dotsHtml = dots.map(dot => {
                        const isRed = dot.type === 'red';
                        const dotClass = isRed ? 'dot-red' : 'dot-green';
                        const pulseClass = (isRed && pulseThisWeek) ? 'pulse-glow' : '';
                        
                        return `<div class="spark-dot ${dotClass} ${pulseClass}" title="${isRed ? 'Falta no dia ' + dot.day : 'Presença'}"></div>`;
                    }).join('');

                    return `
                        <div class="discipline-week-col ${isSelectedWeek ? 'selected-week-col' : ''}">
                            <div class="week-title">Semana ${wIdx + 1}</div>
                            <div class="week-dots">
                                ${dotsHtml || '<span style="color:#94A3B8; font-size:0.7rem; font-weight:500;">Sem aula</span>'}
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="discipline-row-custom ${isHighlighted ? 'shake-highlight' : ''} ${isTaughtOnSelectedDay ? 'blue-highlight-row' : ''}" style="transition: all 0.3s ease;">
                        <div>
                            <div class="disciplina-nome" style="font-size: 1.15rem; color: var(--text-main); font-weight: 700;">${disc.nome}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.3rem;">
                                ${disc.curso} &nbsp;&bull;&nbsp; <span class="colegiado-highlight">${disc.colegiado}</span>
                            </div>
                        </div>
                        <div class="discipline-fault-total-cell">
                            <div class="discipline-fault-total-title">Faltas no Mês</div>
                            <div class="discipline-fault-total-number ${disc.totalFaults > 0 ? 'text-red' : 'text-green'}">
                                ${disc.totalFaults}
                            </div>
                        </div>
                        <div class="discipline-weeks-grid">
                            ${weeklyColsHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        painelHtml = `
            <!-- Custom Header -->
            <div class="diario-header" style="display: flex; align-items: center; gap: 1rem; border-bottom: none; padding-bottom: 0;">
                <button class="icon-btn-back" onclick="selectChefiado('GERAL')">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div>
                    <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--if-green);">${getSelectedMonthName()}</h2>
                    <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-top: 0.2rem;">Professor: ${prof.nome}</div>
                </div>
            </div>

            <!-- Custom Prominent Buttons -->
            <div class="mod6-actions-row">
                <button class="btn-mod6-action primary" onclick="openMod6Modal('ANTECIPACAO')">
                    ⚡ Registrar Ocorrência Antecipada
                </button>
                <button class="btn-mod6-action secondary" onclick="openProfScheduleModal()">
                    👁️ Ver Horário Semanal do Professor
                </button>
            </div>

            <!-- Monthly Calendar Section -->
            <h3 style="margin-bottom: 1rem; color: var(--text-main); font-size: 1.25rem; font-weight: 700;">Faltas e Presenças no Mês (Calendário)</h3>
            <div class="calendar-grid-container">
                <div class="calendar-weekdays">
                    <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                </div>
                <div class="calendar-days">
                    ${calendarDaysHtml.join('')}
                </div>
            </div>

            ${dayDetailBarHtml}

            <!-- Disciplines Matrix Section -->
            <h3 style="margin-bottom: 1rem; color: var(--text-main); font-size: 1.25rem; font-weight: 700;">Acompanhamento de Aulas e Faltas por Disciplina</h3>
            <div class="discipline-row-header">
                <div>Disciplina / Curso</div>
                <div>Faltas</div>
                <div style="text-align: center;">Horas Aula por Semana (Visualização de Presença)</div>
            </div>
            <div class="discipline-list-container" style="margin-top: 0.5rem;">
                ${disciplinasRowsHtml}
            </div>
        `;
    }

    return `
        <div class="coord-panel animate-fade" style="padding: 1.5rem;">
            ${painelHtml}
        </div>
        ${renderMod6Modals()}
        ${renderModalProfSchedule()}
    `;
}

window.openMod6Modal = function(modal) {
    appState.mod6Modal = modal;
    render();
}

window.closeMod6Modal = function() {
    appState.mod6Modal = null;
    render();
}

window.onChangeTipoAntecipacao = function() {
    const tipo = document.getElementById('tipoAntecipacao')?.value;
    if (tipo === 'SUBSTITUICAO') {
        document.getElementById('containerSubstituto').style.display = 'block';
        document.getElementById('containerMotivo').style.display = 'none';
    } else {
        document.getElementById('containerSubstituto').style.display = 'none';
        document.getElementById('containerMotivo').style.display = 'block';
    }
}

window.salvarAntecipacao = function() {
    const profId = appState.selectedChefiado;
    const data = document.getElementById('dataAntecipacao').value;
    const turno = document.getElementById('turnoAntecipacao').value;
    const slotIdx = document.getElementById('horarioAntecipacao').value; // '0', '1', 'ALL'
    const tipo = document.getElementById('tipoAntecipacao').value;
    const substitutoId = document.getElementById('substitutoAntecipacao').value;
    const motivo = document.getElementById('motivoAntecipacao').value;

    if (!data || !turno || !tipo) return alert("Preencha os campos obrigatórios");

    const slotsToUpdate = slotIdx === 'ALL' ? ['0', '1', '2', '3'] : [slotIdx];
    
    slotsToUpdate.forEach(idx => {
        const key = `${profId}_${data}_${turno}_${idx}`;
        appState.antecipacoes[key] = { tipo, substitutoId, motivo };
    });

    // Add to rondaAbsences if it's CHEFIA_CIENTE
    if (tipo === 'CHEFIA_CIENTE') {
        if (!appState.rondaAbsences) appState.rondaAbsences = {};
        appState.rondaAbsences[`${profId}_${data}`] = 'ausente_justificado';
    }

    closeMod6Modal();
    showToast("Ocorrência antecipada registrada com sucesso! A ronda já foi atualizada.");
    
    // Log audit
    const prof = mockProfessores.find(p => p.id == profId);
    const profNome = prof ? prof.nome : 'Professor';
    const activeUser = appState.currentProfile || 'Sistema';
    
    let details = "";
    if (tipo === 'SUBSTITUICAO') {
        const sub = mockProfessores.find(p => p.id == substitutoId);
        const subNome = sub ? sub.nome : 'Substituto';
        details = `Registrou permuta/substituição antecipada para o Prof. ${profNome} no dia ${data} (Turno ${turno}). Substituto: ${subNome}.`;
    } else {
        details = `Registrou aviso de falta antecipada (Chefia Ciente) para o Prof. ${profNome} no dia ${data} (Turno ${turno}). Motivo: ${motivo || 'Não informado'}.`;
    }
    registrarAcaoAuditoria(activeUser, "Ocorrência Antecipada", details);
}

function renderMod6Modals() {
    if (!appState.mod6Modal) return '';

    if (appState.mod6Modal === 'ANTECIPACAO') {
        const prof = mockProfessores.find(p => p.id == appState.selectedChefiado);
        const subOptions = mockProfessores.filter(p => p.id != appState.selectedChefiado).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

        // Timeout to run onChange logic
        setTimeout(() => window.onChangeTipoAntecipacao && window.onChangeTipoAntecipacao(), 10);

        return `
            <div class="modal-overlay animate-fade-in" onclick="closeMod6Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 500px;">
                    <div class="modal-header" style="background: #FEF3C7; color: #92400E;">
                        <h3>Registrar Ocorrência Antecipada</h3>
                        <button class="close-btn" style="color: #92400E;" onclick="closeMod6Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
                            Registrando para: <strong>${prof.nome}</strong>. Esta informação refletirá na Ronda do fiscal e no Diário de Cursos.
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            <div style="display: flex; gap: 1rem;">
                                <div style="flex: 1;">
                                    <label style="font-weight: 500; font-size: 0.9rem;">Data *</label>
                                    <input type="date" id="dataAntecipacao" value="${appState.currentDate}" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-weight: 500; font-size: 0.9rem;">Turno *</label>
                                    <select id="turnoAntecipacao" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                        <option value="Manhã" ${appState.coordShift === 'Manhã' ? 'selected' : ''}>Manhã</option>
                                        <option value="Tarde" ${appState.coordShift === 'Tarde' ? 'selected' : ''}>Tarde</option>
                                        <option value="Noite" ${appState.coordShift === 'Noite' ? 'selected' : ''}>Noite</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Qual horário?</label>
                                <select id="horarioAntecipacao" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="ALL">Todos os horários deste turno</option>
                                    <option value="0">1º Horário</option>
                                    <option value="1">2º Horário</option>
                                    <option value="2">3º Horário</option>
                                    <option value="3">4º Horário</option>
                                </select>
                            </div>

                            <hr style="border: none; border-top: 1px solid var(--border-color); margin: 0.5rem 0;" />

                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Tipo de Ocorrência *</label>
                                <select id="tipoAntecipacao" onchange="onChangeTipoAntecipacao()" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="CHEFIA_CIENTE">Aviso de Falta (Chefia Ciente)</option>
                                    <option value="SUBSTITUICAO">Permuta / Substituição Programada</option>
                                </select>
                            </div>

                            <div id="containerSubstituto" style="display: none;">
                                <label style="font-weight: 500; font-size: 0.9rem;">Quem assumirá a aula? *</label>
                                <select id="substitutoAntecipacao" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Selecione o Professor Substituto --</option>
                                    ${subOptions}
                                </select>
                            </div>

                            <div id="containerMotivo">
                                <label style="font-weight: 500; font-size: 0.9rem;">Motivo / Justificativa</label>
                                <textarea id="motivoAntecipacao" rows="3" placeholder="Ex: Problemas de saúde, atraso justificado..." style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;"></textarea>
                            </div>

                            <button class="nav-btn" style="width: 100%; margin-top: 1rem;" onclick="salvarAntecipacao()">Salvar Ocorrência</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return '';
}

function renderModalSemanal() {
    if (!appState.modalDisciplina) return '';
    const data = appState.modalDisciplina;
    
    const semanasHtml = data.semanas.map((status, index) => {
        const isPresent = status === 'presente';
        const color = isPresent ? 'var(--if-green)' : 'var(--if-red)';
        const text = isPresent ? 'Presente' : 'Ausente';
        const bg = isPresent ? '#F0FFF4' : '#FFF5F5';
        
        return `
            <div class="semana-row" style="background: ${bg}; border: 1px solid ${color};">
                <span class="semana-label">Semana ${index + 1}</span>
                <span class="semana-status" style="color: ${color};">${text}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="modal-overlay animate-fade-in" onclick="closeModal()">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3><span style="color: var(--text-muted); font-weight: 400;">Junho, 2026 |</span> ${data.nome}</h3>
                    <button class="close-btn" onclick="closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    ${semanasHtml}
                </div>
            </div>
        </div>
    `;
}



// MAIN RENDERER
function render() {
    let content = renderHeader();
    if (appState.screen === 'HOME_PROFILES') content += renderHomeProfiles();
    else if (appState.screen === 'TEACHER_VALIDATION') content += renderTeacherValidation();
    else if (appState.screen === 'ADMIN_PANEL') content += renderAdminPanel();
    
    if (appState.mustSetPassword) {
        content += renderForcePasswordModal();
    }
    
    appDiv.innerHTML = content;
}

// ACTIONS
window.navigate = function(screen) {
    appState.screen = screen;
    appState.toast = null;
    render();
}

window.logout = async function() {
    try {
        await Auth.logout();
    } catch (e) {
        console.error('Erro ao sair:', e);
    }
    appState.currentProfile = null;
    appState.activeModule = null;
    appState.userName = null;
    appState.userEmail = null;
    appState.userId = null;
    appState.loginError = '';
    navigate('HOME_PROFILES');
}

function renderForcePasswordModal() {
    return `
        <div class="modal-overlay animate-fade-in" style="background: rgba(0,0,0,0.85); z-index: 99999;">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 450px;">
                <div class="modal-header">
                    <h3 style="color: var(--if-green);">🔐 Definição de Senha Definitiva</h3>
                </div>
                <div class="modal-body">
                    <p style="font-size: 0.95rem; color: var(--text-main); margin-bottom: 1.5rem; line-height: 1.5;">Você acessou através do Link Mágico. Para garantir a segurança desta conta institucional, é obrigatório definir uma senha definitiva agora.</p>
                    <form onsubmit="window.submitForcePassword(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label style="font-weight: 500; font-size: 0.9rem;">Nova Senha</label>
                            <input type="password" id="fpNewPassword" required minlength="6" placeholder="Mínimo 6 caracteres" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                        </div>
                        <div>
                            <label style="font-weight: 500; font-size: 0.9rem;">Confirmar Nova Senha</label>
                            <input type="password" id="fpConfirmPassword" required minlength="6" placeholder="Repita a senha" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                        </div>
                        <button type="submit" id="fpSubmitBtn" class="nav-btn" style="width: 100%; margin-top: 1rem;">Salvar Senha e Continuar</button>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.submitForcePassword = async function(e) {
    e.preventDefault();
    const p1 = document.getElementById('fpNewPassword').value;
    const p2 = document.getElementById('fpConfirmPassword').value;
    const btn = document.getElementById('fpSubmitBtn');
    
    if (p1 !== p2) {
        alert('As senhas não coincidem!');
        return;
    }
    
    try {
        btn.disabled = true;
        btn.innerText = 'Salvando...';
        
        const { error } = await supabaseClient.auth.updateUser({ password: p1 });
        if (error) throw error;
        
        alert('Senha definida com sucesso!');
        appState.mustSetPassword = false;
        
        if (window.history.replaceState) {
            window.history.replaceState(null, null, window.location.pathname);
        }
        
        render();
    } catch(err) {
        alert('Erro ao definir senha: ' + err.message);
        btn.disabled = false;
        btn.innerText = 'Salvar Senha e Continuar';
    }
}

window.openRegisterModal = function() {
    appState.modalRegister = true;
    render();
}

window.closeRegisterModal = function() {
    appState.modalRegister = false;
    render();
}

window.submitRegister = async function(e) {
    e.preventDefault();
    const nome = document.getElementById('regNome').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;
    const perfil = document.getElementById('regPerfil').value;
    const siape = document.getElementById('regSiape').value.trim();

    try {
        // 1. Cria a conta no Auth do Supabase
        const authData = await Auth.signUp(email, password, nome);
        
        // 2. Insere na tabela usuarios com status PENDENTE
        const authUserId = authData.user ? authData.user.id : null;
        
        await DB.usuarios.create({
            nome: nome,
            email: email,
            perfil: perfil,
            siape: siape,
            tipo_conta: 'PESSOAL',
            status_cadastro: 'PENDENTE',
            auth_id: authUserId
        });

        alert("Seu cadastro foi submetido com sucesso! Você poderá entrar no sistema assim que a Direção Geral aprovar sua conta.");
        window.closeRegisterModal();
    } catch(err) {
        console.error("Erro no cadastro:", err);
        let errorMsg = err.message;
        if (errorMsg.includes('For security purposes, you can only request this after')) {
            errorMsg = "Por motivos de segurança, aguarde alguns segundos antes de tentar criar outra conta.";
        }
        alert("Ocorreu um erro ao criar a conta: " + errorMsg);
    }
}

window.openPrimeiroAcesso = function(e) {
    if(e) e.preventDefault();
    appState.modalPrimeiroAcesso = true;
    render();
}

window.closePrimeiroAcesso = function() {
    appState.modalPrimeiroAcesso = false;
    render();
}

window.handlePrimeiroAcesso = async function(e) {
    e.preventDefault();
    const email = document.getElementById('paEmail').value.trim();
    const siape = document.getElementById('paSiape').value.trim();
    const btn = document.getElementById('paSubmitBtn');
    
    try {
        btn.disabled = true;
        btn.innerText = 'Validando SIAPE...';
        
        const { data: servidores, error: errSrv } = await supabaseClient.from('servidores').select('id, siape').eq('siape', siape);
        if (errSrv) throw errSrv;
        
        if (!servidores || servidores.length === 0) {
            throw new Error('Acesso Negado: SIAPE inválido ou Servidor não encontrado.');
        }
        const servidorId = servidores[0].id;
        
        const { data: usuario, error: errUsu } = await supabaseClient.from('usuarios').select('*').eq('email', email).maybeSingle();
        if (errUsu) throw errUsu;
        
        if (!usuario) {
            throw new Error('Acesso Negado: E-mail não está vinculado a nenhuma área (Coordenação/Instância). O Diretor precisa criar o vínculo primeiro.');
        }
        
        if (usuario.servidor_id !== servidorId) {
            throw new Error('Acesso Negado: A sua Matrícula SIAPE não foi designada como responsável por este E-mail Institucional.');
        }
        
        btn.innerText = 'Enviando Link Mágico...';
        
        const { data, error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: { shouldCreateUser: true }
        });
        
        if (error) throw error;
        
        alert('✔️ Acesso Autorizado! Um link mágico foi enviado para o e-mail: ' + email + '\\n\\nPor favor, abra este e-mail oficial para entrar no sistema e definir sua senha definitiva.');
        window.closePrimeiroAcesso();
        
    } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao processar solicitação.');
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerText = 'Solicitar Link de Acesso';
        }
    }
}

window.handleLogin = async function(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    appState.loginLoading = true;
    appState.loginError = '';
    render();

    try {
        const authData = await Auth.login(email, password);
        
        // Buscar perfil do usuário na tabela usuarios
        const userProfile = await Auth.getUserProfileByEmail(email);
        
        if (!userProfile) {
            appState.loginLoading = false;
            appState.loginError = 'Usuário não encontrado no sistema. Contate o administrador.';
            render();
            return;
        }

        // Carregar todos os dados do banco
        await loadAllDataFromDB();

        // Configurar estado do app
        appState.userName = userProfile.nome;
        appState.userEmail = userProfile.email;
        appState.userId = userProfile.id;
        appState.loginLoading = false;
        appState.loginError = '';

        // Selecionar perfil automaticamente
        window.selectProfile(userProfile.perfil);
    } catch (err) {
        console.error('Erro no login:', err);
        appState.loginLoading = false;
        appState.loginError = err.message === 'Invalid login credentials' 
            ? 'E-mail ou senha incorretos.' 
            : 'Erro ao conectar. Verifique sua internet e tente novamente.';
        render();
    }
}

window.selectProfile = function(profileId) {
    appState.currentProfile = profileId;
    
    // Identificar módulos permitidos para este perfil
    const allowedModules = Object.keys(MODULOS_INFO).filter(modId => {
        const perms = appState.permissions[modId];
        return perms && perms.includes(profileId);
    });

    if (allowedModules.length === 0) {
        alert('Seu perfil não tem acesso a nenhum módulo no momento. Contate o Diretor Geral.');
        return;
    }

    // Perfis com módulo principal fixo (não o primeiro da lista)
    const moduloPrincipal = {
        'FISCAL':          'MOD_5',
        'COORD_COLEGIADO': 'MOD_6',
        'DEN':             'MOD_7',
        'COGEN':           'MOD_7',
        'COPED':           'MOD_COPED',
        'SERVIDOR':        'MOD_SERVIDOR',
        'SUPER_ADMIN':     'MOD_SUPER',
        'DIR_GERAL':       'MOD_8',
        'ESTAGIARIO':      'MOD_1',
    };

    const moduloInicial = moduloPrincipal[profileId] || allowedModules[0];
    // Garante que o módulo inicial está na lista de permitidos
    appState.activeModule = allowedModules.includes(moduloInicial) ? moduloInicial : allowedModules[0];

    // Fiscal precisa escolher turno antes da ronda
    if (appState.activeModule === 'MOD_5' && !appState.selectedShift) {
        appState.activeModule = 'MOD_5_SETUP';
    }

    navigate('ADMIN_PANEL');
}

// Coord Actions
window.navigateCoordTab = function(tab) {
    appState.coordTab = tab;
    if(tab === 'CHEFIADOS' && appState.selectedChefiado !== 'GERAL') {
        appState.selectedChefiado = 'GERAL';
    }
    if(tab === 'CURSOS') {
        appState.coordCursoView = 'LIST';
    }
    render();
}

window.navigateCoordCursosList = function() {
    appState.coordCursoView = 'LIST';
    render();
}

window.navigateCoordCursoDetail = function(id) {
    appState.selectedCursoCoord = id;
    appState.coordCursoView = 'DETAIL';
    render();
}

window.selectCoordShift = function(shift) {
    appState.coordShift = shift;
    render();
}

window.selectChefiado = function(profId) {
    appState.selectedChefiado = profId;
    render();
}

window.openModalDisciplina = function(profId, discIdx) {
    const prof = mockProfessores.find(p => p.id == profId);
    const stats = mockChefiadosStats[profId];
    if (stats && stats.disciplinas && stats.disciplinas[discIdx]) {
        appState.modalDisciplina = stats.disciplinas[discIdx];
        render();
    }
}

window.closeModal = function() {
    appState.modalDisciplina = null;
    render();
}

// Fiscal Actions
window.selectShift = function(shift) {
    appState.selectedShift = shift;
    appState.selectedTimeSlot = getAutoTimeSlotIdx(shift);
    appState.activeModule = 'MOD_5';
    render();
}

window.goBackToShiftSelection = function() {
    appState.selectedShift = null;
    appState.activeModule = 'MOD_5_SETUP';
    render();
}

window.selectTimeSlot = function(index) {
    appState.selectedTimeSlot = index;
    render();
}

window.changeDate = function(offset) {
    const d = new Date(appState.currentDate);
    d.setDate(d.getDate() + offset + 1); // +1 por causa do fuso horário na criação do Date
    const newDateStr = d.toISOString().split('T')[0];
    appState.currentDate = newDateStr;
    render();
}

window.selectDate = function(val) {
    if(val) {
        appState.currentDate = val;
        render();
    }
}

window.openModalSubstituto = function(horario) {
    appState.modalSubstituto = horario;
    render();
}

window.closeModalSubstituto = function() {
    appState.modalSubstituto = null;
    render();
}

function renderModalSubstitutos() {
    if (!appState.modalSubstituto) return '';
    
    const profsHtml = mockProfessoresLivres.map(p => `
        <div class="substituto-row">
            <div class="subst-info">
                <strong>${p.nome}</strong>
                <span>${p.area}</span>
            </div>
            <div class="subst-status">Livre</div>
            <a href="https://wa.me/${p.zap}" target="_blank" class="btn-whatsapp">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                Contatar
            </a>
        </div>
    `).join('');

    return `
        <div class="modal-overlay" onclick="closeModalSubstituto()">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 500px;">
                <div class="modal-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
                    <h3>Professores Disponíveis (Livres)</h3>
                    <p style="color: var(--text-muted); margin-top: 0.2rem; font-size: 0.9rem;">Horário: ${appState.modalSubstituto}</p>
                    <button class="close-btn" onclick="closeModalSubstituto()">✕</button>
                </div>
                <div class="substitutos-list" style="display:flex; flex-direction:column; gap:0.8rem;">
                    ${profsHtml}
                </div>
            </div>
        </div>
    `;
}

window.changeModule = function(modId) {
    // Reset MOD_1 state
    appState.mod1Tab = 'COLEGIADOS';
    appState.mod1Modal = null;

    // Reset MOD_2 state
    appState.mod2Modal = null;

    // Reset MOD_3 state
    appState.mod3Modal = null;

    // Reset MOD_4 state
    appState.mod4Tab = 'GRADE';

    // Reset MOD_5 state
    appState.selectedShift = null; 
    appState.selectedTimeSlot = 0;

    // Reset MOD_6 state
    appState.selectedChefiado = 'GERAL';
    appState.chefiadosTab = 'CARDS';
    appState.chefiadosNivel0 = null;
    appState.selectedDayDetail = null;
    appState.highlightedDay = null;

    // Reset MOD_7 state
    appState.coordCursoView = 'LIST';
    appState.coordNivel0 = null;

    // Reset MOD_CONFIG state
    appState.auditTab = 'RBAC';

    if (modId === 'MOD_5') {
        appState.activeModule = 'MOD_5_SETUP';
    } else {
        appState.activeModule = modId;
    }
    
    appState.toast = null; // Clear active toast messages
    appState.mobileMenuOpen = false; // Fecha o menu mobile ao selecionar
    render();
}

window.toggleSidebar = function() {
    appState.sidebarCollapsed = !appState.sidebarCollapsed;
    render();
}

window.toggleMobileMenu = function() {
    appState.mobileMenuOpen = !appState.mobileMenuOpen;
    render();
}

window.togglePermission = function(modId, profileId) {
    const list = appState.permissions[modId];
    let isAdded = false;
    if (list.includes(profileId)) {
        appState.permissions[modId] = list.filter(p => p !== profileId);
    } else {
        appState.permissions[modId].push(profileId);
        isAdded = true;
    }
    
    // Log audit
    const actionTxt = isAdded ? "Concessão de Acesso" : "Revogação de Acesso";
    const mod = MODULOS_INFO[modId];
    const modTitle = mod ? mod.titulo : modId;
    const activeUser = appState.currentProfile || 'Sistema';
    const details = `Alterou permissões do módulo "${modTitle}": ${isAdded ? 'concedeu' : 'removeu'} acesso para o perfil "${profileId}".`;
    registrarAcaoAuditoria(activeUser, "Configuração RBAC", details);

    render();
}

window.changeAuditTab = function(tab) {
    appState.auditTab = tab;
    render();
}

window.baixarRelatorioAuditoria = function() {
    const logs = appState.auditLogs || [];
    if (logs.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }

    // CSV header with BOM
    let csvContent = "Data/Hora;Usuario;Acao;Detalhes\n";

    logs.forEach(log => {
        const timestamp = log.timestamp.replace(/"/g, '""');
        const usuario = log.usuario.replace(/"/g, '""');
        const acao = log.acao.replace(/"/g, '""');
        const detalhes = log.detalhes.replace(/"/g, '""');

        csvContent += `"${timestamp}";"${usuario}";"${acao}";"${detalhes}"\n`;
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_auditoria_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const activeUser = appState.currentProfile || 'Sistema';
    registrarAcaoAuditoria(activeUser, "Exportação CSV", "Efetuou o download do relatório de auditoria.");
    render();
}

window.changeChefiadosTab = function(tab) {
    appState.chefiadosTab = tab;
    render();
}

window.confirmarFaltaPendencia = function(pendenciaId) {
    const pend = appState.rondaPendencias.find(p => p.id === pendenciaId);
    if (!pend) return;
    
    const prof = mockProfessores.find(p => p.id === pend.profId);
    const profNome = prof ? prof.nome : 'Professor';
    const sala = mockSalasManha.find(s => s.id === pend.salaId);
    const salaNome = sala ? sala.nome : `Sala ${pend.salaId}`;

    appState.rondaPendencias = appState.rondaPendencias.filter(p => p.id !== pendenciaId);
    
    const coordProf = mockProfessores.find(p => p.id === 1);
    const coordNome = coordProf ? coordProf.nome : 'Coordenador';
    
    const details = `Coordenador confirmou a falta do Prof. ${profNome} no dia ${pend.data} (${timeSlots[pend.slotIdx]}, Turno ${pend.turno}) na ${salaNome}`;
    registrarAcaoAuditoria(coordNome, "Confirmação de Falta", details);
    
    alert(`Falta do Prof. ${profNome} confirmada.`);
    render();
}

window.corrigirParaPresente = function(pendenciaId) {
    const pend = appState.rondaPendencias.find(p => p.id === pendenciaId);
    if (!pend) return;
    
    const prof = mockProfessores.find(p => p.id === pend.profId);
    const profNome = prof ? prof.nome : 'Professor';
    const sala = mockSalasManha.find(s => s.id === pend.salaId);
    const salaNome = sala ? sala.nome : `Sala ${pend.salaId}`;

    const justificativa = prompt(`Justificativa para a presença do Prof. ${profNome} no dia ${pend.data} (${timeSlots[pend.slotIdx]}, Turno ${pend.turno}):`, "Atividade pedagógica em outro espaço");
    
    if (justificativa === null) return;
    if (justificativa.trim() === '') {
        alert("A justificativa é obrigatória para corrigir o status.");
        return;
    }

    if (!appState.correcoesPresenca) appState.correcoesPresenca = {};
    appState.correcoesPresenca[`${pend.profId}_${pend.data}`] = 'presente';
    
    if (appState.rondaAbsences) {
        delete appState.rondaAbsences[`${pend.profId}_${pend.data}`];
    }

    if (pend.data === appState.currentDate) {
        const key = `${pend.salaId}_${pend.slotIdx}`;
        if (appState.presences[key]) {
            appState.presences[key].status = 'presente';
        }
    }

    appState.rondaPendencias = appState.rondaPendencias.filter(p => p.id !== pendenciaId);
    
    const coordProf = mockProfessores.find(p => p.id === 1);
    const coordNome = coordProf ? coordProf.nome : 'Coordenador';
    
    const details = `Coordenador corrigiu status de ausente para PRESENTE do Prof. ${profNome} no dia ${pend.data} (${timeSlots[pend.slotIdx]}, Turno ${pend.turno}). Justificativa: ${justificativa}`;
    registrarAcaoAuditoria(coordNome, "Correção de Presença", details);
    
    alert(`Status do Prof. ${profNome} corrigido para Presente com sucesso.`);
    render();
}

window.showToast = function(msg) {
    const existingToasts = document.querySelectorAll('.sys-toast');
    for (let t of existingToasts) {
        if (t.innerText.includes(msg)) return; 
    }

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }
    
    const isEmail = msg.includes('email') || msg.includes('E-mail') || msg.includes('@');
    const title = isEmail ? '📧 E-mail de Alerta Enviado!' : '🔔 Notificação do Sistema';
    const buttonHtml = isEmail 
        ? `<button onclick="simulateTeacherEmail()" style="margin-top:0.5rem; padding: 0.4rem; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; cursor:pointer; width: 100%;">👉 Simular clique no E-mail</button>` 
        : '';

    const toast = document.createElement('div');
    toast.className = 'sys-toast animate-slide-up';
    toast.style.background = 'white';
    toast.style.borderLeft = '4px solid var(--if-green, #2b9938)';
    toast.style.padding = '1rem 1.5rem';
    toast.style.borderRadius = 'var(--radius-md, 8px)';
    toast.style.boxShadow = 'var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.gap = '0.5rem';
    toast.style.minWidth = '300px';
    toast.style.transition = 'all 0.3s ease';
    
    toast.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: var(--text-dark, #1e293b);">${title}</strong>
            <button onclick="this.parentElement.parentElement.remove()" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem; color:var(--text-muted, #94a3b8);">&times;</button>
        </div>
        <div style="font-size: 0.9rem; color: var(--text-color, #334155);">${msg}</div>
        ${buttonHtml}
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

function renderPermissionsConfig() {
    const perfisIds = ['FISCAL', 'COORD_COLEGIADO', 'COORD_GERAL', 'COORD_PEDAG', 'DIR_ENSINO', 'DIR_GERAL', 'ESTAGIARIO'];
    
    // Sub-tabs
    const tabsHtml = `
        <div style="display: flex; gap: 1rem; border-bottom: 2px solid var(--border-color); margin-bottom: 1.5rem;">
            <button class="coord-tab" style="border: none; background: none; padding: 0.8rem 1.2rem; font-weight: 600; cursor: pointer; border-bottom: 3px solid ${appState.auditTab === 'RBAC' ? 'var(--if-green)' : 'transparent'}; color: ${appState.auditTab === 'RBAC' ? 'var(--if-green)' : 'var(--text-muted)'};" onclick="window.changeAuditTab('RBAC')">
                🛡️ Permissões de Acesso (RBAC)
            </button>
            <button class="coord-tab" style="border: none; background: none; padding: 0.8rem 1.2rem; font-weight: 600; cursor: pointer; border-bottom: 3px solid ${appState.auditTab === 'AUDIT' ? 'var(--if-green)' : 'transparent'}; color: ${appState.auditTab === 'AUDIT' ? 'var(--if-green)' : 'var(--text-muted)'};" onclick="window.changeAuditTab('AUDIT')">
                📝 Histórico de Auditoria
            </button>
        </div>
    `;

    let innerContentHtml = '';

    if (appState.auditTab === 'RBAC') {
        let tableHtml = `
            <table class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Módulos</th>
                        ${perfisIds.map(p => `<th><div class="vertical-text">${p}</div></th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        Object.keys(MODULOS_INFO).forEach(modId => {
            const mod = MODULOS_INFO[modId];
            tableHtml += `<tr>
                <td style="font-weight: 500;">${mod.icone} ${mod.titulo}</td>
                ${perfisIds.map(p => {
                    const isChecked = appState.permissions[modId].includes(p);
                    return `
                        <td style="text-align: center;">
                            <label class="switch">
                                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="togglePermission('${modId}', '${p}')">
                                <span class="slider round"></span>
                            </label>
                        </td>
                    `;
                }).join('')}
            </tr>`;
        });

        tableHtml += `</tbody></table>`;
        innerContentHtml = `
            <p style="color: var(--text-muted); margin-bottom: 2rem;">Marque as caixas abaixo para conceder ou remover acesso aos módulos do sistema para cada perfil de usuário.</p>
            <div class="table-responsive">
                ${tableHtml}
            </div>
        `;
    } else {
        // Audit log view
        const logs = appState.auditLogs || [];
        const rowsHtml = logs.map(log => `
            <tr>
                <td style="white-space: nowrap; font-size: 0.85rem; color: var(--text-muted);">${log.timestamp}</td>
                <td style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${log.usuario}</td>
                <td><span class="status-badge" style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.5rem; font-size: 0.8rem; font-weight: 600; border-radius: 4px;">${log.acao}</span></td>
                <td style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${log.detalhes}</td>
            </tr>
        `).join('');

        innerContentHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                <p style="color: var(--text-muted); margin: 0;">Trilha de auditoria contendo todas as ações efetuadas por Fiscais de Ronda e Coordenadores.</p>
                <button class="nav-btn" onclick="window.baixarRelatorioAuditoria()" style="display: flex; align-items: center; gap: 0.5rem; background: var(--if-green); border-color: var(--if-green); color: white;">
                    📥 Baixar Relatório de Auditoria (CSV)
                </button>
            </div>
            <div class="table-responsive" style="max-height: 500px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                <table class="perms-table">
                    <thead>
                        <tr>
                            <th style="text-align: left; width: 150px;">Data/Hora</th>
                            <th style="text-align: left; width: 180px;">Usuário</th>
                            <th style="text-align: left; width: 160px;">Ação</th>
                            <th style="text-align: left;">Detalhes da Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum log registrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%; padding: 1.5rem; background: white;">
            <div class="diario-header" style="border-bottom: none; padding-bottom: 0; margin-bottom: 1rem;">
                <h2>⚙️ Configurações e Auditoria</h2>
            </div>
            ${tabsHtml}
            ${innerContentHtml}
        </div>
    `;
}

window.changeMod1Tab = function(tab) {
    appState.mod1Tab = tab;
    render();
}

window.openMod1Modal = function(modal) {
    appState.mod1Modal = modal;
    render();
}

window.closeMod1Modal = function() {
    appState.mod1Modal = null;
    appState.editColegiadoId = null;
    render();
}

// ==========================================
// COLEGIADOS CRUD ACTIONS
// ==========================================
window.openColegiadoModal = function() {
    appState.editColegiadoId = null;
    appState.mod1Modal = 'MODAL_COLEGIADO';
    render();
}

window.editColegiado = function(id) {
    appState.editColegiadoId = id;
    appState.mod1Modal = 'MODAL_COLEGIADO';
    render();
}

window.toggleStatusColegiado = async function(id, currentStatus) {
    if (!confirm(`Deseja realmente ${currentStatus === 'INATIVO' ? 'ativar' : 'inativar'} este Colegiado?`)) return;
    try {
        const newStatus = currentStatus === 'INATIVO' ? 'ATIVO' : 'INATIVO';
        await DB.colegiados.update(id, { status: newStatus });
        showToast(`Colegiado ${newStatus.toLowerCase()} com sucesso!`);
        await loadAllDataFromDB();
        render();
    } catch (e) {
        alert('Erro ao atualizar: ' + e.message);
    }
}

window.submitColegiado = async function(e) {
    e.preventDefault();
    const nome = document.getElementById('colNome').value.trim();
    const sigla = document.getElementById('colSigla').value.trim();
    const email = document.getElementById('colEmail').value.trim();
    const coordenadorId = document.getElementById('colCoord').value;
    
    const checkboxes = document.querySelectorAll('input[name="colMods"]:checked');
    const modalidades = Array.from(checkboxes).map(cb => cb.value);

    const payload = {
        nome: nome,
        sigla: sigla,
        email: email,
        coordenador_id: coordenadorId ? parseInt(coordenadorId) : null,
        modalidades: modalidades
    };

    try {
        if (appState.editColegiadoId) {
            await DB.colegiados.update(appState.editColegiadoId, payload);
            showToast('Colegiado atualizado com sucesso!');
        } else {
            payload.status = 'ATIVO';
            await DB.colegiados.create(payload);
            showToast('Colegiado criado com sucesso!');
        }

        if (email) {
            const { data: existingUser } = await supabaseClient.from('usuarios').select('id').eq('email', email).maybeSingle();
            const userPayload = { nome: nome, email: email, perfil: 'COORD_COLEGIADO', servidor_id: coordenadorId ? parseInt(coordenadorId) : null };
            if (existingUser) {
                await supabaseClient.from('usuarios').update(userPayload).eq('id', existingUser.id);
            } else {
                await supabaseClient.from('usuarios').insert([userPayload]);
            }
        }
        closeMod1Modal();
        await loadAllDataFromDB();
        render();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

// ==========================================
// CURSOS CRUD ACTIONS
// ==========================================
window.openCursoModal = function() {
    appState.editCursoId = null;
    appState.mod1Modal = 'MODAL_CURSO';
    render();
}

window.editCurso = function(id) {
    appState.editCursoId = id;
    appState.mod1Modal = 'MODAL_CURSO';
    render();
}

window.toggleStatusCurso = async function(id, currentStatus) {
    if (!confirm(`Deseja realmente ${currentStatus === 'INATIVO' ? 'ativar' : 'inativar'} este Curso?`)) return;
    try {
        const newStatus = currentStatus === 'INATIVO' ? 'ATIVO' : 'INATIVO';
        await DB.cursos.update(id, { status: newStatus });
        showToast(`Curso ${newStatus.toLowerCase()} com sucesso!`);
        await loadAllDataFromDB();
        render();
    } catch (e) {
        alert('Erro ao atualizar: ' + e.message);
    }
}

window.submitCurso = async function(e) {
    e.preventDefault();
    const modalidade = document.getElementById('modalidadeCurso').value;
    const nome = document.getElementById('curNome').value.trim();
    const sigla = document.getElementById('curSigla').value.trim();
    const turno = document.getElementById('curTurno').value;
    
    let vinculo = 'Colegiado';
    let vinculoId = document.getElementById('curCol').value;
    let responsavelId = document.getElementById('curResp').value;
    
    if (modalidade === 'FIC' || modalidade.includes('Pós-Graduação')) {
        vinculo = 'DEPPI';
        vinculoId = null;
    } else {
        responsavelId = null; // Managed by colegiado
    }

    const payload = {
        modalidade: modalidade,
        nome: nome,
        sigla: sigla,
        turno: turno,
        vinculo: vinculo,
        vinculo_id: vinculoId ? parseInt(vinculoId) : null,
        responsavel_id: responsavelId ? parseInt(responsavelId) : null
    };

    try {
        if (appState.editCursoId) {
            await DB.cursos.update(appState.editCursoId, payload);
            showToast('Curso atualizado com sucesso!');
        } else {
            payload.status = 'ATIVO';
            await DB.cursos.create(payload);
            showToast('Curso criado com sucesso!');
            closeMod1Modal(); // Only close on create, to let user manage turmas on edit
        }
        await loadAllDataFromDB();
        render();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

// ==========================================
// TURMAS CRUD ACTIONS
// ==========================================
window.submitNovaTurma = async function(cursoId) {
    const nome = document.getElementById('novaTurmaNome').value.trim();
    const modalidade = document.getElementById('novaTurmaMod').value;
    
    if (!nome) {
        alert('Por favor, informe o nome da turma.');
        return;
    }

    try {
        await DB.turmas.create({
            curso_id: cursoId,
            nome: nome,
            modalidade: modalidade,
            status: 'ATIVA'
        });
        showToast('Turma adicionada com sucesso!');
        await loadAllDataFromDB();
        render(); // Re-renders the modal with the new turma
    } catch (err) {
        alert('Erro ao salvar turma: ' + err.message);
    }
}

window.inativarTurma = async function(id, currentStatus) {
    // Cycles between ATIVA, INATIVA, FORMADA
    const nextStatus = currentStatus === 'ATIVA' ? 'INATIVA' : (currentStatus === 'INATIVA' ? 'FORMADA' : 'ATIVA');
    try {
        await DB.turmas.update(id, { status: nextStatus });
        showToast(`Status da turma atualizado para ${nextStatus}.`);
        await loadAllDataFromDB();
        render();
    } catch (err) {
        alert('Erro ao atualizar turma: ' + err.message);
    }
}

// ==========================================
// INSTÂNCIAS CRUD ACTIONS
// ==========================================
window.openInstanciaModal = function() {
    appState.editInstanciaId = null;
    appState.mod1Modal = 'MODAL_INSTANCIA';
    render();
}

window.editInstancia = function(id) {
    appState.editInstanciaId = id;
    appState.mod1Modal = 'MODAL_INSTANCIA';
    render();
}

window.toggleStatusInstancia = async function(id, currentStatus) {
    if (!confirm(`Deseja realmente ${currentStatus === 'INATIVO' ? 'ativar' : 'inativar'} esta Instância?`)) return;
    try {
        const newStatus = currentStatus === 'INATIVO' ? 'ATIVO' : 'INATIVO';
        await DB.instancias.update(id, { status: newStatus });
        showToast(`Instância ${newStatus.toLowerCase()} com sucesso!`);
        await loadAllDataFromDB();
        render();
    } catch (e) {
        alert('Erro ao atualizar: ' + e.message);
    }
}

window.submitInstancia = async function(e) {
    e.preventDefault();
    const nome = document.getElementById('instNome').value.trim();
    const responsavelId = document.getElementById('instResp').value;
    const email = document.getElementById('instEmail').value.trim();

    const payload = {
        nome: nome,
        email: email,
        responsavel_id: responsavelId ? parseInt(responsavelId) : null
    };

    try {
        if (appState.editInstanciaId) {
            await DB.instancias.update(appState.editInstanciaId, payload);
            showToast('Instância atualizada com sucesso!');
        } else {
            payload.status = 'ATIVO';
            await DB.instancias.create(payload);
            showToast('Instância criada com sucesso!');
        }

        if (email) {
            const { data: existingUser } = await supabaseClient.from('usuarios').select('id').eq('email', email).maybeSingle();
            const userPayload = { nome: nome, email: email, perfil: 'COPED', servidor_id: responsavelId ? parseInt(responsavelId) : null };
            if (existingUser) {
                await supabaseClient.from('usuarios').update(userPayload).eq('id', existingUser.id);
            } else {
                await supabaseClient.from('usuarios').insert([userPayload]);
            }
        }
        closeMod1Modal();
        await loadAllDataFromDB();
        render();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

// ==========================================
// DISCIPLINAS CRUD ACTIONS
// ==========================================
window.openDisciplinaModal = function() {
    appState.editDisciplinaId = null;
    appState.mod2Modal = 'MODAL_DISCIPLINA';
    render();
}

window.editDisciplina = function(id) {
    appState.editDisciplinaId = id;
    appState.mod2Modal = 'MODAL_DISCIPLINA';
    render();
}

window.toggleStatusDisciplina = async function(id, currentStatus) {
    if (!confirm(`Deseja realmente ${currentStatus === 'INATIVO' ? 'ativar' : 'inativar'} esta Disciplina?`)) return;
    try {
        const newStatus = currentStatus === 'INATIVO' ? 'ATIVO' : 'INATIVO';
        await DB.disciplinas.update(id, { status: newStatus });
        showToast(`Disciplina ${newStatus.toLowerCase()} com sucesso!`);
        await loadAllDataFromDB();
        render();
    } catch (e) {
        alert('Erro ao atualizar: ' + e.message);
    }
}

window.submitDisciplina = async function(e) {
    e.preventDefault();
    const nome = document.getElementById('discNome').value.trim();
    const nucleo = document.getElementById('discNucleo').value;
    const codigo = document.getElementById('discCodigo').value.trim();

    const checkboxes = document.querySelectorAll('input[name="discCursos"]:checked');
    const cursoIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    const payload = {
        nome: nome,
        nucleo: nucleo,
        codigo: codigo || null
    };

    try {
        let discId = appState.editDisciplinaId;
        if (discId) {
            await DB.disciplinas.update(discId, payload);
            showToast('Disciplina atualizada com sucesso!');
        } else {
            payload.status = 'ATIVO';
            const created = await DB.disciplinas.create(payload);
            discId = created.id; 
            showToast('Disciplina criada com sucesso!');
        }
        
        // Link to courses
        await DB.disciplinas.setCursos(discId, cursoIds);
        
        closeMod2Modal();
        await loadAllDataFromDB();
        render();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

// ==========================================
// SERVIDORES CRUD ACTIONS
// ==========================================
window.openServidorModal = function() {
    appState.editServidorId = null;
    appState.mod3Modal = 'MODAL_SERVIDOR';
    render();
}

window.editServidor = function(id) {
    appState.editServidorId = id;
    appState.mod3Modal = 'MODAL_SERVIDOR';
    render();
}

window.openExportarModal = function(id) {
    appState.exportarServidorId = id;
    appState.mod3Modal = 'MODAL_EXPORTAR';
    render();
}

window.submitExportarServidor = async function(e, id) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        const destinoId = document.getElementById('expDestinoCol').value;
        if (!destinoId) throw new Error('Selecione um colegiado de destino.');

        const serv = mockServidores.find(s => s.id == id);
        if (!serv) throw new Error('Servidor não encontrado.');

        const novaTransf = {
            servidor_id: serv.id,
            origem_id: serv.vinculoId,
            destino_id: parseInt(destinoId),
            status: 'PENDENTE'
        };

        await DB.transferencias.create(novaTransf);
        showToast('Solicitação de transferência enviada!');
        closeMod3Modal();
        await loadAllDataFromDB();
        render();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Erro ao exportar.');
        if (btn) btn.disabled = false;
    }
}

window.toggleStatusServidor = async function(id, currentStatus) {
    if (!confirm(`Deseja realmente ${currentStatus === 'INATIVO' ? 'ativar' : 'inativar'} este Servidor?`)) return;
    try {
        const newStatus = currentStatus === 'INATIVO' ? 'ATIVO' : 'INATIVO';
        await DB.servidores.update(id, { status: newStatus });
        showToast(`Servidor ${newStatus.toLowerCase()} com sucesso!`);
        await loadAllDataFromDB();
        render();
    } catch (e) {
        alert('Erro ao atualizar: ' + e.message);
    }
}

window.deleteServidor = async function(id) {
    if (!confirm('ATENÇÃO: Deseja realmente EXCLUIR este servidor do sistema? Esta ação não pode ser desfeita e pode impactar diários vinculados a ele.')) return;
    try {
        await DB.servidores.delete(id);
        showToast('Servidor excluído com sucesso!');
        await loadAllDataFromDB();
        render();
    } catch (e) {
        alert('Erro ao excluir servidor: ' + e.message);
    }
}

window.submitServidor = async function(e) {
    e.preventDefault();
    const nome = document.getElementById('srvNome').value.trim();
    const siape = document.getElementById('srvSiape').value.trim();
    const tipo = document.getElementById('tipoServidor').value;
    const email = document.getElementById('srvEmail').value.trim();
    const telefone = document.getElementById('srvTelefone').value.trim();

    let vinculo = tipo === 'Docente' ? 'Colegiado' : 'Instância';
    let vinculoId = null;

    if (tipo === 'Docente') {
        vinculoId = document.getElementById('srvCol').value;
    } else {
        vinculoId = document.getElementById('srvInst').value;
    }

    if (!vinculoId) {
        alert(`Por favor, selecione a ${tipo === 'Docente' ? 'Colegiado' : 'Instância'} de vínculo.`);
        return;
    }

    const payload = {
        nome: nome,
        siape: siape,
        tipo: tipo,
        email: email,
        telefone: telefone,
        vinculo: vinculo,
        vinculo_id: parseInt(vinculoId)
    };

    // Pega as disciplinas
    const discCheckboxes = document.querySelectorAll('input[name="srvDisc"]:checked');
    const discIds = Array.from(discCheckboxes).map(cb => parseInt(cb.value));

    try {
        let servId = appState.editServidorId;
        if (servId) {
            await DB.servidores.update(servId, payload);
            showToast('Servidor atualizado com sucesso!');
        } else {
            payload.status = 'ATIVO';
            const created = await DB.servidores.create(payload);
            servId = created.id;
            showToast('Servidor criado com sucesso!');
        }
        
        // Link to disciplinas
        await DB.servidores.setDisciplinas(servId, discIds);
        
        appState.mod3Modal = null;
        await loadAllDataFromDB();
        render();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

window.onChangeTipoServidor = function() {
    const tipo = document.getElementById('tipoServidor')?.value;
    const contCol = document.getElementById('containerColServidor');
    const contInst = document.getElementById('containerInstServidor');
    const contDisc = document.getElementById('containerDisciplinas');
    const txtChefia = document.getElementById('textoChefiaServidor');
    
    if (!contCol || !contInst || !contDisc || !txtChefia) return;

    const isDocente = tipo === 'Docente';
    contCol.style.display = isDocente ? 'block' : 'none';
    contInst.style.display = isDocente ? 'none' : 'block';
    contDisc.style.display = isDocente ? 'block' : 'none';
    
    txtChefia.value = isDocente 
        ? "Coordenador do Colegiado selecionado" 
        : "Responsável pela Instância selecionada";
}

// Logic to conditionally render fields based on Modalidade
window.onChangeModalidade = function() {
    const modalidade = document.getElementById('modalidadeCurso')?.value;
    if(!modalidade) return;

    const isFIC = modalidade === 'FIC';
    const isPosGrad = modalidade.includes('Pós-Graduação');
    const vinculaDeppi = isFIC || isPosGrad;
    
    document.getElementById('containerColegiado').style.display = vinculaDeppi ? 'none' : 'block';
    document.getElementById('containerDeppi').style.display = vinculaDeppi ? 'block' : 'none';
    
    const labelResp = document.getElementById('labelResponsavel');
    const containerResp = document.getElementById('containerResponsavel');
    if (isFIC) {
        labelResp.innerText = 'Professor Proponente (Opcional)';
        containerResp.style.display = 'block';
    } else if (isPosGrad) {
        labelResp.innerText = 'Coordenador do Curso';
        containerResp.style.display = 'block';
    } else {
        containerResp.style.display = 'none';
    }
}

function renderColegiadosTab() {
    const rows = mockColegiados.map(c => {
        let coordHtml = '<span style="color: var(--text-muted); font-style: italic;">Não definido</span>';
        let amberDot = '<div class="amber-dot tooltip"><span class="tooltiptext">Atenção: Este colegiado ainda não possui um Coordenador vinculado.</span></div>';
        
        if (c.coordenadorId) {
            const prof = mockProfessores.find(p => p.id === c.coordenadorId);
            if (prof) {
                coordHtml = `<strong>${prof.nome}</strong>`;
                amberDot = ''; // Has coordinator, no amber dot
            }
        }

        const isInactive = c.status === 'INATIVO';
        const opacityStyle = isInactive ? 'opacity: 0.6;' : '';
        const statusBadge = isInactive ? '<span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">Inativo</span>' : '';
        
        return `
            <tr style="${opacityStyle}">
                <td style="font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${c.nome} ${amberDot} ${statusBadge}
                    </div>
                </td>
                <td><span class="badge-blue" style="background: #E0E7FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">${c.sigla}</span></td>
                <td>${coordHtml}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="window.editColegiado(${c.id})">Editar</button>
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: #FECACA; color: #DC2626;" onclick="window.toggleStatusColegiado(${c.id}, '${c.status}')">
                            ${isInactive ? 'Ativar' : 'Inativar'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive" style="margin-top: 1.5rem;">
            <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
                <button class="nav-btn" onclick="window.openColegiadoModal()">+ Novo Colegiado</button>
            </div>
            <table class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Nome do Colegiado</th>
                        <th style="text-align: left;">Sigla</th>
                        <th style="text-align: left;">Coordenador</th>
                        <th style="text-align: left;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum colegiado cadastrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderCursosTab() {
    const rows = mockCursosCadastrados.map(c => {
        let vinculoTxt = c.vinculo === 'DEPPI' ? '<span class="badge-orange" style="background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">DEPPI</span>' : `<span class="badge-blue" style="background: #E0E7FF; color: #4338CA; border: 1px solid #C7D2FE; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">${mockColegiados.find(col => col.id === c.vinculoId)?.sigla || 'Colegiado'}</span>`;
        let respTxt = '-';
        if (c.responsavelId) {
            const prof = mockProfessores.find(p => p.id === c.responsavelId);
            respTxt = prof ? prof.nome : '-';
        }

        const isInactive = c.status === 'INATIVO';
        const opacityStyle = isInactive ? 'opacity: 0.6;' : '';
        const statusBadge = isInactive ? '<span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">Inativo</span>' : '';

        // Count turmas for this course
        const turmasCount = mockTurmas.filter(t => t.curso_id === c.id).length;

        return `
            <tr style="${opacityStyle}">
                <td style="font-weight: 500;">${c.nome} <span style="color:var(--text-muted); font-size:0.8rem;">(${c.sigla || 'S/S'})</span> ${statusBadge}</td>
                <td><span style="color: var(--text-muted); font-size: 0.85rem;">${c.modalidade}</span></td>
                <td><span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">${c.turno}</span></td>
                <td><span style="color:var(--text-main); font-size: 0.8rem; font-weight: 500;">${turmasCount} turmas</span></td>
                <td>${vinculoTxt}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="window.editCurso(${c.id})">Editar / Turmas</button>
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: #FECACA; color: #DC2626;" onclick="window.toggleStatusCurso(${c.id}, '${c.status}')">
                            ${isInactive ? 'Ativar' : 'Inativar'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive" style="margin-top: 1.5rem;">
            <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
                <button class="nav-btn" onclick="window.openCursoModal()">+ Novo Curso</button>
            </div>
            <table class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Nome e Sigla</th>
                        <th style="text-align: left;">Modalidade</th>
                        <th style="text-align: left;">Turno</th>
                        <th style="text-align: left;">Turmas</th>
                        <th style="text-align: left;">Vínculo</th>
                        <th style="text-align: left;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum curso cadastrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderMod1Modals() {
    if (!appState.mod1Modal) return '';

    if (appState.mod1Modal === 'MODAL_COLEGIADO') {
        const isEdit = !!appState.editColegiadoId;
        const colData = isEdit ? mockColegiados.find(c => c.id === appState.editColegiadoId) || {} : {};
        
        const profOptions = mockProfessores.map(p => `<option value="${p.id}" ${colData.coordenadorId === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
        
        const mods = colData.modalidades || [];
        const isModChecked = (val) => mods.includes(val) ? 'checked' : '';

        return `
            <div class="modal-overlay animate-fade-in" onclick="closeMod1Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 550px;">
                    <div class="modal-header">
                        <h3>${isEdit ? '✏️ Editar Colegiado' : '➕ Criar Novo Colegiado'}</h3>
                        <button class="close-btn" onclick="closeMod1Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <form onsubmit="window.submitColegiado(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Nome do Colegiado *</label>
                                <input type="text" id="colNome" value="${colData.nome || ''}" required placeholder="Ex: Colegiado de Agropecuária" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Sigla *</label>
                                <input type="text" id="colSigla" value="${colData.sigla || ''}" required placeholder="Ex: C-AGRO" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">E-mail Institucional *</label>
                                <input type="email" id="colEmail" value="${colData.email || ''}" required placeholder="Ex: colegiado@ifap.edu.br" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Coordenador (Opcional)</label>
                                <select id="colCoord" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Deixar Pendente / Selecionar Docente --</option>
                                    ${profOptions}
                                </select>
                            </div>
                            
                            <div style="margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                                <label style="font-weight: 500; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Modalidades Atendidas</label>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.9rem; color: var(--text-main);">
                                    <label style="display: flex; align-items: center; gap: 0.4rem;"><input type="checkbox" name="colMods" value="Ensino Médio Integrado" ${isModChecked('Ensino Médio Integrado')}> Ensino Médio Integrado</label>
                                    <label style="display: flex; align-items: center; gap: 0.4rem;"><input type="checkbox" name="colMods" value="PROEJA" ${isModChecked('PROEJA')}> PROEJA</label>
                                    <label style="display: flex; align-items: center; gap: 0.4rem;"><input type="checkbox" name="colMods" value="Subsequente" ${isModChecked('Subsequente')}> Subsequente</label>
                                    <label style="display: flex; align-items: center; gap: 0.4rem;"><input type="checkbox" name="colMods" value="Superior" ${isModChecked('Superior')}> Superior (Graduação)</label>
                                    <label style="display: flex; align-items: center; gap: 0.4rem;"><input type="checkbox" name="colMods" value="FIC" ${isModChecked('FIC')}> FIC</label>
                                </div>
                            </div>
                            
                            <button type="submit" class="nav-btn" style="width: 100%; margin-top: 1rem;">Salvar Colegiado</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    if (appState.mod1Modal === 'MODAL_CURSO') {
        const isEdit = !!appState.editCursoId;
        const curData = isEdit ? mockCursosCadastrados.find(c => c.id === appState.editCursoId) || {} : {};
        
        const profOptions = mockProfessores.map(p => `<option value="${p.id}" ${curData.responsavelId === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
        const colOptions = mockColegiados.map(c => `<option value="${c.id}" ${curData.vinculoId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
        
        setTimeout(() => window.onChangeModalidade && window.onChangeModalidade(), 10);

        let turmasSection = '';
        if (isEdit) {
            const turmasDoCurso = mockTurmas.filter(t => t.curso_id === curData.id);
            const parentCol = mockColegiados.find(c => c.id === curData.vinculoId);
            const availableMods = parentCol && parentCol.modalidades && parentCol.modalidades.length > 0 ? parentCol.modalidades : ['Ensino Médio Integrado', 'PROEJA', 'Subsequente', 'Superior', 'FIC'];
            const modOptions = availableMods.map(m => `<option value="${m}">${m}</option>`).join('');

            const turmasRows = turmasDoCurso.map(t => `
                <tr>
                    <td>${t.nome}</td>
                    <td>${t.modalidade}</td>
                    <td><span class="${t.status === 'ATIVA' ? 'badge-blue' : 'badge-orange'}" style="padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${t.status}</span></td>
                    <td>
                        <button type="button" class="outline-btn" style="padding: 0.1rem 0.4rem; font-size: 0.7rem;" onclick="window.inativarTurma(${t.id}, '${t.status}')">Alternar Status</button>
                    </td>
                </tr>
            `).join('');

            turmasSection = `
                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--border-color);">
                    <h4>📚 Turmas do Curso</h4>
                    <table class="perms-table" style="font-size: 0.85rem; margin-top: 0.5rem; margin-bottom: 1rem;">
                        <thead>
                            <tr><th style="text-align: left;">Nome</th><th style="text-align: left;">Modalidade</th><th style="text-align: left;">Status</th><th style="text-align: left;">Ações</th></tr>
                        </thead>
                        <tbody>
                            ${turmasRows || '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhuma turma cadastrada.</td></tr>'}
                        </tbody>
                    </table>
                    
                    <div style="background: #F8FAFC; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                        <h5 style="margin-top:0; margin-bottom: 0.5rem;">Adicionar Turma</h5>
                        <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                            <div style="flex: 2;">
                                <label style="font-size: 0.8rem; font-weight: 500;">Nome da Turma</label>
                                <input type="text" id="novaTurmaNome" placeholder="Ex: 1º Ano A" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                            </div>
                            <div style="flex: 2;">
                                <label style="font-size: 0.8rem; font-weight: 500;">Modalidade</label>
                                <select id="novaTurmaMod" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white;">
                                    ${modOptions}
                                </select>
                            </div>
                            <div style="flex: 1;">
                                <button type="button" class="nav-btn" style="width: 100%; padding: 0.55rem;" onclick="window.submitNovaTurma(${curData.id})">Adicionar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="modal-overlay animate-fade-in" onclick="closeMod1Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>${isEdit ? '✏️ Editar Curso / Turmas' : '➕ Cadastrar Novo Curso'}</h3>
                        <button class="close-btn" onclick="closeMod1Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <form onsubmit="window.submitCurso(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Nível / Modalidade do Curso *</label>
                                <select id="modalidadeCurso" onchange="onChangeModalidade()" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="Técnico Integrado" ${curData.modalidade === 'Técnico Integrado' ? 'selected' : ''}>Técnico Integrado</option>
                                    <option value="Técnico Subsequente" ${curData.modalidade === 'Técnico Subsequente' ? 'selected' : ''}>Técnico Subsequente</option>
                                    <option value="Técnico PROEJA" ${curData.modalidade === 'Técnico PROEJA' ? 'selected' : ''}>Técnico PROEJA</option>
                                    <option value="Superior (Graduação)" ${curData.modalidade === 'Superior (Graduação)' ? 'selected' : ''}>Superior (Graduação)</option>
                                    <option value="Pós-Graduação" ${curData.modalidade === 'Pós-Graduação' ? 'selected' : ''}>Pós-Graduação</option>
                                    <option value="FIC" ${curData.modalidade === 'FIC' ? 'selected' : ''}>FIC (Formação Inicial e Continuada)</option>
                                </select>
                            </div>

                            <div style="display: flex; gap: 1rem;">
                                <div style="flex: 2;">
                                    <label style="font-weight: 500; font-size: 0.9rem;">Nome do Curso *</label>
                                    <input type="text" id="curNome" value="${curData.nome || ''}" required placeholder="Ex: Técnico em Agropecuária" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-weight: 500; font-size: 0.9rem;">Sigla *</label>
                                    <input type="text" id="curSigla" value="${curData.sigla || ''}" required placeholder="Ex: T-AGRO" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                                </div>
                            </div>
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Turno de Funcionamento *</label>
                                <select id="curTurno" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="Manhã" ${curData.turno === 'Manhã' ? 'selected' : ''}>Manhã</option>
                                    <option value="Tarde" ${curData.turno === 'Tarde' ? 'selected' : ''}>Tarde</option>
                                    <option value="Noite" ${curData.turno === 'Noite' ? 'selected' : ''}>Noite</option>
                                    <option value="Integral" ${curData.turno === 'Integral' ? 'selected' : ''}>Integral</option>
                                </select>
                            </div>
                            
                            <div id="containerColegiado">
                                <label style="font-weight: 500; font-size: 0.9rem;">Vínculo (Colegiado) *</label>
                                <select id="curCol" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Selecionar Colegiado --</option>
                                    ${colOptions}
                                </select>
                            </div>

                            <div id="containerDeppi" style="display: none;">
                                <label style="font-weight: 500; font-size: 0.9rem;">Vínculo Institucional</label>
                                <input type="text" value="Vinculado ao DEPPI" disabled style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: #f3f4f6; color: #6b7280; font-weight: 600;">
                            </div>

                            <div id="containerResponsavel" style="display: none;">
                                <label id="labelResponsavel" style="font-weight: 500; font-size: 0.9rem;">Responsável</label>
                                <select id="curResp" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Buscar Servidor --</option>
                                    ${profOptions}
                                </select>
                            </div>

                            <button type="submit" class="nav-btn" style="width: 100%; margin-top: 1rem;">Salvar Curso</button>
                        </form>
                        
                        ${turmasSection}

                    </div>
                </div>
            </div>
        `;
    }

    if (appState.mod1Modal === 'MODAL_INSTANCIA') {
        const isEdit = !!appState.editInstanciaId;
        const instData = isEdit ? mockInstancias.find(i => i.id === appState.editInstanciaId) || {} : {};
        
        const profOptions = mockServidores.map(p => `<option value="${p.id}" ${instData.responsavelId === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
        return `
            <div class="modal-overlay animate-fade-in" onclick="closeMod1Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>${isEdit ? '✏️ Editar Instância' : '➕ Criar Nova Instância'}</h3>
                        <button class="close-btn" onclick="closeMod1Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <form onsubmit="window.submitInstancia(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Nome da Instância *</label>
                                <input type="text" id="instNome" value="${instData.nome || ''}" required placeholder="Ex: Coordenação de Pesquisa" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">E-mail Institucional *</label>
                                <input type="email" id="instEmail" value="${instData.email || ''}" required placeholder="Ex: diretoria@ifap.edu.br" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Servidor Responsável (Opcional)</label>
                                <select id="instResp" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Buscar Servidor --</option>
                                    ${profOptions}
                                </select>
                            </div>
                            <button type="submit" class="nav-btn" style="width: 100%; margin-top: 1rem;">Salvar Instância</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    return '';
}

function renderInstanciasTab() {
    const rows = mockInstancias.map(inst => {
        let respHtml = '<span style="color: var(--text-muted); font-style: italic;">Sem responsável vinculado</span>';
        if (inst.responsavelId) {
            const prof = mockServidores.find(s => s.id === inst.responsavelId);
            if (prof) respHtml = `<strong>${prof.nome}</strong>`;
        }
        
        const isInactive = inst.status === 'INATIVO';
        const opacityStyle = isInactive ? 'opacity: 0.6;' : '';
        const statusBadge = isInactive ? '<span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">Inativo</span>' : '';

        return `
            <tr style="${opacityStyle}">
                <td style="font-weight: 500;">${inst.nome} ${statusBadge}</td>
                <td>${respHtml}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="window.editInstancia(${inst.id})">Editar</button>
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: #FECACA; color: #DC2626;" onclick="window.toggleStatusInstancia(${inst.id}, '${inst.status}')">
                            ${isInactive ? 'Ativar' : 'Inativar'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive" style="margin-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
                <span style="color: var(--text-muted); font-size: 0.9rem;">Lista de diretorias, coordenações e setores administrativos do campus.</span>
                <button class="nav-btn" onclick="window.openInstanciaModal()">+ Nova Instância</button>
            </div>
            <table class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Nome da Instância</th>
                        <th style="text-align: left;">Servidor Responsável</th>
                        <th style="text-align: left;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma instância cadastrada.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderModulo1() {
    const isColegiados = appState.mod1Tab === 'COLEGIADOS';
    const isCursos = appState.mod1Tab === 'CURSOS';
    const isInstancias = appState.mod1Tab === 'INSTANCIAS';

    let contentHtml = '';
    if (isColegiados) contentHtml = renderColegiadosTab();
    else if (isCursos) contentHtml = renderCursosTab();
    else contentHtml = renderInstanciasTab();

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%;">
            <div class="diario-header" style="flex-direction: column; align-items: flex-start; gap: 1.5rem;">
                <h2>🏫 Cadastro de Colegiados e Cursos</h2>
                <div style="display: flex; gap: 0.5rem; background: #F1F5F9; padding: 0.3rem; border-radius: 0.5rem; flex-wrap: wrap;">
                    <button class="coord-tab ${isColegiados ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod1Tab('COLEGIADOS')">📁 Gestão de Colegiados</button>
                    <button class="coord-tab ${isCursos ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod1Tab('CURSOS')">🎓 Gestão de Cursos</button>
                    <button class="coord-tab ${isInstancias ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod1Tab('INSTANCIAS')">🏢 Outras Instâncias</button>
                </div>
            </div>
            <div style="padding: 1.5rem;">
                ${contentHtml}
            </div>
        </div>
        ${renderMod1Modals()}
    `;
}

window.openMod3Modal = function(modal) {
    appState.mod3Modal = modal;
    render();
}

window.closeMod3Modal = function() {
    appState.mod3Modal = null;
    render();
}

window.onChangeTipoServidor = function() {
    const tipo = document.getElementById('tipoServidor')?.value;
    if(!tipo) return;
    
    const isDocente = tipo === 'Docente';
    
    document.getElementById('containerColServidor').style.display = isDocente ? 'block' : 'none';
    document.getElementById('containerInstServidor').style.display = isDocente ? 'none' : 'block';
    document.getElementById('containerDisciplinas').style.display = isDocente ? 'block' : 'none';
    
    document.getElementById('textoChefiaServidor').value = isDocente 
        ? "Coordenador do Colegiado selecionado" 
        : "Responsável pela Instância selecionada";
}

window.changeMod3Tab = function(tab) {
    appState.mod3Tab = tab;
    render();
}

function renderServidoresTab() {
    let filteredServidores = mockServidores;
    
    // Filtro por Perfil
    if (appState.currentProfile === 'COORD_COLEGIADO') {
        filteredServidores = mockServidores.filter(s => s.vinculo === 'Colegiado' && s.vinculoId == appState.userVinculoId);
    } else if (appState.currentProfile === 'COPED') {
        filteredServidores = mockServidores.filter(s => s.vinculo === 'Instância' && s.vinculoId == appState.userVinculoId);
    }
    
    // Termo de busca para aplicar estilo nas linhas (DOM filtering)
    const termoBusca = (appState.buscaServidor || '').toLowerCase();

    const rows = filteredServidores.map(s => {
        let vinculoTxt = '';
        if (s.tipo === 'Docente') {
            const col = mockColegiados.find(c => c.id === s.vinculoId);
            vinculoTxt = col ? col.nome : '-';
        } else {
            const inst = mockInstancias.find(i => i.id === s.vinculoId);
            vinculoTxt = inst ? inst.nome : '-';
        }
        
        let amberDot = '';
        if (s.tipo === 'Docente' && (!s.disciplinas || s.disciplinas.length === 0)) {
            amberDot = '<div class="amber-dot tooltip" style="margin-left: 0.5rem;"><span class="tooltiptext">Atenção: Este docente ainda não possui disciplinas atribuídas.</span></div>';
        }

        const badgeStyle = s.tipo === 'Docente' 
            ? 'background: #E0E7FF; color: #4338CA;' 
            : 'background: #FEF3C7; color: #B45309;';
            
        const isInactive = s.status === 'INATIVO';
        const opacityStyle = isInactive ? 'opacity: 0.6;' : '';
        const statusBadge = isInactive ? '<span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">Inativo</span>' : '';

        // SÓ pode exportar docentes se for coordenador ou direção geral/ensino
        const canExport = s.tipo === 'Docente' && (appState.currentProfile === 'DIR_GERAL' || appState.currentProfile === 'COGEN' || appState.currentProfile === 'COORD_COLEGIADO');
        const exportBtn = canExport ? `<button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: #2b9938; color: #2b9938;" onclick="window.openExportarModal(${s.id})">Exportar</button>` : '';

        const sNome = s.nome.toLowerCase();
        const sSiape = (s.siape || '').toLowerCase();
        const matchesBusca = !termoBusca || sNome.includes(termoBusca) || sSiape.includes(termoBusca);
        const displayStyle = matchesBusca ? '' : 'display: none;';

        return `
            <tr class="servidor-row" style="${opacityStyle} ${displayStyle}" data-nome="${s.nome}" data-siape="${s.siape || ''}">
                <td style="font-weight: 500; display: flex; align-items: center;">${s.nome} ${amberDot} ${statusBadge}</td>
                <td><span style="padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; ${badgeStyle}">${s.tipo}</span></td>
                <td>${s.siape}</td>
                <td>${s.email}</td>
                <td>${vinculoTxt}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="window.editServidor(${s.id})">Editar</button>
                        ${exportBtn}
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: #FECACA; color: #DC2626;" onclick="window.toggleStatusServidor(${s.id}, '${s.status}')">
                            ${isInactive ? 'Ativar' : 'Inativar'}
                        </button>
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: #FEF2F2; border-color: #F87171; color: #B91C1C;" onclick="window.deleteServidor(${s.id})">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive">
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; gap: 1rem; flex-wrap: wrap;">
                <input type="text" placeholder="🔍 Pesquisar por nome ou SIAPE..." value="${appState.buscaServidor || ''}" oninput="appState.buscaServidor = this.value; window.filterServidoresTable(this.value);" style="padding: 0.6rem 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); min-width: 300px; max-width: 100%;">
                <button class="nav-btn" onclick="window.openServidorModal()">+ Novo Servidor</button>
            </div>
            <table id="servidores-table" class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Nome</th>
                        <th style="text-align: left;">Tipo</th>
                        <th style="text-align: left;">SIAPE</th>
                        <th style="text-align: left;">E-mail</th>
                        <th style="text-align: left;">Vínculo</th>
                        <th style="text-align: left;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum servidor encontrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

window.changeMod3Tab = function(tab) {
    appState.mod3Tab = tab;
    render();
}

function renderTransferenciasPendentesTab() {
    const pendentes = mockTransferencias.filter(t => t.destino_id == appState.userVinculoId && t.status === 'PENDENTE');
    
    if (pendentes.length === 0) {
        return `<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Nenhuma transferência pendente no momento.</p>`;
    }

    const rows = pendentes.map(t => {
        const serv = mockServidores.find(s => s.id === t.servidor_id);
        const origem = mockColegiados.find(c => c.id === t.origem_id);
        const dataStr = t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '-';
        return `
            <tr>
                <td style="font-weight: 500;">${serv ? serv.nome : 'Desconhecido'}</td>
                <td>${serv ? serv.siape : '-'}</td>
                <td>${origem ? origem.nome : '-'}</td>
                <td>${dataStr}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="nav-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: #10B981;" onclick="window.responderTransferencia(${t.id}, 'ACEITA', ${t.servidor_id}, ${t.destino_id})">✅ Aceitar</button>
                        <button class="nav-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: #EF4444;" onclick="window.responderTransferencia(${t.id}, 'RECUSADA', ${t.servidor_id}, ${t.destino_id})">❌ Recusar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive">
            <table class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Docente</th>
                        <th style="text-align: left;">SIAPE</th>
                        <th style="text-align: left;">Colegiado de Origem</th>
                        <th style="text-align: left;">Data da Solicitação</th>
                        <th style="text-align: left;">Ações</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderTransferenciasHistoricoTab() {
    const historico = mockTransferencias.filter(t => (t.destino_id == appState.userVinculoId || t.origem_id == appState.userVinculoId) && t.status !== 'PENDENTE');
    
    if (historico.length === 0) {
        return `<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Nenhum histórico de transferência encontrado.</p>`;
    }

    const rows = historico.map(t => {
        const serv = mockServidores.find(s => s.id === t.servidor_id);
        const origem = mockColegiados.find(c => c.id === t.origem_id);
        const destino = mockColegiados.find(c => c.id === t.destino_id);
        const dataStr = t.data_resolucao ? new Date(t.data_resolucao).toLocaleDateString('pt-BR') : '-';
        
        const badgeColor = t.status === 'ACEITA' ? '#10B981' : '#EF4444';
        
        return `
            <tr>
                <td style="font-weight: 500;">${serv ? serv.nome : 'Desconhecido'}</td>
                <td>${origem ? origem.nome : '-'}</td>
                <td>${destino ? destino.nome : '-'}</td>
                <td><span style="background: ${badgeColor}; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${t.status}</span></td>
                <td>${dataStr}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive">
            <table class="perms-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Docente</th>
                        <th style="text-align: left;">Origem</th>
                        <th style="text-align: left;">Destino</th>
                        <th style="text-align: left;">Status</th>
                        <th style="text-align: left;">Data Resolução</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

window.responderTransferencia = async function(transfId, status, servidorId, novoVinculoId) {
    if (!confirm(`Deseja realmente ${status === 'ACEITA' ? 'ACEITAR' : 'RECUSAR'} esta transferência?`)) return;
    try {
        await DB.transferencias.responder(transfId, status, servidorId, novoVinculoId);
        showToast('Transferência respondida com sucesso!');
        await loadAllDataFromDB();
        render();
    } catch (e) {
        console.error(e);
        showToast('Erro ao responder transferência.');
    }
}

function renderModulo3() {
    appState.mod3Tab = appState.mod3Tab || 'SERVIDORES';
    
    let contentHtml = '';
    if (appState.mod3Tab === 'SERVIDORES') {
        contentHtml = renderServidoresTab();
    } else if (appState.mod3Tab === 'TRANSF_PENDENTES') {
        contentHtml = renderTransferenciasPendentesTab();
    } else if (appState.mod3Tab === 'TRANSF_HISTORICO') {
        contentHtml = renderTransferenciasHistoricoTab();
    }


    let modalHtml = '';
    if (appState.mod3Modal === 'MODAL_EXPORTAR') {
        const servData = mockServidores.find(s => s.id === appState.exportarServidorId) || {};
        const isCol = appState.currentProfile === 'COORD_COLEGIADO';
        
        // Renderizar opções de colegiados, exceto o colegiado atual do servidor
        const colOptionsExp = mockColegiados
            .filter(c => c.id !== servData.vinculoId)
            .map(c => `<option value="${c.id}">${c.nome}</option>`)
            .join('');

        modalHtml = `
            <div class="modal-overlay animate-fade-in" onclick="closeMod3Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>📤 Exportar Docente: ${servData.nome}</h3>
                        <button class="close-btn" onclick="closeMod3Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 1rem; color: var(--text-muted); font-size: 0.9rem;">
                            Ao exportar este docente, uma solicitação será enviada ao coordenador do colegiado de destino. O docente só será transferido após o aceite.
                        </p>
                        <form onsubmit="window.submitExportarServidor(event, ${servData.id})">
                            <label style="font-weight: 500; font-size: 0.9rem;">Colegiado de Destino *</label>
                            <select id="expDestinoCol" required style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white; margin-bottom: 1rem;">
                                <option value="">-- Selecionar Destino --</option>
                                ${colOptionsExp}
                            </select>
                            
                            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
                                <button type="button" class="outline-btn" onclick="closeMod3Modal()">Cancelar</button>
                                <button type="submit" class="nav-btn" style="background: #2b9938;">Confirmar Exportação</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    } else if (appState.mod3Modal === 'MODAL_SERVIDOR') {
        const isEdit = !!appState.editServidorId;
        const srvData = isEdit ? mockServidores.find(s => s.id === appState.editServidorId) || {} : {};

        const isDir = appState.currentProfile === 'DIR_GERAL' || appState.currentProfile === 'COGEN';
        const isCol = appState.currentProfile === 'COORD_COLEGIADO';
        const isCoped = appState.currentProfile === 'COPED';

        let defaultVinculoType = srvData.vinculo || 'Colegiado';
        if (isCol) defaultVinculoType = 'Colegiado';
        if (isCoped) defaultVinculoType = 'Instância';

        let vinculoIdToUse = srvData.vinculoId;
        if (!isEdit && (isCol || isCoped)) {
            vinculoIdToUse = appState.userVinculoId;
        }

        const colOptions = mockColegiados.map(c => `<option value="${c.id}" ${defaultVinculoType === 'Colegiado' && vinculoIdToUse == c.id ? 'selected' : ''} ${isCol && c.id != appState.userVinculoId ? 'disabled' : ''}>${c.nome}</option>`).join('');
        const instOptions = mockInstancias.map(i => `<option value="${i.id}" ${defaultVinculoType === 'Instância' && vinculoIdToUse == i.id ? 'selected' : ''} ${isCoped && i.id != appState.userVinculoId ? 'disabled' : ''}>${i.nome}</option>`).join('');
        
        const selDisc = srvData.disciplinas || [];
        const discOptions = mockDisciplinas.map(d => `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">
                <input type="checkbox" name="srvDisc" value="${d.id}" ${selDisc.includes(d.id) ? 'checked' : ''}>
                <span style="font-size: 0.85rem;">${d.nome} <span style="color: var(--text-muted); font-size: 0.75rem;">(${d.nucleo})</span></span>
            </label>
        `).join('');
        
        setTimeout(() => {
            if (window.onChangeTipoServidor) window.onChangeTipoServidor();
            if (isCol) {
                const sel = document.getElementById('srvCol');
                if (sel) { sel.value = appState.userVinculoId; sel.disabled = true; }
            }
            if (isCoped) {
                const sel = document.getElementById('srvInst');
                if (sel) { sel.value = appState.userVinculoId; sel.disabled = true; }
            }
        }, 10);
        
        modalHtml = `
            <div class="modal-overlay animate-fade-in" onclick="closeMod3Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>${isEdit ? '✏️ Editar Servidor' : '➕ Cadastrar Servidor'}</h3>
                        <button class="close-btn" onclick="closeMod3Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <form onsubmit="window.submitServidor(event)" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            
                            <div style="grid-column: span 2;">
                                <label style="font-weight: 500; font-size: 0.9rem;">Nome Completo *</label>
                                <input type="text" id="srvNome" value="${srvData.nome || ''}" required placeholder="Ex: João da Silva" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Matrícula SIAPE *</label>
                                <input type="text" id="srvSiape" value="${srvData.siape || ''}" required placeholder="Ex: 1234567" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Tipo de Servidor *</label>
                                <select id="tipoServidor" onchange="onChangeTipoServidor()" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="Docente" ${srvData.tipo === 'Docente' ? 'selected' : ''}>Docente</option>
                                    <option value="Técnico Administrativo" ${srvData.tipo === 'Técnico Administrativo' ? 'selected' : ''}>Técnico Administrativo</option>
                                </select>
                            </div>

                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">E-mail Institucional *</label>
                                <input type="email" id="srvEmail" value="${srvData.email || ''}" required placeholder="@ifap.edu.br" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Contato (WhatsApp)</label>
                                <input type="text" id="srvTelefone" value="${srvData.telefone || ''}" placeholder="(XX) 9XXXX-XXXX" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>

                            <div style="grid-column: span 2; display: none;">
                                <input type="hidden" id="srvVinculo" value="${defaultVinculoType}">
                            </div>

                            <div id="containerColServidor" style="grid-column: span 2; ${defaultVinculoType === 'Colegiado' ? '' : 'display:none;'}">
                                <label style="font-weight: 500; font-size: 0.9rem;">Vínculo (Colegiado) *</label>
                                <select id="srvCol" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Selecionar Colegiado --</option>
                                    ${colOptions}
                                </select>
                            </div>

                            <div id="containerInstServidor" style="grid-column: span 2; ${defaultVinculoType === 'Instância' ? '' : 'display:none;'}">
                                <label style="font-weight: 500; font-size: 0.9rem;">Vínculo (Instância Administrativa) *</label>
                                <select id="srvInst" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="">-- Selecionar Instância --</option>
                                    ${instOptions}
                                </select>
                            </div>
                            
                            <div style="grid-column: span 2;">
                                <label style="font-weight: 500; font-size: 0.9rem;">Chefia Imediata (Automático)</label>
                                <input type="text" id="textoChefiaServidor" disabled style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: #f3f4f6; color: #6b7280; font-weight: 600;">
                            </div>
                            
                            <div id="containerDisciplinas" style="grid-column: span 2; border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 0.5rem; ${srvData.tipo === 'Docente' ? '' : 'display:none;'}">
                                <label style="font-weight: 500; font-size: 0.9rem; display: block; margin-bottom: 0.4rem;">Disciplinas Ministradas (Multi-seleção)</label>
                                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.8rem;">Selecione as disciplinas que este docente está apto a lecionar.</p>
                                <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 150px; overflow-y: auto; padding-right: 0.5rem; border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm);">
                                    ${discOptions || '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhuma disciplina cadastrada.</span>'}
                                </div>
                            </div>

                            <button type="submit" class="nav-btn" style="grid-column: span 2; width: 100%; margin-top: 1rem;">Salvar Servidor</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    let tabsHtml = '';
    if (appState.currentProfile === 'COORD_COLEGIADO') {
        const pendentesCount = mockTransferencias.filter(t => t.destino_id == appState.userVinculoId && t.status === 'PENDENTE').length;
        const pendentesBadge = pendentesCount > 0 ? `<span style="background: #EF4444; color: white; padding: 0.1rem 0.4rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.4rem;">${pendentesCount}</span>` : '';
        tabsHtml = `
            <div style="display: flex; gap: 0.5rem; background: #F1F5F9; padding: 0.3rem; border-radius: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
                <button class="coord-tab ${appState.mod3Tab === 'SERVIDORES' ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod3Tab('SERVIDORES')">👨‍💼 Servidores Ativos</button>
                <button class="coord-tab ${appState.mod3Tab === 'TRANSF_PENDENTES' ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod3Tab('TRANSF_PENDENTES')">⏳ Transferências Pendentes ${pendentesBadge}</button>
                <button class="coord-tab ${appState.mod3Tab === 'TRANSF_HISTORICO' ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod3Tab('TRANSF_HISTORICO')">📜 Histórico de Transferências</button>
            </div>
        `;
    }

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%;">
            <div style="padding: 1.5rem;">
                <h2 style="margin-bottom: 1.5rem;">👨‍💼 Gestão de Servidores</h2>
                ${tabsHtml}
                ${contentHtml}
            </div>
        </div>
        ${modalHtml}
    `;
}

window.changeMod4Tab = function(tab) {
    appState.mod4Tab = tab;
    render();
}

window.changeMod4GridContext = function(field, value) {
    appState.mod4GridContext[field] = value;
    render();
}

function renderMod4TemplatesTab() {
    const rows = mockTemplates.map(t => `
        <tr>
            <td style="font-weight: 500;">${t.nome}</td>
            <td><span class="badge-blue" style="background: #E0E7FF; color: #4338CA; border: 1px solid #C7D2FE; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Ativo</span></td>
            <td style="font-size: 0.85rem; color: var(--text-muted);">${t.slots.map(s => s.t).join('<br>')}</td>
            <td><button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" disabled>Editar Padrão</button></td>
        </tr>
    `).join('');

    return `
        <div style="margin-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <p style="color: var(--text-muted); font-size: 0.9rem;">Esses blocos definem a estrutura de horas para cada turno.</p>
                <button class="nav-btn" disabled>+ Novo Template</button>
            </div>
            
            <table class="perms-table" style="margin-bottom: 2rem;">
                <thead>
                    <tr>
                        <th style="text-align: left;">Nome do Template</th>
                        <th style="text-align: left;">Status</th>
                        <th style="text-align: left;">Grade de Horários</th>
                        <th style="text-align: left;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr>
                        <td style="font-weight: 500; color: #9CA3AF;"><em>Template Reduzido (Eventos)</em></td>
                        <td><span class="badge-gray" style="background: #F3F4F6; color: #6B7280; border: 1px solid #D1D5DB; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Inativo</span></td>
                        <td style="font-size: 0.85rem; color: #9CA3AF;"><em>Placeholder - Para dias com horário letivo menor.</em></td>
                        <td><button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Ativar</button></td>
                    </tr>
                    <tr>
                        <td style="font-weight: 500; color: #9CA3AF;"><em>Template Período de Avaliações</em></td>
                        <td><span class="badge-gray" style="background: #F3F4F6; color: #6B7280; border: 1px solid #D1D5DB; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Inativo</span></td>
                        <td style="font-size: 0.85rem; color: #9CA3AF;"><em>Placeholder - Usado apenas nas semanas de prova.</em></td>
                        <td><button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Ativar</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function renderMod4CalendarioTab() {
    const etapasHtml = mockEtapasAvaliativas.map(e => `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
            <h4 style="margin-bottom: 0.8rem; color: var(--primary-color);">📊 ${e.etapa}ª Etapa Avaliativa</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <label style="font-size: 0.85rem; font-weight: 500;">Data de Início das Provas:</label>
                    <input type="date" value="${e.inicio}" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                </div>
                <div>
                    <label style="font-size: 0.85rem; font-weight: 500;">Data de Fim das Provas:</label>
                    <input type="date" value="${e.fim}" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div style="margin-top: 1.5rem;">
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Configure os períodos de prova. Durante essas datas, o sistema utilizará a <strong>Grade de Provas</strong> ao invés da Grade Regular.</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                ${etapasHtml}
            </div>
            <div style="display: flex; justify-content: flex-end;">
                <button class="nav-btn">Salvar Calendário Letivo</button>
            </div>
        </div>
    `;
}

window.onMod4FilterGrid = function(slotKey, field, value) {
    if (!appState.mod4GridTemp) appState.mod4GridTemp = {};
    if (!appState.mod4GridTemp[slotKey]) appState.mod4GridTemp[slotKey] = { discId: '', profId: '' };
    
    appState.mod4GridTemp[slotKey][field] = value;
    render();
}

function renderMod4GradeTab() {
    const ctx = appState.mod4GridContext;
    const cursosOptions = mockCursosCadastrados.map(c => `<option value="${c.id}" ${ctx.cursoId == c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    
    let gridContent = '';
    
    if (!ctx.cursoId) {
        gridContent = `
            <div style="text-align: center; padding: 3rem; background: white; border: 1px dashed var(--border-color); border-radius: var(--radius-md); margin-top: 1.5rem;">
                <span style="font-size: 3rem;">👆</span>
                <h3 style="margin-top: 1rem;">Selecione um Curso para montar a grade</h3>
                <p style="color: var(--text-muted); margin-top: 0.5rem;">A grade é montada com base na turma do curso selecionado.</p>
            </div>
        `;
    } else {
        const template = mockTemplates.find(t => t.id === ctx.turno);
        
        const linesHtml = template.slots.map(slot => {
            if (slot.idx === -1) {
                return `
                    <div style="display: grid; grid-template-columns: 150px 1fr; background: #F1F5F9; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.8rem; text-align: center; color: var(--text-muted); font-weight: 500; font-style: italic;">
                        <div style="text-align: left;">${slot.t}</div>
                        <div>I N T E R V A L O</div>
                    </div>
                `;
            }
            
            const slotKey = `${ctx.cursoId}_${ctx.tipo}_${ctx.dia}_${slot.idx}`;
            if (!appState.mod4GridTemp) appState.mod4GridTemp = {};
            const cellState = appState.mod4GridTemp[slotKey] || { discId: '', profId: '' };

            let discOptionsArr = mockDisciplinas;
            let profOptionsArr = mockServidores.filter(s => s.tipo === 'Docente');

            if (cellState.profId) {
                const prof = mockServidores.find(s => s.id == cellState.profId);
                if (prof && prof.disciplinas) {
                    discOptionsArr = mockDisciplinas.filter(d => prof.disciplinas.includes(d.id));
                }
            }

            if (cellState.discId) {
                profOptionsArr = mockServidores.filter(s => s.tipo === 'Docente' && s.disciplinas && s.disciplinas.includes(parseInt(cellState.discId)));
            }

            const discOptions = discOptionsArr.map(d => `<option value="${d.id}" ${cellState.discId == d.id ? 'selected' : ''}>${d.nome}</option>`).join('');
            const profOptions = profOptionsArr.map(p => `<option value="${p.id}" ${cellState.profId == p.id ? 'selected' : ''}>${p.nome}</option>`).join('');

            return `
                <div style="display: grid; grid-template-columns: 150px 1fr 1fr; gap: 1rem; align-items: center; background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; transition: all 0.2s;">
                    <div style="font-weight: 600; color: var(--primary-color);">🕒 ${slot.t}</div>
                    
                    <div>
                        <label style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">Disciplina</label>
                        <select onchange="onMod4FilterGrid('${slotKey}', 'discId', this.value)" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                            <option value="">-- Horário Livre --</option>
                            ${discOptions}
                        </select>
                    </div>
                    
                    <div>
                        <label style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">Professor Responsável</label>
                        <select onchange="onMod4FilterGrid('${slotKey}', 'profId', this.value)" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                            <option value="">-- Selecione o Professor --</option>
                            ${profOptions}
                        </select>
                    </div>
                </div>
            `;
        }).join('');

        gridContent = `
            <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.8rem;">
                ${linesHtml}
                <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                    <button class="nav-btn" onclick="window.saveMod4Grade()">Salvar ${ctx.dia}</button>
                </div>
            </div>
        `;
    }

    return `
        <div style="margin-top: 1.5rem;">
            <!-- Top Action Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; background: #F8FAFC; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 1rem;">
                    <button class="outline-btn" style="border-color: var(--if-green); color: var(--if-green); font-weight: 600;" onclick="window.openMod4TimetableModal('TURMA')">👁️ Ver Grade do Curso Completa</button>
                    <button class="outline-btn" style="font-weight: 600;" onclick="window.openMod4TimetableModal('PROFESSOR')">👁️ Ver Grade por Professor</button>
                </div>
            </div>

            <!-- Seletor de Contexto -->
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 1rem; background: white; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                <div>
                    <label style="font-size: 0.85rem; font-weight: 500;">1. Selecione o Curso:</label>
                    <select onchange="changeMod4GridContext('cursoId', this.value)" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                        <option value="">-- Selecionar Curso --</option>
                        ${cursosOptions}
                    </select>
                </div>
                <div>
                    <label style="font-size: 0.85rem; font-weight: 500;">2. Tipo de Grade:</label>
                    <select onchange="changeMod4GridContext('tipo', this.value)" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                        <option value="REG" ${ctx.tipo === 'REG' ? 'selected' : ''}>Semanas Regulares</option>
                        <option value="PROV" ${ctx.tipo === 'PROV' ? 'selected' : ''}>Período de Provas</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 0.85rem; font-weight: 500;">3. Turno Base:</label>
                    <select onchange="changeMod4GridContext('turno', this.value)" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                        <option value="T_MANHA" ${ctx.turno === 'T_MANHA' ? 'selected' : ''}>Manhã</option>
                        <option value="T_TARDE" ${ctx.turno === 'T_TARDE' ? 'selected' : ''}>Tarde</option>
                        <option value="T_NOITE" ${ctx.turno === 'T_NOITE' ? 'selected' : ''}>Noite</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 0.85rem; font-weight: 500;">4. Dia da Semana:</label>
                    <select onchange="changeMod4GridContext('dia', this.value)" style="width: 100%; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.3rem;">
                        ${['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].map(d => `<option value="${d}" ${ctx.dia === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
            </div>

            <!-- Grade em Si -->
            ${gridContent}
        </div>
    `;
}

function renderModulo4() {
    const isTemp = appState.mod4Tab === 'TEMPLATES';
    const isCal = appState.mod4Tab === 'CALENDARIO';
    const isGrade = appState.mod4Tab === 'GRADE';

    let contentHtml = '';
    if (isTemp) contentHtml = renderMod4TemplatesTab();
    else if (isCal) contentHtml = renderMod4CalendarioTab();
    else contentHtml = renderMod4GradeTab();

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%;">
            <div class="diario-header" style="flex-direction: column; align-items: flex-start; gap: 1.5rem;">
                <h2>📅 Montagem do Horário Semanal</h2>
                <div style="display: flex; gap: 0.5rem; background: #F1F5F9; padding: 0.3rem; border-radius: 0.5rem; flex-wrap: wrap;">
                    <button class="coord-tab ${isGrade ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod4Tab('GRADE')">✏️ Montar Grade de Horários</button>
                    <button class="coord-tab ${isCal ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod4Tab('CALENDARIO')">📆 Calendário de Avaliações</button>
                    <button class="coord-tab ${isTemp ? 'active' : ''}" style="border-radius: 0.3rem; border: none; padding: 0.6rem 1.2rem;" onclick="changeMod4Tab('TEMPLATES')">⏱️ Gestão de Templates</button>
                </div>
            </div>
            <div style="padding: 1.5rem;">
                ${contentHtml}
            </div>
        </div>
    `;
}

window.openMod2Modal = function(modal) {
    appState.mod2Modal = modal;
    render();
}

window.closeMod2Modal = function() {
    appState.mod2Modal = null;
    render();
}

function renderModulo2() {
    const rows = mockDisciplinas.map(d => {
        const badgeStyle = d.nucleo === 'Núcleo Básico'
            ? 'background: #E0F2FE; color: #0284C7; border: 1px solid #BAE6FD;'
            : 'background: #F3E8FF; color: #7E22CE; border: 1px solid #E9D5FF;';
            
        let cursosNomes = d.cursosIds.map(cid => {
            const curso = mockCursosCadastrados.find(c => c.id === cid);
            return curso ? curso.nome : '';
        }).filter(n => n !== '').join(', ');
        
        if (!cursosNomes) cursosNomes = '<span style="color: var(--text-muted); font-style: italic;">Nenhum curso vinculado</span>';

        const isInactive = d.status === 'INATIVO';
        const opacityStyle = isInactive ? 'opacity: 0.6;' : '';
        const statusBadge = isInactive ? '<span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">Inativa</span>' : '';

        return `
            <tr style="${opacityStyle}">
                <td style="font-weight: 500;">${d.codigo ? `<span style="color:var(--text-muted); font-size:0.8rem; margin-right: 0.3rem;">[${d.codigo}]</span>` : ''}${d.nome} ${statusBadge}</td>
                <td><span style="padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; ${badgeStyle}">${d.nucleo}</span></td>
                <td style="font-size: 0.9rem; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${cursosNomes}">${cursosNomes}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="window.editDisciplina(${d.id})">Editar</button>
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: #FECACA; color: #DC2626;" onclick="window.toggleStatusDisciplina(${d.id}, '${d.status}')">
                            ${isInactive ? 'Ativar' : 'Inativar'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    let modalHtml = '';
    if (appState.mod2Modal === 'MODAL_DISCIPLINA') {
        const isEdit = !!appState.editDisciplinaId;
        const discData = isEdit ? mockDisciplinas.find(d => d.id === appState.editDisciplinaId) || {} : {};
        const selCursos = discData.cursosIds || [];

        const cursosCheckboxes = mockCursosCadastrados.map(c => `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">
                <input type="checkbox" name="discCursos" value="${c.id}" ${selCursos.includes(c.id) ? 'checked' : ''}>
                <span style="font-size: 0.9rem;">${c.nome} <span style="color: var(--text-muted); font-size: 0.75rem;">(${c.modalidade})</span></span>
            </label>
        `).join('');

        modalHtml = `
            <div class="modal-overlay animate-fade-in" onclick="closeMod2Modal()">
                <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>${isEdit ? '✏️ Editar Disciplina' : '➕ Cadastrar Disciplina'}</h3>
                        <button class="close-btn" onclick="closeMod2Modal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <form onsubmit="window.submitDisciplina(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Código da Disciplina (Opcional)</label>
                                <input type="text" id="discCodigo" value="${discData.codigo || ''}" placeholder="Ex: BIO101" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>

                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Nome da Disciplina *</label>
                                <input type="text" id="discNome" value="${discData.nome || ''}" required placeholder="Ex: Biologia Celular" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem;">
                            </div>
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem;">Núcleo *</label>
                                <select id="discNucleo" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-top: 0.4rem; background: white;">
                                    <option value="Núcleo Básico" ${discData.nucleo === 'Núcleo Básico' ? 'selected' : ''}>Núcleo Básico</option>
                                    <option value="Núcleo Específico" ${discData.nucleo === 'Núcleo Específico' ? 'selected' : ''}>Núcleo Específico</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style="font-weight: 500; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Vincular a Cursos (Multi-seleção)</label>
                                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.8rem;">Selecione todos os cursos que utilizam esta disciplina na matriz curricular.</p>
                                <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 200px; overflow-y: auto; padding-right: 0.5rem; border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm);">
                                    ${cursosCheckboxes || '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum curso cadastrado.</span>'}
                                </div>
                            </div>

                            <button type="submit" class="nav-btn" style="width: 100%; margin-top: 1rem;">Salvar Disciplina</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="coord-panel animate-fade" style="margin: 0; min-height: 100%;">
            <div class="diario-header" style="flex-direction: column; align-items: flex-start; gap: 1rem;">
                <h2>📚 Cadastro de Disciplinas</h2>
                <p style="color: var(--text-muted);">Alimente o banco de disciplinas e ligue-as a múltiplos cursos.</p>
            </div>
            <div style="padding: 1.5rem;">
                <div class="table-responsive">
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
                        <button class="nav-btn" onclick="window.openDisciplinaModal()">+ Nova Disciplina</button>
                    </div>
                    <table class="perms-table">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Nome da Disciplina</th>
                                <th style="text-align: left;">Núcleo</th>
                                <th style="text-align: left;">Cursos Vinculados</th>
                                <th style="text-align: left;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        ${modalHtml}
    `;
}

window.openMod4TimetableModal = function(mode) {
    appState.modalMod4Timetable = true;
    appState.mod4TimetableMode = mode || 'TURMA';
    if (!appState.mod4GridContext.cursoId && mockCursosCadastrados.length > 0) {
        appState.mod4GridContext.cursoId = mockCursosCadastrados[0].id;
    }
    const professors = mockServidores.filter(s => s.tipo === 'Docente');
    if (!appState.mod4TimetableSelectedProfId && professors.length > 0) {
        appState.mod4TimetableSelectedProfId = professors[0].id;
    }
    render();
}

window.closeMod4TimetableModal = function() {
    appState.modalMod4Timetable = false;
    render();
}

window.changeMod4TimetableMode = function(mode) {
    appState.mod4TimetableMode = mode;
    render();
}

window.changeMod4TimetableSelectedProf = function(profId) {
    appState.mod4TimetableSelectedProfId = profId;
    render();
}

window.changeMod4TimetableSelectedCurso = function(cursoId) {
    appState.mod4GridContext.cursoId = cursoId;
    render();
}

window.printTimetable = function() {
    window.print();
}

window.saveMod4Grade = function() {
    const curso = mockCursosCadastrados.find(c => c.id == appState.mod4GridContext.cursoId);
    const cursoNome = curso ? curso.nome : '';
    window.showToast(`Grade de Horário salva com sucesso para ${cursoNome} (${appState.mod4GridContext.dia})!`);
    registrarAcaoAuditoria(
        appState.currentProfile === 'ESTAGIARIO' ? 'Estagiário (Admin)' : 'Coordenador',
        'Montagem de Horário',
        `Salvou grade de horário de ${appState.mod4GridContext.dia} do curso ${cursoNome} (${appState.mod4GridContext.turno})`
    );
}

window.marcarTodosPresentes = function() {
    const slotIdx = appState.selectedTimeSlot;
    mockSalasManha.forEach(sala => {
        const key = `${sala.id}_${slotIdx}`;
        if (!appState.presences[key]) appState.presences[key] = {};
        appState.presences[key].status = 'presente';
        appState.presences[key].substitutoId = null;
    });
    window.showToast("Ronda consolidada temporariamente: todas as salas marcadas como PRESENTE!");
    window.saveOfflineData();
    render();
}

function renderMod4TimetableModal() {
    if (!appState.modalMod4Timetable) return '';

    const selectedCursoId = appState.mod4GridContext.cursoId || (mockCursosCadastrados[0] ? mockCursosCadastrados[0].id : '');
    let selectedProfId = appState.mod4TimetableSelectedProfId;
    const professors = mockServidores.filter(s => s.tipo === 'Docente');
    if (!selectedProfId && professors.length > 0) {
        selectedProfId = professors[0].id;
    }

    const mode = appState.mod4TimetableMode; // 'TURMA' or 'PROFESSOR'
    const currentTipo = appState.mod4GridContext.tipo;
    const currentTurno = appState.mod4GridContext.turno;

    const courseOptions = mockCursosCadastrados.map(c => 
        `<option value="${c.id}" ${selectedCursoId == c.id ? 'selected' : ''}>${c.nome}</option>`
    ).join('');

    const profOptions = professors.map(p => 
        `<option value="${p.id}" ${selectedProfId == p.id ? 'selected' : ''}>${p.nome}</option>`
    ).join('');

    const template = mockTemplates.find(t => t.id === currentTurno) || mockTemplates[0];
    const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

    const thsHtml = days.map(d => `<th>${d}-feira</th>`).join('');

    const rowsHtml = template.slots.map(slot => {
        if (slot.idx === -1) {
            return `
                <tr class="interval-row">
                    <td>${slot.t}</td>
                    <td colspan="5">INTERVALO LETIVO</td>
                </tr>
            `;
        }

        const tdsHtml = days.map(day => {
            if (mode === 'TURMA') {
                const slotKey = `${selectedCursoId}_${currentTipo}_${day}_${slot.idx}`;
                const cell = appState.mod4GridTemp && appState.mod4GridTemp[slotKey];
                if (cell && cell.discId && cell.profId) {
                    const disc = mockDisciplinas.find(d => d.id == cell.discId);
                    const prof = mockServidores.find(p => p.id == cell.profId);
                    return `
                        <td>
                            <div class="timetable-cell-content">
                                <b>${disc ? disc.nome : 'Matéria'}</b><br>
                                <span class="prof-label">👤 ${prof ? prof.nome : 'Professor'}</span>
                            </div>
                        </td>
                    `;
                } else {
                    return `<td><span class="empty-cell-label">- Livre -</span></td>`;
                }
            } else {
                const matches = [];
                mockCursosCadastrados.forEach(c => {
                    const slotKey = `${c.id}_${currentTipo}_${day}_${slot.idx}`;
                    const cell = appState.mod4GridTemp && appState.mod4GridTemp[slotKey];
                    if (cell && cell.profId == selectedProfId) {
                        matches.push({
                            curso: c.nome,
                            discId: cell.discId
                        });
                    }
                });

                if (matches.length === 1) {
                    const disc = mockDisciplinas.find(d => d.id == matches[0].discId);
                    return `
                        <td>
                            <div class="timetable-cell-content">
                                <b>${disc ? disc.nome : 'Matéria'}</b><br>
                                <span class="course-label">🏫 ${matches[0].curso}</span>
                            </div>
                        </td>
                    `;
                } else if (matches.length > 1) {
                    return `
                        <td>
                            <div class="collision-box animate-pulse">
                                <div class="collision-alert">⚠️ Choque de Horário!</div>
                                ${matches.map(m => {
                                    const disc = mockDisciplinas.find(d => d.id == m.discId);
                                    return `<div class="collision-detail"><b>${m.curso}</b>: ${disc ? disc.nome : 'Matéria'}</div>`;
                                }).join('')}
                            </div>
                        </td>
                    `;
                } else {
                    return `<td><span class="empty-cell-label">Livre</span></td>`;
                }
            }
        }).join('');

        return `
            <tr>
                <td style="font-weight: 600; background: #F8FAFC;">${slot.t}</td>
                ${tdsHtml}
            </tr>
        `;
    }).join('');

    const targetName = mode === 'TURMA' 
        ? (mockCursosCadastrados.find(c => c.id == selectedCursoId)?.nome || 'Turma')
        : (mockServidores.find(p => p.id == selectedProfId)?.nome || 'Professor');

    return `
        <div class="modal-overlay animate-fade-in" onclick="window.closeMod4TimetableModal()" style="z-index: 1000;">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 1000px; width: 95%;">
                <div class="modal-header">
                    <h3>📅 Grade Semanal Tradicional: <span style="color: var(--if-green); font-weight: 700;">${targetName}</span></h3>
                    <button class="close-btn" onclick="window.closeMod4TimetableModal()">✕</button>
                </div>
                <div class="modal-body" style="padding: 1.5rem;">
                    <div class="timetable-filter-bar">
                        <div class="timetable-toggle-container">
                            <button class="toggle-btn ${mode === 'TURMA' ? 'active' : ''}" onclick="window.changeMod4TimetableMode('TURMA')">🏫 Por Turma (Curso)</button>
                            <button class="toggle-btn ${mode === 'PROFESSOR' ? 'active' : ''}" onclick="window.changeMod4TimetableMode('PROFESSOR')">👨‍💼 Por Professor</button>
                        </div>
                        
                        ${mode === 'TURMA' ? `
                            <div class="timetable-filter-item">
                                <label>Selecionar Curso:</label>
                                <select onchange="window.changeMod4TimetableSelectedCurso(this.value)" style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                                    ${courseOptions}
                                </select>
                            </div>
                        ` : `
                            <div class="timetable-filter-item">
                                <label>Selecionar Professor:</label>
                                <select onchange="window.changeMod4TimetableSelectedProf(this.value)" style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                                    ${profOptions}
                                </select>
                            </div>
                        `}

                        <div class="timetable-filter-item">
                            <label>Turno:</label>
                            <select onchange="window.changeMod4GridContext('turno', this.value)" style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                                <option value="T_MANHA" ${currentTurno === 'T_MANHA' ? 'selected' : ''}>Manhã</option>
                                <option value="T_TARDE" ${currentTurno === 'T_TARDE' ? 'selected' : ''}>Tarde</option>
                                <option value="T_NOITE" ${currentTurno === 'T_NOITE' ? 'selected' : ''}>Noite</option>
                            </select>
                        </div>

                        <div class="timetable-filter-item">
                            <label>Tipo:</label>
                            <select onchange="window.changeMod4GridContext('tipo', this.value)" style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                                <option value="REG" ${currentTipo === 'REG' ? 'selected' : ''}>Regular</option>
                                <option value="PROV" ${currentTipo === 'PROV' ? 'selected' : ''}>Período de Prova</option>
                            </select>
                        </div>

                        <button class="print-btn" onclick="window.printTimetable()">
                            🖨️ Imprimir Grade (Papel)
                        </button>
                    </div>

                    <div class="timetable-print-area">
                        <table class="timetable-table">
                            <thead>
                                <tr>
                                    <th style="width: 12%;">Horário</th>
                                    ${thsHtml}
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAdminPanel() {
    const allowedModules = Object.keys(MODULOS_INFO).filter(modId => {
        return appState.permissions[modId].includes(appState.currentProfile);
    });

    const sidebarHtml = allowedModules.map(modId => {
        const mod = MODULOS_INFO[modId];
        const isActive = appState.activeModule === modId || (appState.activeModule === 'MOD_5_SETUP' && modId === 'MOD_5');
        return `
            <button class="sidebar-btn ${isActive ? 'active' : ''}" onclick="changeModule('${modId}')">
                <span class="sidebar-icon">${mod.icone}</span>
                <span class="sidebar-text">${mod.titulo}</span>
            </button>
        `;
    }).join('');

    let moduleContent = '';
    
    if (appState.activeModule === 'MOD_CONFIG') {
        moduleContent = renderPermissionsConfig();
    } else if (appState.activeModule === 'MOD_1') {
        moduleContent = renderModulo1();
    } else if (appState.activeModule === 'MOD_2') {
        moduleContent = renderModulo2();
    } else if (appState.activeModule === 'MOD_3') {
        moduleContent = renderModulo3();
    } else if (appState.activeModule === 'MOD_4') {
        moduleContent = renderModulo4();
    } else if (appState.activeModule === 'MOD_5_SETUP') {
        moduleContent = renderShiftSelection();
    } else if (appState.activeModule === 'MOD_5') {
        moduleContent = renderRoundView();
    } else if (appState.activeModule === 'MOD_6') {
        if (appState.currentProfile === 'COORD_COLEGIADO') {
            moduleContent = renderCoordChefiados(); 
        } else {
            if (appState.chefiadosNivel0 === null) {
                moduleContent = renderChefiadosTelaZero();
            } else {
                moduleContent = renderCoordChefiados();
            }
        }
        // renderMod6Modals is injected inside renderCoordChefiados directly
    } else if (appState.activeModule === 'MOD_7') {
        if (appState.currentProfile === 'COORD_COLEGIADO') {
            if (appState.coordCursoView === 'LIST') moduleContent = renderCoordCursosList();
            else moduleContent = renderCoordDiarioCurso();
        } else {
            if (appState.coordNivel0 === null) {
                moduleContent = renderCoordTelaZero();
            } else {
                if (appState.coordCursoView === 'LIST') moduleContent = renderCoordCursosList();
                else moduleContent = renderCoordDiarioCurso();
            }
        }
    } else if (appState.activeModule === 'MOD_8') {
        moduleContent = renderDashboard();
    } else if (appState.activeModule === 'MOD_SERVIDOR') {
        moduleContent = renderModServidor();
    } else if (appState.activeModule === 'MOD_COPED') {
        moduleContent = renderModCoped();
    } else if (appState.activeModule === 'MOD_SUPER') {
        moduleContent = renderModSuper();
    } else {
        const mod = MODULOS_INFO[appState.activeModule];
        moduleContent = `
            <div class="module-placeholder animate-fade">
                <div style="font-size: 3rem; margin-bottom: 1rem;">${mod.icone}</div>
                <h2>${mod.titulo}</h2>
                <p style="color: var(--text-muted); margin-top: 1rem;">Módulo em construção. Em breve você poderá operar os dados aqui!</p>
            </div>
        `;
    }

    let transferAlertHtml = '';
    if (appState.currentProfile === 'COORD_COLEGIADO') {
        const pendentes = mockTransferencias.filter(t => t.destino_id == appState.userVinculoId && t.status === 'PENDENTE');
        if (pendentes.length > 0) {
            transferAlertHtml = `
                <div style="background: #FEF3C7; color: #B45309; padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 500;">
                        <span style="font-size: 1.2rem;">⚠️</span>
                        <span>Você tem <strong>${pendentes.length}</strong> solicitação(ões) de transferência de servidor pendente(s).</span>
                    </div>
                    <button class="nav-btn" style="background: #B45309; padding: 0.4rem 1rem; font-size: 0.85rem;" onclick="appState.activeModule = 'MOD_3'; render();">Analisar Agora</button>
                </div>
            `;
        }
    }

    return `
        <div class="admin-layout ${appState.sidebarCollapsed ? 'collapsed' : ''} ${appState.mobileMenuOpen ? 'mobile-open' : ''}">
            <div class="sidebar-overlay" onclick="toggleMobileMenu()"></div>
            <button class="mobile-menu-trigger" onclick="toggleMobileMenu()">☰</button>
            <aside class="admin-sidebar" style="position: relative; overflow: visible;">
                <div class="sidebar-content-scroll" style="overflow-y: auto; height: 100%; flex: 1; padding-bottom: 2rem;">
                    <div class="sidebar-header-title" title="MENU DE MÓDULOS">MENU DE MÓDULOS</div>
                    ${sidebarHtml}
                </div>
                <button class="sidebar-toggle-handle" onclick="toggleSidebar()" title="Recolher/Expandir Menu">
                    <span>${appState.sidebarCollapsed ? '▶' : '◀'}</span>
                </button>
            </aside>
            <div class="admin-content-area" style="display: flex; flex-direction: column;">
                ${transferAlertHtml}
                ${moduleContent}
            </div>
        </div>
        ${renderModalSubstitutos()}
        ${renderModalSemanal()}
        ${renderMod4TimetableModal()}
    `;
}

function getChefiaImediata(prof) {
    if (!prof) return { nome: "Direção de Ensino (DEN)", email: "den@ifap.edu.br" };
    if (prof.vinculo === 'Colegiado') {
        const colegiado = mockColegiados.find(c => c.id === prof.vinculoId);
        if (colegiado && colegiado.coordenadorId) {
            const coord = mockServidores.find(s => s.id === colegiado.coordenadorId);
            if (coord) return coord;
        }
    } else if (prof.vinculo === 'Instância') {
        const inst = mockInstancias.find(i => i.id === prof.vinculoId);
        if (inst && inst.responsavelId) {
            const coord = mockServidores.find(s => s.id === inst.responsavelId);
            if (coord) return coord;
        }
    }
    return { nome: "Direção de Ensino (DEN)", email: "den@ifap.edu.br" };
}

window.updatePresence = function(salaId, status, profNome, salaNome) {
    const key = `${salaId}_${appState.selectedTimeSlot}`;
    if (!appState.presences[key]) appState.presences[key] = {};
    
    appState.presences[key].status = status;
    if (status !== 'ausente_com') appState.presences[key].substitutoId = null;
    
    appState.toast = null; // Clear toast during marking to avoid immediate alerts
    window.saveOfflineData();
    render();
}

window.gerarRelatorioFiscal = function() {
    const fiscalName = appState.currentProfile === 'FISCAL' ? 'Estevão' : 'Administrador'; // Pode vir do login no futuro
    const parts = appState.currentDate.split('-');
    const yearMonth = `${parts[0]}-${parts[1]}`; // YYYY-MM
    
    // Filtrar dados do mês selecionado
    let reportRows = '';
    
    // Busca em presences e correcoes
    // Como presences é stateful por timeslot, usar auditLogs ou varrer finalizedRondas é melhor. 
    // Por simplicidade na demonstração, vamos usar o auditLogs e rondaAbsences, mas vamos construir um mock para simular o relatório preenchido
    // se não houver dados reais suficientes do mês.
    let hasData = false;
    
    for (const [key, status] of Object.entries(appState.rondaAbsences || {})) {
        const [profId, dateStr] = key.split('_');
        if (dateStr.startsWith(yearMonth)) {
            hasData = true;
            const prof = mockProfessores.find(p => p.id == profId);
            const profName = prof ? prof.nome : 'Desconhecido';
            const justificado = appState.correcoesPresenca && appState.correcoesPresenca[key] === 'presente';
            
            let statusText = status === 'ausente_sem' ? 'Ausente' : (status === 'ausente_com' ? 'Ausente (Substituído)' : 'Ausente (Justificado)');
            let coordAction = justificado ? 'Corrigido para Presente (Justificativa: Estava no laboratório/Atividade)' : 'Mantido (Aguardando/Validado)';
            
            reportRows += `
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">${dateStr.split('-').reverse().join('/')}</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">${profName}</td>
                    <td style="border: 1px solid #ccc; padding: 8px; color: red;">${statusText}</td>
                    <td style="border: 1px solid #ccc; padding: 8px; color: ${justificado ? 'green' : '#444'};">${coordAction}</td>
                </tr>
            `;
        }
    }
    
    if (!hasData) {
        reportRows = `<tr><td colspan="4" style="text-align:center; padding: 16px; border: 1px solid #ccc;">Nenhuma ausência registrada neste mês.</td></tr>`;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório Mensal - ${yearMonth}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
                    .header { display: flex; align-items: center; border-bottom: 2px solid #2b9938; padding-bottom: 20px; margin-bottom: 30px; }
                    .logo { height: 80px; margin-right: 20px; }
                    .title-area { flex: 1; }
                    h1 { margin: 0; font-size: 24px; color: #2b9938; }
                    h2 { margin: 5px 0 0 0; font-size: 16px; color: #666; font-weight: normal; }
                    .info-block { margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 14px; }
                    th { background: #2b9938; color: white; text-align: left; padding: 10px; border: 1px solid #1a6b25; }
                    .footer-sigs { display: flex; justify-content: space-around; margin-top: 80px; }
                    .sig-line { width: 250px; border-top: 1px solid #333; text-align: center; padding-top: 5px; font-size: 14px; }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="https://porto.ifap.edu.br/images/logoo.png" class="logo" alt="Logo IFAP" />
                    <div class="title-area">
                        <h1>SISTEMA DE PRESENÇA DOCENTE - IFAP</h1>
                        <h2>Relatório de Atividades da Fiscalização</h2>
                    </div>
                </div>
                
                <div class="info-block">
                    <strong>Mês/Ano de Referência:</strong> ${parts[1]}/${parts[0]}<br>
                    <strong>Fiscal de Sala Responsável:</strong> ${fiscalName}<br>
                    <strong>Data da Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
                </div>
                
                <h3>Histórico de Marcações e Justificativas</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Professor</th>
                            <th>Marcação do Fiscal</th>
                            <th>Alteração/Validação da Coordenação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportRows}
                    </tbody>
                </table>
                
                <div class="footer-sigs">
                    <div class="sig-line">
                        Assinatura do Fiscal<br><span style="font-size: 12px; color: #666;">${fiscalName}</span>
                    </div>
                    <div class="sig-line">
                        Assinatura do Coordenador Geral<br><span style="font-size: 12px; color: #666;">Visto e Validação</span>
                    </div>
                </div>
                
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

window.finalizarRonda = function() {
    const shift = appState.selectedShift;
    const slotIdx = appState.selectedTimeSlot;
    const dateStr = appState.currentDate;
    const keyFinalize = `${dateStr}_${shift}_${slotIdx}`;

    if (appState.finalizedRondas[keyFinalize]) {
        alert("Esta ronda já foi finalizada e consolidada.");
        return;
    }

    // Check if at least one room has been marked
    let hasMarks = false;
    mockSalasManha.forEach(sala => {
        const recordKey = `${sala.id}_${slotIdx}`;
        if (appState.presences[recordKey] && appState.presences[recordKey].status) {
            hasMarks = true;
        }
    });

    if (!hasMarks) {
        alert("Por favor, preencha a presença de pelo menos uma sala antes de finalizar a ronda.");
        return;
    }

    if (!confirm(`Deseja finalizar e consolidar a ronda do horário ${timeSlots[slotIdx]} (${shift})?\nApós a confirmação, os registros serão travados para auditoria.`)) {
        return;
    }

    const now = new Date();
    const finalizedTimeStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');
    const fiscalName = "Fiscal de Sala (Estevão)"; // Mock name
    
    appState.finalizedRondas[keyFinalize] = {
        finalizedAt: finalizedTimeStr,
        finalizedBy: fiscalName
    };

    let ausenciasCount = 0;
    let detailsLogs = [];
    let chefiasNotificadas = new Set();

    mockSalasManha.forEach(sala => {
        const recordKey = `${sala.id}_${slotIdx}`;
        const record = appState.presences[recordKey] || { status: 'presente' };
        const status = record.status || 'presente';
        const prof = mockProfessores.find(p => p.id === sala.professorId);
        const profNome = prof ? prof.nome : 'N/A';

        let statusTxt = 'Presente';
        if (status === 'ausente_sem') {
            statusTxt = 'Ausente (Sem substituição)';
            ausenciasCount++;
            
            if (prof) {
                const chefia = getChefiaImediata(prof);
                chefiasNotificadas.add(`${chefia.nome} (${chefia.email})`);

                if (!appState.rondaPendencias) appState.rondaPendencias = [];
                appState.rondaPendencias.push({
                    id: 'pend_' + Date.now() + '_' + Math.floor(Math.random()*1000) + '_' + sala.id,
                    data: dateStr,
                    turno: shift,
                    slotIdx: slotIdx,
                    profId: prof.id,
                    salaId: sala.id,
                    status: 'pendente'
                });

                if (!appState.rondaAbsences) appState.rondaAbsences = {};
                appState.rondaAbsences[`${prof.id}_${dateStr}`] = 'ausente_sem';
            }
        } else if (status === 'ausente_com') {
            statusTxt = 'Ausente (Com substituição)';
            if (prof) {
                if (!appState.rondaAbsences) appState.rondaAbsences = {};
                appState.rondaAbsences[`${prof.id}_${dateStr}`] = 'ausente_com';
            }
        } else if (status === 'ausente_justificado') {
            statusTxt = 'Ausente (Justificado)';
            if (prof) {
                if (!appState.rondaAbsences) appState.rondaAbsences = {};
                appState.rondaAbsences[`${prof.id}_${dateStr}`] = 'ausente_justificado';
            }
        } else {
            if (prof) {
                appState.rondaPendencias = appState.rondaPendencias.filter(p => 
                    !(p.data === dateStr && p.slotIdx === slotIdx && p.profId === prof.id)
                );
                if (appState.rondaAbsences) {
                    delete appState.rondaAbsences[`${prof.id}_${dateStr}`];
                }
            }
        }

        const logMsg = `Marcou Prof. ${profNome} como ${statusTxt} na ${sala.nome}`;
        detailsLogs.push(logMsg);
    });

    const mainDetails = `Fiscal de Sala finalizou a ronda do horário ${timeSlots[slotIdx]} (${shift}). Detalhes:\n- ` + detailsLogs.join('\n- ');
    registrarAcaoAuditoria(fiscalName, "Consolidação de Ronda", mainDetails);

    if (ausenciasCount > 0) {
        const chefiasStr = Array.from(chefiasNotificadas).join(', ');
        showToast(`Ronda consolidada. ${ausenciasCount} alerta(s) de falta enviado(s) para: ${chefiasStr}.`);
    } else {
        showToast("Ronda consolidada com sucesso! Todos os professores presentes.");
    }

    window.saveOfflineData();
    render();
}

window.updateSubstituto = function(salaId, profId) {
    const key = `${salaId}_${appState.selectedTimeSlot}`;
    if (appState.presences[key]) appState.presences[key].substitutoId = profId;
}

window.simulateTeacherEmail = function() {
    appState.toast = null;
    appState.currentProfile = 'COORD_COLEGIADO';
    appState.activeModule = 'MOD_6';
    appState.chefiadosTab = 'PENDENCIAS';
    appState.screen = 'ADMIN_PANEL';
    render();
}

window.confirmValidation = function(status) {
    if(status === 'ausente') alert("Ausência confirmada no sistema.");
    else alert("Registro de atividade externa validado.");
    appState.validationContext = null;
    appState.screen = 'ROUND_VIEW';
    render();
}

window.addEventListener('online', () => {
    showToast("Conexão restabelecida. Dados da ronda sincronizados com o servidor.");
});

window.addEventListener('offline', () => {
    showToast("Sem conexão de rede. Modo Offline ativado, as alterações serão salvas localmente.");
});

// ============================================================
// NOVOS MÓDULOS (V2) - Expansão de Perfis
// ============================================================

let cachedUsuariosPendentes = null;

async function loadUsuariosPendentes() {
    try {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('status_cadastro', 'PENDENTE')
            .order('created_at', { ascending: false });
        if (error) throw error;
        cachedUsuariosPendentes = data || [];
        render(); // Re-render to show updated list
    } catch (err) {
        console.error("Erro ao carregar usuários pendentes:", err);
        showToast("Erro ao carregar lista de aprovações.");
    }
}

window.aprovarUsuario = async function(id) {
    if(!confirm("Tem certeza que deseja APROVAR este cadastro?")) return;
    try {
        await DB.usuarios.update(id, {
            status_cadastro: 'ATIVO',
            aprovado_por: appState.userId,
            aprovado_em: new Date().toISOString()
        });
        
        // Registrar Auditoria
        const usr = cachedUsuariosPendentes.find(u => u.id === id);
        registrarAcaoAuditoria(appState.userName, "Aprovação de Cadastro", `Diretor aprovou o cadastro de ${usr ? usr.nome : 'ID '+id} (SIAPE: ${usr ? usr.siape : ''})`);
        
        showToast("Usuário aprovado com sucesso!");
        cachedUsuariosPendentes = null;
        loadUsuariosPendentes();
    } catch (err) {
        console.error(err);
        alert("Erro ao aprovar: " + err.message);
    }
}

window.rejeitarUsuario = async function(id) {
    const motivo = prompt("Motivo da rejeição (será enviado ao usuário):");
    if(motivo === null) return;
    if(motivo.trim() === '') {
        alert("O motivo é obrigatório.");
        return;
    }
    
    try {
        await DB.usuarios.update(id, {
            status_cadastro: 'REJEITADO',
            motivo_rejeicao: motivo,
            aprovado_por: appState.userId,
            aprovado_em: new Date().toISOString()
        });
        
        const usr = cachedUsuariosPendentes.find(u => u.id === id);
        registrarAcaoAuditoria(appState.userName, "Rejeição de Cadastro", `Diretor rejeitou o cadastro de ${usr ? usr.nome : 'ID '+id}. Motivo: ${motivo}`);
        
        showToast("Usuário rejeitado com sucesso!");
        cachedUsuariosPendentes = null;
        loadUsuariosPendentes();
    } catch (err) {
        console.error(err);
        alert("Erro ao rejeitar: " + err.message);
    }
}

function renderModAprovacoes() {
    // Se ainda não carregou, carrega de forma assíncrona
    if (cachedUsuariosPendentes === null) {
        loadUsuariosPendentes();
        return `
            <main>
                <h2>Aprovação de Novos Cadastros</h2>
                <div style="padding: 2rem; text-align: center; color: var(--text-muted);">⏳ Carregando solicitações pendentes...</div>
            </main>
        `;
    }

    const rows = cachedUsuariosPendentes.map(u => {
        const dateStr = new Date(u.created_at).toLocaleDateString('pt-BR');
        return `
            <tr>
                <td style="font-weight: 500;">${u.nome}</td>
                <td>${u.email}</td>
                <td><span style="font-family: monospace; background: #F1F5F9; padding: 0.2rem 0.5rem; border-radius: 4px;">${u.siape || 'N/A'}</span></td>
                <td><span class="badge-blue" style="background: #E0E7FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">${u.perfil}</span></td>
                <td>${dateStr}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="aprovarUsuario(${u.id})" style="background: #10B981; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; font-weight: 600; cursor: pointer;">✅ Aprovar</button>
                        <button onclick="rejeitarUsuario(${u.id})" style="background: #EF4444; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; font-weight: 600; cursor: pointer;">❌ Rejeitar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                <h3 style="margin: 0;">✅ Aprovação de Cadastros (Servidores e Professores)</h3>
                <button class="nav-btn outline-btn" onclick="cachedUsuariosPendentes = null; loadUsuariosPendentes();" style="display: flex; align-items: center; gap: 0.4rem;">
                    🔄 Atualizar Lista
                </button>
            </div>
            
            <p style="color: var(--text-muted); margin-bottom: 1.5rem; margin-top: 0.5rem;">
                Novos servidores que realizam o auto-cadastro no sistema aguardam a validação da Direção Geral. Verifique o número do SIAPE antes de aprovar.
            </p>

            <div class="table-responsive">
                <table class="perms-table">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Nome do Servidor</th>
                            <th style="text-align: left;">E-mail Institucional</th>
                            <th style="text-align: left;">SIAPE</th>
                            <th style="text-align: left;">Perfil Solicitado</th>
                            <th style="text-align: left;">Data de Solicitação</th>
                            <th style="text-align: left;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma solicitação pendente no momento. 🎉</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

let cachedSolicitacoes = null;
let cachedServidoresSubstitutos = null;

async function loadSolicitacoesServidor() {
    if (!appState.userId) return;
    try {
        const data = await DB.solicitacoesSubstituicao.fetchBySolicitante(appState.userId);
        cachedSolicitacoes = data || [];
        render();
    } catch (e) {
        console.error("Erro ao carregar solicitações:", e);
    }
}

async function loadServidoresSubstitutos() {
    try {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('id, nome, siape, perfil')
            .not('siape', 'is', null)
            .neq('id', appState.userId)
            .order('nome', { ascending: true });
        if (error) throw error;
        cachedServidoresSubstitutos = data || [];
        render();
    } catch (e) {
        console.error("Erro ao carregar substitutos:", e);
    }
}

window.openNovaSolicitacaoModal = function() {
    appState.modalNovaSolicitacao = true;
    appState.novaSolicitacaoData = {
        dataFalta: '',
        horarios: [],
        tipo: 'COBERTURA',
        substitutoId: '',
        documentoNome: ''
    };
    if (cachedServidoresSubstitutos === null) loadServidoresSubstitutos();
    render();
}

window.closeNovaSolicitacaoModal = function() {
    appState.modalNovaSolicitacao = false;
    render();
}

window.toggleHorarioSolicitacao = function(horario) {
    const list = appState.novaSolicitacaoData.horarios;
    if (list.includes(horario)) {
        appState.novaSolicitacaoData.horarios = list.filter(h => h !== horario);
    } else {
        appState.novaSolicitacaoData.horarios.push(horario);
    }
    render();
}

window.handleUploadSUAP = function(event) {
    const file = event.target.files[0];
    if (file) {
        appState.novaSolicitacaoData.documentoNome = file.name;
        showToast("Documento SUAP anexado temporariamente.");
        render();
    }
}

window.submitNovaSolicitacao = async function() {
    const form = appState.novaSolicitacaoData;
    if (!form.dataFalta || !form.substitutoId || form.horarios.length === 0) {
        alert("Preencha todos os campos obrigatórios (Data, Substituto e Horários).");
        return;
    }
    
    try {
        await DB.solicitacoesSubstituicao.create({
            solicitante_id: appState.userId,
            substituto_id: parseInt(form.substitutoId),
            data_falta: form.dataFalta,
            horarios_json: form.horarios,
            tipo: form.tipo,
            status: 'AGUARDANDO_CONFIRMACAO',
            documento_nome: form.documentoNome || null
        });
        
        showToast("Solicitação enviada com sucesso!");
        closeNovaSolicitacaoModal();
        cachedSolicitacoes = null;
        loadSolicitacoesServidor();
    } catch(err) {
        console.error(err);
        alert("Erro ao enviar: " + err.message);
    }
}

function renderModalNovaSolicitacao() {
    if (!appState.modalNovaSolicitacao) return '';
    
    const subsOptions = (cachedServidoresSubstitutos || []).map(s => 
        `<option value="${s.id}">${s.nome} (SIAPE: ${s.siape})</option>`
    ).join('');
    
    const dataFalta = appState.novaSolicitacaoData.dataFalta;
    const isCobertura = appState.novaSolicitacaoData.tipo === 'COBERTURA';
    
    return `
        <div class="modal-overlay animate-fade-in" onclick="closeNovaSolicitacaoModal()">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 650px;">
                <div class="modal-header">
                    <h3>🤝 Solicitar Substituição ou Troca</h3>
                    <button class="close-btn" onclick="closeNovaSolicitacaoModal()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Preencha os dados abaixo para formalizar a sua substituição. O substituto receberá uma notificação para confirmar o aceite.</p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div>
                            <label style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Data da Ausência *</label>
                            <input type="date" style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);" 
                                value="${dataFalta}" onchange="appState.novaSolicitacaoData.dataFalta = this.value; render();">
                        </div>
                        <div>
                            <label style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Tipo de Operação *</label>
                            <select style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white;"
                                onchange="appState.novaSolicitacaoData.tipo = this.value; render();">
                                <option value="COBERTURA" ${isCobertura ? 'selected' : ''}>Apenas Cobertura (Sem devolução)</option>
                                <option value="TROCA" ${!isCobertura ? 'selected' : ''}>Troca (Recíproca com outro dia)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <label style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Selecionar Substituto (Lista Geral) *</label>
                        <select style="width: 100%; padding: 0.8rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white;"
                            onchange="appState.novaSolicitacaoData.substitutoId = this.value;">
                            <option value="">-- Buscar Servidor --</option>
                            ${subsOptions}
                        </select>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem;">Dica: Você pode consultar a <strong style="cursor: pointer; color: var(--if-green);">Lista A (Horário Livre)</strong> ou <strong style="cursor: pointer; color: var(--if-green);">Lista B (Geral)</strong> na aba de Grade.</p>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Horários a Substituir *</label>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            ${[1,2,3,4,5,6].map(i => {
                                const checked = appState.novaSolicitacaoData.horarios.includes(i);
                                return `
                                    <label style="display: flex; align-items: center; gap: 0.3rem; background: ${checked ? '#ECFDF5' : '#F8FAFC'}; border: 1px solid ${checked ? '#10B981' : 'var(--border-color)'}; padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); cursor: pointer;">
                                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleHorarioSolicitacao(${i})"> ${i}º Horário
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 2rem;">
                        <label style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; display: block;">Anexar Documento SUAP (PDF)</label>
                        <div style="border: 2px dashed var(--border-color); padding: 1.5rem; text-align: center; border-radius: var(--radius-md); background: #F8FAFC; position: relative;">
                            ${appState.novaSolicitacaoData.documentoNome 
                                ? `<span style="color: var(--if-green); font-weight: 600;">✅ ${appState.novaSolicitacaoData.documentoNome}</span>` 
                                : `<span style="color: var(--text-muted);">Clique para selecionar o PDF gerado no SUAP</span>`}
                            <input type="file" accept=".pdf" onchange="handleUploadSUAP(event)" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                        </div>
                    </div>
                    
                    <button class="nav-btn" style="width: 100%; padding: 1rem; font-size: 1.1rem;" onclick="submitNovaSolicitacao()">🚀 Enviar Solicitação</button>
                </div>
            </div>
        </div>
    `;
}

function renderModServidor() {
    if (cachedSolicitacoes === null) {
        loadSolicitacoesServidor();
    }
    
    let historicoHtml = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma solicitação no histórico.</td></tr>';
    
    if (cachedSolicitacoes && cachedSolicitacoes.length > 0) {
        historicoHtml = cachedSolicitacoes.map(s => {
            const dataFalta = new Date(s.data_falta).toLocaleDateString('pt-BR');
            const subNome = s.substituto ? s.substituto.nome : 'Desconhecido';
            
            let statusBadge = '';
            if (s.status === 'AGUARDANDO_CONFIRMACAO') statusBadge = '<span class="badge-orange" style="background: #FFFBEB; color: #D97706; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600;">Aguardando Aceite</span>';
            else if (s.status === 'FORMALIZADA') statusBadge = '<span class="badge-green" style="background: #ECFDF5; color: #059669; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600;">Formalizada</span>';
            else if (s.status === 'CANCELADA') statusBadge = '<span class="badge-red" style="background: #FEF2F2; color: #DC2626; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600;">Cancelada</span>';
            else statusBadge = `<span style="background: #F1F5F9; color: #475569; padding: 0.2rem 0.6rem; border-radius: 4px;">${s.status}</span>`;

            return `
                <tr>
                    <td style="font-weight: 500;">${dataFalta}</td>
                    <td>${subNome}</td>
                    <td><span style="background: #F1F5F9; padding: 0.2rem 0.5rem; border-radius: 4px;">${s.tipo}</span></td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="outline-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Ver Detalhes</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    return `
        <main style="padding: 1.5rem; max-width: 1200px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; border-bottom: 2px solid var(--border-color); padding-bottom: 1rem;">
                <div>
                    <h2 style="font-size: 1.8rem; margin: 0; color: var(--if-green);">Olá, ${appState.userName}</h2>
                    <p style="color: var(--text-muted); margin-top: 0.3rem;">Painel do Servidor Institucional</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 600; color: var(--text-main);">${appState.userEmail}</div>
                    <div style="color: var(--text-muted); font-size: 0.9rem;">SIAPE: ${appState.userId}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
                
                <!-- Coluna Esquerda: Ações e Histórico -->
                <div>
                    <div style="background: white; border-radius: var(--radius-lg); padding: 1.5rem; box-shadow: var(--shadow-sm); margin-bottom: 2rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <h3 style="margin: 0;">Minhas Solicitações de Substituição</h3>
                            <button class="nav-btn" onclick="openNovaSolicitacaoModal()">+ Nova Solicitação</button>
                        </div>
                        <div class="table-responsive">
                            <table class="perms-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left;">Data</th>
                                        <th style="text-align: left;">Substituto Convidado</th>
                                        <th style="text-align: left;">Tipo</th>
                                        <th style="text-align: left;">Status</th>
                                        <th style="text-align: left;">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${historicoHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Coluna Direita: Grade e Info -->
                <div>
                    <div style="background: white; border-radius: var(--radius-lg); padding: 1.5rem; box-shadow: var(--shadow-sm); margin-bottom: 1.5rem; border-top: 4px solid var(--if-green);">
                        <h3 style="margin-top: 0; margin-bottom: 1rem;">📅 Grade Semanal Rápida</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">Visualize seus horários fixos. Para buscar substitutos da Lista A (Livres no horário), clique na lupa.</p>
                        
                        <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                            <div style="display: flex; justify-content: space-between; padding: 0.8rem; background: #F8FAFC; border-radius: var(--radius-sm); border-left: 3px solid var(--if-green);">
                                <strong>Segunda-feira</strong>
                                <span style="color: var(--text-muted);">2 Aulas</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.8rem; background: #F8FAFC; border-radius: var(--radius-sm); border-left: 3px solid var(--if-green);">
                                <strong>Quarta-feira</strong>
                                <span style="color: var(--text-muted);">2 Aulas</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.8rem; background: #F8FAFC; border-radius: var(--radius-sm); border-left: 3px solid var(--if-green);">
                                <strong>Sexta-feira</strong>
                                <span style="color: var(--text-muted);">3 Aulas</span>
                            </div>
                        </div>
                        <button class="outline-btn" style="width: 100%; margin-top: 1rem;" onclick="appState.activeModule='MOD_4'; render();">Ver Grade Completa</button>
                    </div>

                    <div style="background: white; border-radius: var(--radius-lg); padding: 1.5rem; box-shadow: var(--shadow-sm);">
                        <h3 style="margin-top: 0; margin-bottom: 1rem;">📱 Contato Rápido</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Mantenha seu WhatsApp atualizado para receber notificações ágeis sobre substituições de turmas.</p>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" placeholder="(96) 90000-0000" style="flex: 1; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                            <button class="outline-btn" style="background: #F1F5F9; border-color: #CBD5E1;">Salvar</button>
                        </div>
                    </div>
                </div>

            </div>
            ${renderModalNovaSolicitacao()}
        </main>
    `;
}

let cachedCopedUsers = null;

async function loadCopedUsers() {
    try {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .in('perfil', ['FISCAL', 'ESTAGIARIO'])
            .order('nome', { ascending: true });
        if (error) throw error;
        cachedCopedUsers = data || [];
        render();
    } catch (e) {
        console.error("Erro ao carregar fiscais:", e);
    }
}

window.openNovoFiscalModal = function() {
    appState.modalNovoFiscal = true;
    appState.novoFiscalData = { nome: '', email: '', perfil: 'FISCAL' };
    render();
}

window.closeNovoFiscalModal = function() {
    appState.modalNovoFiscal = false;
    render();
}

window.submitNovoFiscal = async function() {
    const f = appState.novoFiscalData;
    if (!f.nome || !f.email) return alert('Preencha nome e e-mail');
    try {
        await DB.usuarios.create({
            nome: f.nome,
            email: f.email,
            perfil: f.perfil,
            tipo_conta: 'PESSOAL',
            status_cadastro: 'ATIVO',
            cadastrado_por: appState.userId
        });
        showToast('Cadastro realizado com sucesso! O usuário já pode acessar.');
        closeNovoFiscalModal();
        cachedCopedUsers = null;
        loadCopedUsers();
    } catch (e) {
        console.error(e);
        alert('Erro ao criar: ' + e.message);
    }
}

function renderModCoped() {
    if (cachedCopedUsers === null) loadCopedUsers();
    
    let rows = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">Nenhum fiscal cadastrado.</td></tr>';
    if (cachedCopedUsers && cachedCopedUsers.length > 0) {
        rows = cachedCopedUsers.map(u => `
            <tr>
                <td style="font-weight: 500;">${u.nome}</td>
                <td>${u.email}</td>
                <td><span class="badge-blue" style="background: #E0E7FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600;">${u.perfil}</span></td>
                <td>${u.status_cadastro === 'ATIVO' ? '✅ Ativo' : '❌ Inativo'}</td>
                <td><button class="outline-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Editar</button></td>
            </tr>
        `).join('');
    }

    const modalHTML = appState.modalNovoFiscal ? `
        <div class="modal-overlay animate-fade-in" onclick="closeNovoFiscalModal()">
            <div class="modal-content animate-slide-up" onclick="event.stopPropagation()" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>➕ Novo Assistente/Estagiário</h3>
                    <button class="close-btn" onclick="closeNovoFiscalModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 1rem;">
                        <label>Nome Completo</label>
                        <input type="text" style="width:100%; padding: 0.6rem;" onchange="appState.novoFiscalData.nome = this.value">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label>E-mail (Login)</label>
                        <input type="email" style="width:100%; padding: 0.6rem;" onchange="appState.novoFiscalData.email = this.value">
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label>Função</label>
                        <select style="width:100%; padding: 0.6rem;" onchange="appState.novoFiscalData.perfil = this.value">
                            <option value="FISCAL">Assistente de Aluno (Fiscal)</option>
                            <option value="ESTAGIARIO">Estagiário de Apoio</option>
                        </select>
                    </div>
                    <button class="nav-btn" style="width:100%; padding: 0.8rem;" onclick="submitNovoFiscal()">Salvar</button>
                </div>
            </div>
        </div>
    ` : '';

    return `
        <main style="padding: 1.5rem; max-width: 1000px; margin: 0 auto;">
            <div class="coord-panel animate-fade" style="padding: 1.5rem;">
                <div class="diario-header" style="display: flex; align-items: center; justify-content: space-between;">
                    <h2>👥 Gestão de Fiscais e Estagiários (COPED)</h2>
                    <button class="nav-btn" onclick="openNovoFiscalModal()">+ Novo Cadastro</button>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Controle os acessos da equipe de apoio operacional que realiza as rondas de fiscalização.</p>
                <table class="perms-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Nome</th>
                            <th style="text-align:left;">E-mail</th>
                            <th style="text-align:left;">Função</th>
                            <th style="text-align:left;">Status</th>
                            <th style="text-align:left;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${modalHTML}
        </main>
    `;
}

function renderModSuper() {
    return `
        <main style="padding: 1.5rem; max-width: 1000px; margin: 0 auto;">
            <div class="coord-panel animate-fade" style="padding: 1.5rem;">
                <h2 style="color: var(--if-green); margin-bottom: 0.5rem;">⚙️ Painel de Suporte (Super Admin)</h2>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Acesso irrestrito aos logs de auditoria e configurações globais do banco de dados (Supabase).</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
                    <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
                        <h3 style="margin-top: 0;">Logs de Auditoria</h3>
                        <p style="font-size: 0.9rem; color: var(--text-muted);">Todas as ações críticas como finalização de ronda, validação e delegações são rastreadas.</p>
                        <button class="outline-btn" style="width: 100%; margin-top: 1rem;">Exportar Logs (CSV)</button>
                    </div>
                    <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
                        <h3 style="margin-top: 0;">Resets de Senha</h3>
                        <p style="font-size: 0.9rem; color: var(--text-muted);">Usuários com problemas de acesso à conta Funcional ou Pessoal.</p>
                        <button class="outline-btn" style="width: 100%; margin-top: 1rem;">Gerenciar Solicitações</button>
                    </div>
                </div>

                <h3>Tickets de Feedback do Sistema</h3>
                <table class="perms-table" style="margin-top: 1rem;">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Data</th>
                            <th style="text-align:left;">Usuário</th>
                            <th style="text-align:left;">Tipo</th>
                            <th style="text-align:left;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 2rem;">Nenhum feedback recebido ainda.</td></tr>
                    </tbody>
                </table>
            </div>
        </main>
    `;
}

// ============================================================
// INICIALIZAÇÃO: Verificar sessão existente ou exibir login
// ============================================================

async function initApp() {
    const appDiv = document.getElementById('app');
    
    // Verificar se há sessão ativa no Supabase
    try {
        const session = await Auth.getCurrentSession();
        if (session && session.user) {
            // Sessão ativa — carregar perfil e dados
            const userProfile = await Auth.getUserProfileByEmail(session.user.email);
            if (userProfile) {
                await loadAllDataFromDB();
                appState.userName = userProfile.nome;
                appState.userEmail = userProfile.email;
                appState.userId = userProfile.id;
                
                if (userProfile.perfil === 'COORD_COLEGIADO') {
                    const col = mockColegiados.find(c => c.email === userProfile.email || c.coordenadorId === userProfile.servidor_id);
                    if (col) appState.userVinculoId = col.id;
                } else if (userProfile.perfil === 'COPED' || userProfile.perfil === 'COGEN' || userProfile.perfil === 'DEN' || userProfile.perfil === 'DIR_GERAL' || userProfile.perfil === 'DIR_ENSINO') {
                    const inst = mockInstancias.find(i => i.email === userProfile.email || i.responsavelId === userProfile.servidor_id);
                    if (inst) appState.userVinculoId = inst.id;
                }
                
                if (window.location.hash && window.location.hash.includes('type=magiclink')) {
                    appState.mustSetPassword = true;
                }

                window.selectProfile(userProfile.perfil);
                return;
            }
        }
    } catch (e) {
        console.log('[IFAP] Nenhuma sessão ativa, exibindo login.');
    }

    // Sem sessão — exibir tela de login
    window.loadOfflineData();
    render();
}

initApp();

window.filterServidoresTable = function(term) {
    term = term.toLowerCase();
    const rows = document.querySelectorAll('#servidores-table tbody tr.servidor-row');
    rows.forEach(row => {
        const nome = row.getAttribute('data-nome').toLowerCase();
        const siape = row.getAttribute('data-siape').toLowerCase();
        if (nome.includes(term) || siape.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

