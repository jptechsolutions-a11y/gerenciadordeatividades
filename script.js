// ========================================
// 1. CONFIGURAÇÃO SUPABASE E VARIÁVEIS GGLOBAIS
// ========================================

// -----------------------------------------------------------------
// CONFIGURAÇÃO DE AUTENTICAÇÃO (CHAVES PÚBLICAS)
// Estas chaves SÃO PÚBLICAS e seguras para ficarem aqui.
// -----------------------------------------------------------------
const SUPABASE_URL = 'https://mxtlanpjzenfghsjubzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dGxhbnBqemVuZmdoc2p1YnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NTk0MzksImV4cCI6MjA3NzIzNTQzOX0.RFfy6orSso72v-0GtkSqwt4WJ3XWlLmZkyHoE71Dtdc';
// -----------------------------------------------------------------

// Suas variáveis globais
let currentUser = null;
let currentOrg = null; 
let currentProject = null; 
let currentColumns = []; 
let chartInstances = {}; 
let currentNoteId = null; 

// ========================================
// 2. INICIALIZAÇÃO E AUTENTICAÇÃO (BLOCO CORRIGIDO)
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Adiciona os listeners dos formulários DO APP
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('inviteForm')?.addEventListener('submit', handleInviteFormSubmit);
    document.getElementById('perfilForm')?.addEventListener('submit', handlePerfilFormSubmit);
    document.getElementById('createTeamForm')?.addEventListener('submit', handleCreateTeamFormSubmit);
    
    // Pega a função 'createClient' da biblioteca Supabase (que o app.html carregou)
    const { createClient } = supabase;
    
    // Inicializa o cliente Supabase AQUI DENTRO
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Gerenciador de Sessão
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log("Auth Event:", event);
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session) {
                initializeApp(session);
            }
        } else if (event === 'SIGNED_OUT') {
            window.location.href = 'login.html';
        }
    });

    // Verifica a sessão inicial
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            console.log("Sessão encontrada. Inicializando app.");
            initializeApp(session);
        } else {
            console.log("Nenhuma sessão encontrada. Redirecionando para login.");
            window.location.href = 'login.html';
        }
    }).catch(error => {
        console.error("Erro ao pegar sessão:", error);
        window.location.href = 'login.html';
    });

    // Adiciona a função logout ao window para ser acessível pelo onclick=""
    window.logout = async () => {
        console.log("Deslogando usuário...");
        currentUser = null;
        currentOrg = null;
        currentProject = null;
        currentColumns = [];
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token'); // Limpa o token da sua API proxy
        
        const { error } = await supabaseClient.auth.signOut();
        if (error) console.error("Erro ao deslogar:", error);
        
        // window.location.href é acionado pelo 'onAuthStateChange'
    };
});

// Inicializa o App com a sessão
async function initializeApp(session) {
    
    // ESTA É A "PONTE" DE SEGURANÇA
    // Salvamos o Access Token para sua API proxy usar
    localStorage.setItem('auth_token', session.access_token);
    
    const authUser = session.user;

    try {
        // Busca o perfil do usuário
        const endpoint = `usuarios?email=eq.${authUser.email}&select=*,usuario_orgs(org_id,organizacoes(id,nome))`;
        let profileResponse = await supabaseRequest(endpoint, 'GET');

        // Se não tem perfil, cria um
        if (!profileResponse || !profileResponse[0]) {
             console.warn("Perfil não encontrado. Tentando criar...");
             const newProfile = {
                 auth_user_id: authUser.id,
                 email: authUser.email,
                 nome: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
                 profile_picture_url: authUser.user_metadata?.avatar_url || null
             };
             const createResponse = await supabaseRequest('usuarios', 'POST', newProfile);
             if (!createResponse || !createResponse[0]) {
                 throw new Error("Falha ao criar o perfil de usuário no banco de dados.");
             }
             currentUser = createResponse[0];
             currentUser.organizacoes = [];
             console.log("Novo perfil criado com sucesso!", currentUser);
        } else {
             currentUser = profileResponse[0];
             console.log("Perfil encontrado!");
        }

        // Mapeia as organizações
        const userOrgs = (currentUser.usuario_orgs || []).map(uo => uo.organizacoes).filter(Boolean);
        currentUser.organizacoes = userOrgs;
        delete currentUser.usuario_orgs;

        // Bloco de correção (se o auth_user_id estiver faltando)
        if (!currentUser.auth_user_id && authUser.id) {
            console.log(`Corrigindo auth_user_id (NULL) para o usuário: ${currentUser.id}`);
            await supabaseRequest(`usuarios?id=eq.${currentUser.id}`, 'PATCH', {
                auth_user_id: authUser.id
            });
            currentUser.auth_user_id = authUser.id;
        }

        localStorage.setItem('user', JSON.stringify(currentUser));
        
        // Decide se mostra o App ou o Onboarding de Time
        redirectToDashboard();

    } catch (error) {
        console.error("Erro detalhado na inicialização:", error);
        logout();
    }
}

// ========================================
// 3. LÓGICA DE ONBOARDING E NAVEGAÇÃO
// ========================================

function redirectToDashboard() {
    if (!currentUser || !currentUser.organizacoes) {
        console.error("Erro fatal: Dados do usuário incompletos.");
        logout(); // 'logout' está definido no DOMContentLoaded
        return;
    }

    const orgs = currentUser.organizacoes;

    if (orgs.length === 0) {
        // NENHUM TIME: Força a criação do primeiro time
        console.log("Nenhuma organização encontrada. Iniciando fluxo de criação de time.");
        openCreateTeamModal();
    } else if (orgs.length === 1) {
        // UM TIME: Entra direto
        currentOrg = orgs[0];
        showMainSystem();
    } else {
        // MÚLTIPLOS TIMES: Pega o primeiro.
        // TODO: Criar um modal "Seletor de Time" aqui
        console.warn("Múltiplos times detectados. Selecionando o primeiro por padrão.");
        currentOrg = orgs[0];
        showMainSystem();
    }
}

// Mostra o modal de criação de time
function openCreateTeamModal() {
    // ADICIONADO: Mostra o container principal (o sidebar e a área de conteúdo)
    document.getElementById('mainSystem').style.display = 'flex';
    // ADICIONADO: Muda o fundo para a cor do sistema (cinza claro)
    document.body.classList.add('system-active');

    // Código original:
    document.getElementById('createTeamCard').style.display = 'flex';
    feather.replace();
}
// Handler para o formulário de criação de time
async function handleCreateTeamFormSubmit(event) {
    event.preventDefault();
    const alert = document.getElementById('createTeamAlert');
    const button = event.target.querySelector('button[type="submit"]');
    alert.innerHTML = '';
    button.disabled = true;
    button.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Criando...';

    const teamName = document.getElementById('teamName').value;
    const invites = document.getElementById('teamInvites').value
                      .split(',')
                      .map(s => s.trim())
                      .filter(s => s.includes('@')); 

    try {
        // 1: Criar a Organização
        const newOrgData = {
            nome: teamName,
            created_by: currentUser.id 
        };
        const newOrgResponse = await supabaseRequest('organizacoes', 'POST', newOrgData);
        if (!newOrgResponse || !newOrgResponse[0]) {
            throw new Error("Falha ao criar organização.");
        }
        const newOrg = newOrgResponse[0];

        // 2: Vincular o usuário atual (admin) à organização
        const linkData = {
            usuario_id: currentUser.id,
            org_id: newOrg.id,
            role: 'admin'
        };
        await supabaseRequest('usuario_orgs', 'POST', linkData);

        // 3: Enviar convites (se houver)
        if (invites.length > 0) {
            for (const email of invites) {
                try {
                    await fetch('/api/invite', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                        },
                        body: JSON.stringify({
                            email: email,
                            role: 'membro',
                            org_id: newOrg.id,
                            org_name: newOrg.nome
                        })
                    });
                } catch (inviteError) {
                    console.warn(`Falha ao enviar convite para ${email}:`, inviteError);
                }
            }
        }

        // 4: Atualizar o estado local e prosseguir
        currentOrg = newOrg;
        currentUser.organizacoes.push(newOrg); 
        localStorage.setItem('user', JSON.stringify(currentUser)); 
        
        document.getElementById('createTeamCard').style.display = 'none'; 
        showMainSystem(); // Entra no sistema!

    } catch (error) {
        console.error("Erro ao criar time:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
        button.disabled = false;
        button.innerHTML = '<i data-feather="arrow-right" class="h-4 w-4 mr-2"></i> Criar e Continuar';
        feather.replace();
    }
}

// Mostra o sistema principal (App)
function showMainSystem() {
    document.getElementById('mainSystem').style.display = 'flex';
    document.body.classList.add('system-active'); // Muda o fundo para cinza claro

    document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário';
    document.getElementById('sidebarOrg').textContent = currentOrg.nome || 'N/A';


   // Vamos transformar o final desta função em async para esperar o projeto
   (async () => {
        try {
            await loadActiveProject();
            showView('dashboardView', document.querySelector('a[href="#dashboard"]')); 
            feather.replace();
        } catch (err) {
            console.error("Erro ao carregar projeto ativo:", err);
            showNotification(`Erro ao carregar dados iniciais: ${err.message}.`, "error", 6000);
            showView('dashboardView', document.querySelector('a[href="#dashboard"]'));
            feather.replace();
        }
    })();
}
// ========================================
// 4. NAVEGAÇÃO E UI (Restante do seu código)
// ========================================

function showView(viewId, element = null) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    const viewEl = document.getElementById(viewId);
    if(viewEl) viewEl.classList.add('active');

    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
    element?.classList.add('active');

    try {
        switch (viewId) {
            case 'dashboardView': loadDashboardView(); break;
            case 'projetosView': loadKanbanView(); break;
            case 'timelineView': loadTimelineView(); break;
            case 'calendarioView': loadCalendarView(); break;
            case 'notasView': loadNotasView(); break;
            case 'timeView': loadTimeView(); break;
            case 'perfilView': loadPerfilView(); break;
        }
    } catch(e) { console.error(`Erro ao carregar view ${viewId}:`, e); }
    feather.replace();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function showNotification(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'x-circle' : 'info');
    notification.innerHTML = `
        <div class="notification-header">
            <i data-feather="${icon}" class="h-5 w-5 mr-2"></i>
            <span>${type === 'success' ? 'Sucesso!' : (type === 'error' ? 'Erro!' : 'Aviso')}</span>
        </div>
        <div class="notification-body">${escapeHTML(message)}</div>`;
    container.appendChild(notification);
    feather.replace();
    setTimeout(() => {
        notification.classList.add('hide');
        notification.addEventListener('animationend', () => notification.remove());
    }, timeout);
}

// ========================================
// 5. Carregar Projeto Ativo e Colunas
// ========================================
async function loadActiveProject() {
    console.log("Carregando projeto ativo...");
    currentProject = null;
    currentColumns = [];
    const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : `org_id=is.null&created_by=eq.${currentUser.id}`;

    try {
        const projetos = await supabaseRequest(`projetos?${orgFilter}&select=id,nome&limit=1&order=created_at.asc`, 'GET');

        if (!projetos || projetos.length === 0) {
            console.warn("Nenhum projeto encontrado. Criando 'Meu Primeiro Quadro'...");
            const newProject = {
                 nome: 'Meu Primeiro Quadro',
                 created_by: currentUser.id,
                 org_id: currentOrg?.id || null
            };
            const createResponse = await supabaseRequest('projetos', 'POST', newProject);
            if (!createResponse || !createResponse[0]) throw new Error("Falha ao criar projeto padrão.");
            currentProject = createResponse[0];
        } else {
            currentProject = projetos[0];
        }
        console.log("Projeto ativo:", currentProject);

        currentColumns = await supabaseRequest(`colunas_kanban?projeto_id=eq.${currentProject.id}&select=id,nome,ordem&order=ordem.asc`, 'GET');

        if (!currentColumns || currentColumns.length === 0) {
            console.warn("Nenhuma coluna encontrada. Criando padrão.");
            await createDefaultColumns(currentProject.id);
            currentColumns = await supabaseRequest(`colunas_kanban?projeto_id=eq.${currentProject.id}&select=id,nome,ordem&order=ordem.asc`, 'GET');
             if (!currentColumns || currentColumns.length === 0){
                  throw new Error("Falha ao criar ou buscar colunas padrão.");
             }
        }
        console.log("Colunas carregadas:", currentColumns.map(c => `${c.nome} (${c.id})`));

    } catch (error) {
        console.error("Erro fatal ao carregar projeto/colunas:", error);
        throw error;
    }
}

async function createDefaultColumns(projectId) {
     const defaultCols = [
          { projeto_id: projectId, nome: 'A Fazer', ordem: 0 },
          { projeto_id: projectId, nome: 'Em Andamento', ordem: 1 },
          { projeto_id: projectId, nome: 'Concluído', ordem: 2 }
     ];
     try {
          await supabaseRequest('colunas_kanban', 'POST', defaultCols);
     } catch (error) {
          console.error("Erro ao criar colunas padrão:", error);
     }
}

// ========================================
// 6. LÓGICA DO DASHBOARD (CORRIGIDA)
// ========================================
async function loadDashboardView() {
    const view = document.getElementById('dashboardView');

    // --- REVERTENDO A CORREÇÃO ANTERIOR ---
    // Removendo os blocos .destroy() daqui
    /*
    if (chartInstances.statusChart && typeof chartInstances.statusChart.destroy === 'function') {
        chartInstances.statusChart.destroy();
        chartInstances.statusChart = null;
    }
    if (chartInstances.ganttChart && typeof chartInstances.ganttChart.destroy === 'function') {
        chartInstances.ganttChart.destroy();
        chartInstances.ganttChart = null;
    }
    */
    // --- FIM DA REVERSÃO ---

    view.innerHTML = `<h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard de Produtividade</h1>
                      <div class="loading"><div class="spinner"></div> Carregando estatísticas...</div>`;

    if (!currentProject || currentColumns.length === 0) {
         view.innerHTML = '<h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1><div class="alert alert-error">Não foi possível carregar o dashboard. Projeto ou colunas não encontrados.</div>';
         return;
    }

    view.innerHTML = `
        <h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard de Produtividade</h1>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div class="stat-card-dash"><span class="stat-number" id="dashTotalTasks">...</span><span class="stat-label">Tarefas Ativas</span></div>
            <div class="stat-card-dash"><span class="stat-number" id="dashCompletedTasks">...</span><span class="stat-label">Tarefas Concluídas (Mês)</span></div>
            <div class="stat-card-dash"><span class="stat-number" id="dashDueTasks">...</span><span class="stat-label">Tarefas Vencendo Hoje</span></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-lg shadow-md chart-card">
                <h3 class="text-xl font-semibold mb-4">Progresso do Projeto (Gantt)</h3>
                <div class="relative h-96"><canvas id="ganttChart"></canvas></div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-md chart-card">
                <h3 class="text-xl font-semibold mb-4">Tarefas por Status</h3>
                <div class="relative h-96"><canvas id="statusChart"></canvas></div>
            </div>
        </div>
     `;

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const doneColumn = currentColumns.find(col => col.nome.toLowerCase() === 'concluído');
        const doneColumnId = doneColumn ? doneColumn.id : null;
        const activeColumnIds = currentColumns.filter(col => col.id !== doneColumnId).map(col => col.id);

        let totalTasks = 0;
        if (activeColumnIds.length > 0) {
            const { count } = await supabaseRequest(`tarefas?${projectFilter}&coluna_id=in.(${activeColumnIds.join(',')})&select=id`, 'GET', null, { 'Prefer': 'count=exact' });
            totalTasks = count;
        }

        let completedTasks = 0;
        if (doneColumnId) {
            const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { count } = await supabaseRequest(`tarefas?${projectFilter}&coluna_id=eq.${doneColumnId}&updated_at=gte.${firstDayOfMonth}&select=id`, 'GET', null, { 'Prefer': 'count=exact' });
            completedTasks = count;
        }

        const today = new Date().toISOString().split('T')[0];
        let dueTasks = 0;
         if (activeColumnIds.length > 0) {
            const { count } = await supabaseRequest(`tarefas?${projectFilter}&data_entrega=eq.${today}&coluna_id=in.(${activeColumnIds.join(',')})&select=id`, 'GET', null, { 'Prefer': 'count=exact' });
            dueTasks = count;
         }

        document.getElementById('dashTotalTasks').textContent = totalTasks || 0;
        document.getElementById('dashCompletedTasks').textContent = completedTasks || 0;
        document.getElementById('dashDueTasks').textContent = dueTasks || 0;
    } catch (error) {
        console.error("Erro ao carregar stats do dashboard:", error);
    }

    renderStatusChart();
    renderGanttChart();
}

async function renderStatusChart() {
    if (!currentProject || currentColumns.length === 0) return;
    const ctx = document.getElementById('statusChart')?.getContext('2d');
    if (!ctx) {
        console.warn("Canvas 'statusChart' não encontrado para renderizar.");
        return;
    }
   
    // --- CORREÇÃO ERRO CANVAS ---
    // Adicionando o bloco .destroy() DE VOLTA, aqui dentro da função.
    if (chartInstances.statusChart && typeof chartInstances.statusChart.destroy === 'function') { 
        console.log("Destruindo instância antiga de statusChart (dentro de renderStatusChart)");
        chartInstances.statusChart.destroy();
        chartInstances.statusChart = null;
    }
    // --- FIM DA CORREÇÃO ---

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const counts = await Promise.all(currentColumns.map(async (col) => {
            const { count } = await supabaseRequest(`tarefas?${projectFilter}&coluna_id=eq.${col.id}&select=id`, 'GET', null, { 'Prefer': 'count=exact' });
            return count || 0;
        }));
        const backgroundColors = [ '#0077B6', '#F77F00', '#00D4AA', '#00B4D8', '#90E0EF', '#023047'];
        
        console.log("Renderizando statusChart...");
        chartInstances.statusChart = new Chart(ctx, { // <--- Erro acontecia aqui
            type: 'doughnut',
            data: {
                labels: currentColumns.map(col => col.nome),
                datasets: [{
                    label: 'Tarefas por Status',
                    data: counts,
                    backgroundColor: backgroundColors.slice(0, currentColumns.length),
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } catch (error) {
        console.error("Erro ao renderizar gráfico de status:", error);
    }
}
async function renderGanttChart() {
    if (!currentProject) return;
    const ctx = document.getElementById('ganttChart')?.getContext('2d');
     if (!ctx) {
        console.warn("Canvas 'ganttChart' não encontrado para renderizar.");
        return;
     }

    // --- CORREÇÃO ERRO CANVAS ---
    // Adicionando o bloco .destroy() DE VOLTA, aqui dentro da função.
    if (chartInstances.ganttChart && typeof chartInstances.ganttChart.destroy === 'function') {
        console.log("Destruindo instância antiga de ganttChart (dentro de renderGanttChart)");
        chartInstances.ganttChart.destroy();
        chartInstances.ganttChart = null;
    }
    // --- FIM DA CORREÇÃO ---

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
       const tasks = await supabaseRequest(`tarefas?${projectFilter}&select=id,titulo,created_at,data_inicio,data_entrega&data_entrega=not.is.null&order=data_entrega.asc&limit=15`, 'GET');

        if (!tasks || tasks.length === 0) {
             ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
             ctx.font = "16px Inter"; ctx.fillStyle = "#64748b"; ctx.textAlign = "center";
             ctx.fillText("Nenhuma tarefa com data para exibir no Gantt.", ctx.canvas.width / 2, 50);
             return;
        }

       const ganttData = tasks.map((task, index) => ({
             label: task.titulo,
             data: [{
                 x: [new Date(task.data_inicio || task.created_at).toISOString(), new Date(task.data_entrega).toISOString()],
                 y: task.titulo
             }],
             backgroundColor: index % 3 === 0 ? 'rgba(0, 212, 170, 0.7)' : (index % 3 === 1 ? 'rgba(0, 180, 216, 0.7)' : 'rgba(0, 119, 182, 0.7)'),
             borderColor: index % 3 === 0 ? 'rgba(0, 212, 170, 1)' : (index % 3 === 1 ? 'rgba(0, 180, 216, 1)' : 'rgba(0, 119, 182, 1)'),
             barPercentage: 0.6,
             categoryPercentage: 0.7
        }));
        
        const allDates = tasks.flatMap(t => [new Date(t.data_inicio || t.created_at), new Date(t.data_entrega)]);
        const minDate = new Date(Math.min(...allDates));
        const maxDate = new Date(Math.max(...allDates));
        minDate.setDate(minDate.getDate() - 2);
        maxDate.setDate(maxDate.getDate() + 2);

        console.log("Renderizando ganttChart...");
        chartInstances.ganttChart = new Chart(ctx, { // <--- Erro acontecia aqui
            type: 'bar',
            data: { datasets: ganttData },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day', tooltipFormat: 'dd/MM/yy', displayFormats: { day: 'dd/MM' } },
                        min: minDate.toISOString().split('T')[0],
                        max: maxDate.toISOString().split('T')[0],
                        grid: { display: true, color: '#e5e7eb' },
                        ticks: { font: { size: 10 } }
                    },
                     y: {
                         display: true,
                         ticks: { font: { size: 11 }, autoSkip: false }
                     }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                         callbacks: {
                              label: function(context) {
                                   const start = new Date(context.parsed._custom.barStart).toLocaleDateString('pt-BR');
                                   const end = new Date(context.parsed._custom.barEnd).toLocaleDateString('pt-BR');
                                   return `${context.dataset.label}: ${start} - ${end}`;
                              }
                         }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Erro ao renderizar gráfico Gantt:", error);
    }
}

// ========================================
// 7. LÓGICA DO KANBAN (CORRIGIDA)
// ========================================
let draggedTask = null;

async function loadKanbanView() {
    if (!currentProject || currentColumns.length === 0) {
         document.getElementById('kanbanBoard').innerHTML = '<div class="alert alert-error col-span-3">Projeto ou colunas não carregados.</div>';
         return;
    }

    const kanbanBoard = document.getElementById('kanbanBoard');
    kanbanBoard.innerHTML = `<div class="loading col-span-${currentColumns.length}"><div class="spinner"></div> Carregando tarefas...</div>`;
    console.log("Iniciando loadKanbanView..."); // NOVO LOG

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        console.log(`[Kanban] Filtro de Projeto: ${projectFilter}`); // NOVO LOG
        
        // --- NOVA CORREÇÃO KANBAN VAZIO (Two-Step Query) ---
            
        // 1. Buscar Apenas as Tarefas (simples e seguro)
        const taskQuery = `tarefas?${projectFilter}&select=id,titulo,descricao,data_inicio,data_entrega,prioridade,coluna_id,assignee_id,ordem_na_coluna&order=ordem_na_coluna.asc`;
        console.log("Query Kanban (Step 1 - Tarefas):", taskQuery); 
        const tasks = await supabaseRequest(taskQuery, 'GET');

        console.log("[Kanban] Tarefas brutas recebidas (Step 1):", tasks); // NOVO LOG CRÍTICO

        if (!tasks || tasks.length === 0) {
             console.warn("[Kanban] NENHUMA TAREFA encontrada. Verifique RLS ou se existem tarefas com este projeto_id."); // NOVO LOG
             // Limpa o board, mas não dá erro
        }
        
        // 2. Buscar 'Assignees' (usuários) separadamente
        let assigneeMap = {};
        if (tasks && tasks.length > 0) {
            const assigneeIds = [...new Set(tasks.map(t => t.assignee_id).filter(Boolean))]; // Pega IDs únicos
            
            if (assigneeIds.length > 0) {
                const userQuery = `usuarios?id=in.(${assigneeIds.join(',')})&select=id,nome,profile_picture_url`;
                console.log("Query Kanban (Step 2 - Usuários):", userQuery);
                try {
                    const assignees = await supabaseRequest(userQuery, 'GET');
                    // 3. Criar um "map" (objeto) para join fácil
                    assigneeMap = assignees.reduce((map, user) => {
                        map[user.id] = user;
                        return map;
                    }, {});
                    console.log("[Kanban] Mapa de Assignees (Step 2):", assigneeMap); // NOVO LOG
                } catch (userError) {
                    console.error("Falha ao buscar usuários (assignees). O Kanban continuará sem eles.", userError);
                    // O Kanban vai carregar sem os assignees, o que é melhor que não carregar nada.
                }
            }
        }
        // --- FIM DA NOVA CORREÇÃO ---

        kanbanBoard.innerHTML = '';
        
        // --- CORREÇÃO KANBAN VAZIO (Hipótese Final) ---
        // Pega o ID da primeira coluna ("A Fazer") para usar como fallback.
        const fallbackColumnId = currentColumns[0]?.id || null;
        // --- FIM DA CORREÇÃO ---

        currentColumns.forEach(coluna => {
            const columnEl = document.createElement('div');
            columnEl.className = 'kanban-column';
            columnEl.id = `col-${coluna.id}`;
            columnEl.dataset.colunaId = coluna.id;

            const columnContentEl = document.createElement('div');
            columnContentEl.className = 'kanban-column-content';
            columnContentEl.ondragover = handleDragOver;
            columnContentEl.ondrop = (e) => handleDrop(e, coluna.id);
            
            const addTaskBtn = `<button class="btn btn-secondary btn-small w-full" style="border-style: dashed; text-transform: none; font-weight: 500;" onclick="openTaskModal(null, '${coluna.id}')">
                                    <i data-feather="plus" class="h-4 w-4 mr-1"></i> Adicionar Tarefa
                                </button>`;

            columnEl.innerHTML = `<h3 class="kanban-column-title">${escapeHTML(coluna.nome)}</h3>`;
            columnEl.appendChild(columnContentEl);
            columnEl.innerHTML += `<div class="p-2 mt-auto">${addTaskBtn}</div>`;

            // 4. Fazer o "join" no lado do cliente
            if (tasks && tasks.length > 0) {
                
                // --- CORREÇÃO KANBAN VAZIO (Hipótese Final) ---
                // Modifica o filtro para incluir tarefas "órfãs" (coluna_id=null) na primeira coluna.
                const tasksParaEstaColuna = tasks.filter(t => {
                    if (t.coluna_id === coluna.id) {
                        return true; // Associação normal
                    }
                    // Se a tarefa não tem coluna (null) E esta é a primeira coluna (fallback)
                    if (t.coluna_id === null && coluna.id === fallbackColumnId) {
                        console.warn(`[Kanban] Tarefa órfã '${t.titulo}' (coluna_id: null) movida para '${coluna.nome}'`);
                        return true; // Coloca na primeira coluna
                    }
                    return false;
                });
                // --- FIM DA CORREÇÃO ---

                tasksParaEstaColuna.forEach(task => {
                    // Injeta o objeto 'assignee' no 'task'
                    if (task.assignee_id && assigneeMap[task.assignee_id]) {
                        task.assignee = assigneeMap[task.assignee_id];
                    }
                    console.log(`[Kanban] Adicionando card '${task.titulo}' na coluna '${coluna.nome}'`); // NOVO LOG
                    const card = createTaskCard(task);
                    columnContentEl.appendChild(card);
                });
            }

            kanbanBoard.appendChild(columnEl);
        });

        feather.replace();

    } catch (error) { // Este 'catch' agora só pega erros da query de TAREFAS
         console.error("Erro ao carregar quadro Kanban (Query de Tarefas):", error);
         kanbanBoard.innerHTML = `<div class="alert alert-error col-span-3">Erro ao carregar tarefas: ${escapeHTML(error.message)}</div>`;
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.id = `task-${task.id}`;
    card.className = `kanban-card priority-${task.prioridade}`;
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.colunaId = task.coluna_id;

    let dateHtml = '';
    if (task.data_entrega) {
         const dueDate = new Date(task.data_entrega + 'T00:00:00');
         const today = new Date(); today.setHours(0,0,0,0);
         const doneColumnId = currentColumns.find(c=>c.nome.toLowerCase() === 'concluído')?.id;
         const isLate = dueDate < today && task.coluna_id !== doneColumnId;
         dateHtml = `
            <span class="kanban-card-date ${isLate ? 'text-red-600 font-semibold' : ''}" title="Data de Entrega">
                <i data-feather="calendar" class="h-3 w-3 inline-block -mt-1 mr-1"></i>
                ${dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>`;
    }

    let assigneeHtml = '';
    // --- CORREÇÃO KANBAN VAZIO (RESTAURADA) ---
    // Voltamos a usar task.assignee (o objeto)
    if (task.assignee) {
        assigneeHtml = `
            <img src="${escapeHTML(task.assignee.profile_picture_url || 'icon.png')}"
                 alt="${escapeHTML(task.assignee.nome)}"
                 title="Atribuído a: ${escapeHTML(task.assignee.nome)}"
                 class="w-5 h-5 rounded-full object-cover border border-gray-200 shadow-sm">
        `;
    } else if (task.assignee_id) {
        // Fallback caso o join falhe mas o ID exista
         assigneeHtml = `
            <span title="Atribuído (ID: ${task.assignee_id})">
                <i data-feather="user" class="w-5 h-5 text-gray-500"></i>
            </span>
        `;
    }
    // --- FIM DA CORREÇÃO ---

    card.innerHTML = `
        <div class="kanban-card-title">${escapeHTML(task.titulo)}</div>
        <div class="kanban-card-footer">
            <div class="flex items-center gap-2">
                 <span class"kanban-card-priority priority-${task.prioridade}" title="Prioridade ${task.prioridade}">${escapeHTML(task.prioridade)}</span>
                 ${dateHtml}
            </div>
            ${assigneeHtml}
        </div>
    `;

    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('click', () => openTaskModal(task));

    return card;
}

function handleDragStart(e) {
    draggedTask = e.target.closest('.kanban-card');
    if(!draggedTask) return;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => draggedTask.classList.add('dragging'), 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const columnContent = e.target.closest('.kanban-column-content');
    if (columnContent) {
        document.querySelectorAll('.kanban-column-content.drag-over').forEach(col => col.classList.remove('drag-over'));
        columnContent.classList.add('drag-over');
    }
}

document.querySelectorAll('.kanban-column-content').forEach(col => {
    col.addEventListener('dragleave', (e) => col.classList.remove('drag-over'));
    col.addEventListener('drop', (e) => col.classList.remove('drag-over'));
});

async function handleDrop(e, newColunaId) {
    e.preventDefault();
    document.querySelectorAll('.kanban-column-content.drag-over').forEach(col => col.classList.remove('drag-over')); 

    if (draggedTask) {
        const taskId = draggedTask.dataset.taskId;
        const oldColunaId = draggedTask.dataset.colunaId;

        if (oldColunaId !== newColunaId) {
            console.log(`Movendo task #${taskId} da coluna ${oldColunaId} para ${newColunaId}`);

            const targetColumn = document.getElementById(`col-${newColunaId}`).querySelector('.kanban-column-content');
            targetColumn.appendChild(draggedTask); 
            draggedTask.dataset.colunaId = newColunaId;

            try {
                await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', {
                    coluna_id: newColunaId,
                    updated_at: new Date().toISOString()
                });
                showNotification(`Tarefa #${taskId} movida.`, 'success');
                loadTimelineView(); 
                loadDashboardView(); 
            } catch (error) {
                console.error("Falha ao atualizar task:", error);
                document.getElementById(`col-${oldColunaId}`).querySelector('.kanban-column-content').appendChild(draggedTask); 
                draggedTask.dataset.colunaId = oldColunaId;
                showNotification('Falha ao mover tarefa.', 'error');
            }
        }
        draggedTask.classList.remove('dragging');
        draggedTask = null;
    }
}

// ========================================
// 8. LÓGICA DO MODAL DE TAREFAS (CORRIGIDO)
// ========================================
function openTaskModal(task = null, defaultColunaId = null) {
     if (!currentProject || currentColumns.length === 0) {
          showNotification("Crie ou selecione um projeto e suas colunas primeiro.", "error");
          return;
     }

    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    form.reset();
    document.getElementById('taskAlert').innerHTML = '';

    let colunaIdInput = document.getElementById('taskColunaId');
    if (!colunaIdInput) {
        colunaIdInput = document.createElement('input');
        colunaIdInput.type = 'hidden';
        colunaIdInput.id = 'taskColunaId';
        form.appendChild(colunaIdInput);
    }

    if (task) {
        document.getElementById('taskModalTitle').textContent = 'Editar Tarefa';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.titulo;
        document.getElementById('taskDescription').value = task.descricao || '';
        document.getElementById('taskStartDate').value = task.data_inicio || ''; 
        document.getElementById('taskDueDate').value = task.data_entrega || ''; 
        document.getElementById('taskPriority').value = task.prioridade || 'media';
        colunaIdInput.value = task.coluna_id;
    } else {
        document.getElementById('taskModalTitle').textContent = 'Nova Tarefa';
        document.getElementById('taskId').value = '';
        document.getElementById('taskStartDate').value = ''; 
        document.getElementById('taskDueDate').value = ''; 
        document.getElementById('taskPriority').value = 'media'; 
        
        // --- CORREÇÃO KANBAN VAZIO (Hipótese Final) ---
        // Garante que o ID da coluna "A Fazer" seja pego de forma confiável.
        const primeiraColunaId = currentColumns[0]?.id;
        colunaIdInput.value = defaultColunaId || primeiraColunaId || '';
        if (!colunaIdInput.value) {
            console.error("CRÍTICO: Não foi possível determinar a coluna padrão para a nova tarefa!");
            document.getElementById('taskAlert').innerHTML = '<div class="alert alert-error">Erro: Colunas não carregadas. Não é possível criar tarefa.</div>';
        }
        // --- FIM DA CORREÇÃO ---
    }
    modal.style.display = 'flex';
    feather.replace();
}

async function handleTaskFormSubmit(e) {
    e.preventDefault();
     if (!currentProject || !currentUser || !document.getElementById('taskColunaId').value) {
         showNotification("Erro: Projeto, usuário ou coluna inválida.", "error");
         return;
     }

    const alert = document.getElementById('taskAlert');
    alert.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Salvando...</div>';

    const taskId = document.getElementById('taskId').value;
    
    // --- CORREÇÃO KANBAN VAZIO (Hipótese Final) ---
    // Garante que o ID da coluna não seja uma string vazia (''') e sim nulo (null)
    let colunaIdFinal = document.getElementById('taskColunaId').value;
    if (colunaIdFinal === '') {
        console.warn("Nenhuma coluna ID encontrada no form, tentando fallback para a primeira coluna...");
        colunaIdFinal = currentColumns[0]?.id || null; // Pega a primeira coluna de novo, ou define null
    }
    // --- FIM DA CORREÇÃO ---

    const taskData = {
        titulo: document.getElementById('taskTitle').value,
        descricao: document.getElementById('taskDescription').value || null,
        data_inicio: document.getElementById('taskStartDate').value || null,
        data_entrega: document.getElementById('taskDueDate').value || null,
        prioridade: document.getElementById('taskPriority').value,
        org_id: currentOrg?.id || null,
        projeto_id: currentProject.id,
        coluna_id: colunaIdFinal, // <-- Usa a variável corrigida
        updated_at: new Date().toISOString()
    };

    if (!taskId) { taskData.created_by = currentUser.id; } 

    try {
        if (taskId) {
            await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', taskData);
        } else {
            await supabaseRequest('tarefas', 'POST', taskData);
        }
        showNotification(`Tarefa ${taskId ? 'atualizada' : 'criada'}!`, 'success');
        closeModal('taskModal');
        loadKanbanView(); 
        loadDashboardView(); 
        loadTimelineView(); 
    } catch (error) {
        console.error("Erro ao salvar tarefa:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
    }
}


// ========================================
// 9. LÓGICA DO TIME (Convites)
// ========================================
async function loadTimeView() {
    const teamBody = document.getElementById('teamTableBody');
    teamBody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Carregando membros...</td></tr>';
    const inviteButton = document.querySelector('#timeView button.btn-success');

    try {
        const orgId = currentOrg?.id;
        if (!orgId) {
             teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Funcionalidade de time não disponível no Espaço Pessoal.</td></tr>';
             if(inviteButton) inviteButton.style.display = 'none';
             return;
        } else {
             if(inviteButton) inviteButton.style.display = 'inline-flex';
        }

        const members = await supabaseRequest(`usuario_orgs?org_id=eq.${orgId}&select=role,joined_at,usuarios(id,nome,email,ativo,profile_picture_url)`, 'GET');

        if (!members || members.length === 0) {
            teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum membro encontrado neste time.</td></tr>';
            return;
        }

        teamBody.innerHTML = members.map(m => {
            const user = m.usuarios;
            if (!user) return '';
            const statusClass = user.ativo ? 'status-finalizada' : 'status-negada'; // Reutilizando classes de status
            const statusText = user.ativo ? 'Ativo' : 'Inativo'; 
            return `
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img src="${escapeHTML(user.profile_picture_url || 'icon.png')}" alt="Foto" class="w-8 h-8 rounded-full object-cover">
                            ${escapeHTML(user.nome)}
                        </div>
                    </td>
                    <td>${escapeHTML(user.email)}</td>
                    <td>${escapeHTML(m.role)}</td>
                    <td><span class="status-badge ${statusClass}">${escapeHTML(statusText)}</span></td>
                    <td>
                        ${user.id !== currentUser.id ? `<button class="btn btn-danger btn-small" onclick="removeMember('${user.id}')">Remover</button>` : '(Você)'}
                    </td>
                </tr>
            `;
        }).join('');
        feather.replace();

    } catch (error) {
        console.error("Erro ao carregar membros do time:", error);
        teamBody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar membros: ${escapeHTML(error.message)}</td></tr>`;
    }
}

function openInviteModal() {
    if (!currentOrg?.id) {
         showNotification("Você precisa estar em um time para convidar.", "error");
         return;
    }
    document.getElementById('inviteForm').reset();
    document.getElementById('inviteAlert').innerHTML = '';
    document.getElementById('inviteModal').style.display = 'flex';
    feather.replace();
}

async function handleInviteFormSubmit(e) {
    e.preventDefault();
    const alert = document.getElementById('inviteAlert');
    alert.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Enviando convite...</div>';

    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('inviteRole').value;

    try {
        const response = await fetch('/api/invite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                email: email,
                role: role,
                org_id: currentOrg.id,
                org_name: currentOrg.nome
            })
        });

        if (!response.ok) {
             const errorData = await response.json();
             throw new Error(errorData.error || errorData.message || 'Falha ao enviar convite');
        }

        showNotification(`Convite enviado para ${email}!`, 'success');
        closeModal('inviteModal');
        loadTimeView();

    } catch (error) {
        console.error("Erro ao convidar:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
    }
}

async function removeMember(userIdToRemove) {
     // ATENÇÃO: confirm() não funciona bem em todos os ambientes (como iframes).
     // Usando prompt() como substituto temporário. O ideal é um modal customizado.
     const confirmation = prompt(`Tem certeza que deseja remover este membro do time? Digite 'REMOVER' para confirmar.`);
     if (confirmation !== 'REMOVER') {
        showNotification("Remoção cancelada.", "info");
        return;
     }

     try {
         await supabaseRequest(`usuario_orgs?usuario_id=eq.${userIdToRemove}&org_id=eq.${currentOrg.id}`, 'DELETE');
         showNotification("Membro removido com sucesso.", "success");
         loadTimeView();
     } catch (error) {
         console.error("Erro ao remover membro:", error);
         showNotification(`Erro ao remover membro: ${error.message}`, "error");
     }
}


// ========================================
// 10. LÓGICA DO BLOCO DE NOTAS
// ========================================
async function loadNotasView() {
    const list = document.getElementById('noteList');
    list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>
                      <div class="loading"><div class="spinner"></div> Carregando notas...</div>`;

    try {
        const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : `org_id=is.null&user_id=eq.${currentUser.id}`;
        const notes = await supabaseRequest(`notas?${orgFilter}&select=id,titulo,updated_at&order=updated_at.desc`, 'GET');

        list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>`;

        if (!notes || notes.length === 0) {
            list.innerHTML += '<p class="text-center text-sm text-gray-500">Nenhuma nota encontrada.</p>';
            createNewNote();
            return;
        }

        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-list-item';
            item.dataset.noteId = note.id;
            item.innerHTML = `
                <div class="note-list-title">${escapeHTML(note.titulo) || 'Nota sem título'}</div>
                <div class="note-list-excerpt">Atualizado: ${timeAgo(note.updated_at)}</div>
            `;
            item.addEventListener('click', () => openNote(note.id));
            list.appendChild(item);
        });

        if (notes[0]) { openNote(notes[0].id); } else { createNewNote(); }

    } catch (error) {
        console.error("Erro ao carregar notas:", error);
        list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>
                          <div class="alert alert-error">Erro ao carregar notas.</div>`;
        createNewNote();
    }
}


function createNewNote() {
    currentNoteId = null;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteBody').value = '';
    document.getElementById('noteTitle').focus();
    document.querySelectorAll('.note-list-item.active').forEach(item => item.classList.remove('active'));
}

async function openNote(noteId) {
    if (noteId === null) { createNewNote(); return; }

    document.querySelectorAll('.note-list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.noteId == noteId);
    });

    document.getElementById('noteTitle').value = 'Carregando...';
    document.getElementById('noteBody').value = '';
    currentNoteId = noteId;

    try {
        const note = await supabaseRequest(`notas?id=eq.${noteId}&select=titulo,conteudo`, 'GET');
        if (!note || note.length === 0) throw new Error("Nota não encontrada.");

        document.getElementById('noteTitle').value = note[0].titulo || '';
        document.getElementById('noteBody').value = note[0].conteudo || '';

    } catch (error) {
         console.error(`Erro ao abrir nota ${noteId}:`, error);
         showNotification("Erro ao carregar conteúdo da nota.", "error");
         document.getElementById('noteTitle').value = 'Erro ao carregar';
         document.getElementById('noteBody').value = '';
         currentNoteId = null;
    }
}


async function saveNote() {
    const title = document.getElementById('noteTitle').value;
    const body = document.getElementById('noteBody').value;

    const noteData = {
        titulo: title || 'Nota sem título',
        conteudo: body,
        org_id: currentOrg?.id || null,
        user_id: currentUser.id,
        updated_at: new Date().toISOString() 
    };

    const saveButton = document.querySelector('.note-editor .btn-success');
    const originalButtonText = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...';

    try {
        let savedNote;
        if (currentNoteId) {
            savedNote = await supabaseRequest(`notas?id=eq.${currentNoteId}`, 'PATCH', noteData);
        } else {
            savedNote = await supabaseRequest('notas', 'POST', noteData);
            if (savedNote && savedNote[0]) {
                 currentNoteId = savedNote[0].id;
            }
        }
        showNotification('Nota salva!', 'success');
        loadNotasView(); 

    } catch (error) {
        console.error("Erro ao salvar nota:", error);
        showNotification(`Falha ao salvar nota: ${error.message}`, 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
    }
}


// ========================================
// 11. LÓGICA DO CALENDÁRIO
// ========================================
async function loadCalendarView() {
    const container = document.getElementById('calendarContainer');
    container.innerHTML = `<div class="loading"><div class="spinner"></div> Carregando tarefas...</div>`;

    if (!currentProject) {
        container.innerHTML = '<p class="text-center text-gray-500">Nenhum projeto ativo selecionado.</p>';
        return;
    }

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const tasksWithDate = await supabaseRequest(`tarefas?${projectFilter}&data_entrega=not.is.null&select=id,titulo,data_entrega,prioridade&order=data_entrega.asc`, 'GET');

        if (!tasksWithDate || tasksWithDate.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma tarefa com data de entrega definida neste projeto.</p>';
            return;
        }

        container.innerHTML = `
            <h4 class="text-lg font-semibold mb-3">Próximas Entregas:</h4>
            <ul class="list-none space-y-2">
                ${tasksWithDate.map(t => {
                    const dataEntrega = new Date(t.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR');
                    return `<li class="flex items-center p-2 rounded hover:bg-gray-100">
                                <span class="kanban-card-priority priority-${t.prioridade} mr-3" style="font-size: 0.7rem; padding: 2px 6px;">${escapeHTML(t.prioridade)}</span>
                                <span class="flex-1">${escapeHTML(t.titulo)}</span>
                                <strong class="ml-4 text-sm text-gray-700">${dataEntrega}</strong>
                            </li>`
                }).join('')}
            </ul>
        `;
    } catch (error) {
        console.error("Erro ao carregar calendário:", error);
        container.innerHTML = `<div class="alert alert-error">Erro ao carregar tarefas do calendário.</div>`;
    }
}

// ========================================
// 12. UTILITÁRIOS (Sua API Proxy)
// ========================================
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
        console.error("Token JWT não encontrado");
        logout();
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    const url = `${SUPABASE_PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`;
    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'Prefer': 'return=representation',
            ...headers
        }
    };
    if (body && (method === 'POST' || method === 'PATCH')) {
        config.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(url, config);
        if (!response.ok) {
             let errorData = { message: `Erro ${response.status}: ${response.statusText}` };
             try { errorData = await response.json(); } catch(e) {}
            console.error("Erro Supabase:", errorData);
            const detailedError = errorData.message || errorData.error || `Erro na requisição Supabase (${response.status})`;
            throw new Error(detailedError);
        }
        if (response.status === 204 || response.headers.get('content-length') === '0' ) return null;
        if (headers['Prefer'] === 'count=exact') {
             const count = response.headers.get('content-range')?.split('/')[1];
             return { count: parseInt(count || '0', 10) };
        }
        return await response.json();
    } catch (error) {
        console.error("Erro em supabaseRequest:", error);
        if (error.message.includes("401") || error.message.includes("Unauthorized") || error.message.includes("JWT expired")) {
             logout();
        }
        throw error;
    }
}
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
}

// ========================================
// 13. FUNÇÕES: PERFIL
// ========================================
function loadPerfilView() {
    const form = document.getElementById('perfilForm');
    const alertContainer = document.getElementById('perfilAlert');
    if (!form || !alertContainer) return; 
    alertContainer.innerHTML = '';
    form.reset();

    document.getElementById('perfilEmail').value = currentUser.email || '';
    document.getElementById('perfilNome').value = currentUser.nome || '';
    document.getElementById('perfilNickname').value = currentUser.nickname || '';
    document.getElementById('perfilDescription').value = currentUser.description || '';
    document.getElementById('perfilSector').value = currentUser.sector || '';
    document.getElementById('perfilSkills').value = (currentUser.skills || []).join(', ');
    document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'icon.png';

    feather.replace();
}

function previewProfilePicture(event) {
    const reader = new FileReader();
    reader.onload = function(){
        const output = document.getElementById('perfilPicturePreview');
        output.src = reader.result;
    };
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    } else {
         document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'icon.png';
    }
}

async function handlePerfilFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('perfilAlert');
    const saveButton = event.target.querySelector('button[type="submit"]');
    if (!saveButton || !alertContainer) return;
    const originalButtonText = saveButton.innerHTML;
    alertContainer.innerHTML = '';
    saveButton.disabled = true;
    saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...';

    let profilePicUrl = currentUser.profile_picture_url;
    let newPictureUploaded = false; 

    const pictureFile = document.getElementById('perfilPicture').files[0];
    if (pictureFile) {
        try {
            newPictureUploaded = true; 
            const apiUrl = `/api/upload?fileName=${encodeURIComponent(pictureFile.name)}&fileType=profile_picture`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': pictureFile.type || 'application/octet-stream',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: pictureFile,
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Erro ${response.status} ao enviar foto: ${errorData.details || errorData.error}`);
            }
            const result = await response.json();
            if (result.publicUrl) {
                profilePicUrl = result.publicUrl;
            } else {
                 throw new Error("API de upload não retornou URL pública.");
            }
        } catch (uploadError) {
            console.error("Falha no upload da foto:", uploadError);
            alertContainer.innerHTML = `<div class="alert alert-error">Falha ao enviar a nova foto: ${escapeHTML(uploadError.message)}.</div>`;
             saveButton.disabled = false;
             saveButton.innerHTML = originalButtonText;
             return; 
        }
    }

    const skillsArray = document.getElementById('perfilSkills').value.split(',')
                          .map(s => s.trim()).filter(s => s !== '');

    const profileData = {
        nome: document.getElementById('perfilNome').value,
        nickname: document.getElementById('perfilNickname').value || null,
        description: document.getElementById('perfilDescription').value || null,
        sector: document.getElementById('perfilSector').value || null,
        skills: skillsArray.length > 0 ? skillsArray : null,
        profile_picture_url: profilePicUrl || null
    };

    try {
        const updatedUser = await supabaseRequest(`usuarios?id=eq.${currentUser.id}`, 'PATCH', profileData);

        if (updatedUser && updatedUser[0]) {
            currentUser = { ...currentUser, ...updatedUser[0] };
            localStorage.setItem('user', JSON.stringify(currentUser));
            document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário';
            
            if (!newPictureUploaded) {
                 document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'icon.png';
            }
            
            showNotification('Perfil atualizado com sucesso!', 'success');
        } else {
             throw new Error("Resposta inesperada do servidor ao atualizar perfil.");
        }

    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        if (!alertContainer.innerHTML) {
             alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar dados: ${escapeHTML(error.message)}</div>`;
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
         document.getElementById('perfilPicture').value = ''; 
    }
}


// ========================================
// 14. FUNÇÕES: TIMELINE
// ========================================
async function loadTimelineView() {
    const container = document.getElementById('timelineContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando timeline...</div>';

     if (!currentProject) {
        container.innerHTML = '<p class="text-center text-gray-500">Nenhum projeto ativo selecionado.</p>';
        return;
    }

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        // Query para a timeline
        const events = await supabaseRequest(
            `tarefas?${projectFilter}&select=id,titulo,created_at,updated_at,created_by(nome,profile_picture_url),assignee:assignee_id(nome),coluna:colunas_kanban(nome)&order=updated_at.desc&limit=50`,
            'GET'
        );

        if (!events || events.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma atividade recente encontrada neste projeto.</p>';
            return;
        }

        container.innerHTML = events.map(event => {
            const isCreation = (new Date(event.updated_at).getTime() - new Date(event.created_at).getTime()) < 3000;
            const actionText = isCreation ? 'criou a tarefa' : 'atualizou a tarefa';
            
            // Aqui usamos event.coluna (o alias da query)
            const statusName = event.coluna?.nome || 'Status Desconhecido';
            
            const icon = isCreation ? 'plus-circle' : (statusName.toLowerCase() === 'concluído' ? 'check-circle' : 'edit-2');
            const itemClass = isCreation ? 'created' : (statusName.toLowerCase() === 'concluído' ? 'completed' : 'updated');
            
            // Aqui usamos event.created_by (o join)
            const userName = event.created_by?.nome || 'Usuário desconhecido';
            const userPic = event.created_by?.profile_picture_url || 'icon.png'; 

            return `
                <div class="timeline-item ${itemClass}">
                    <img src="${escapeHTML(userPic)}" alt="${escapeHTML(userName)}" class="w-8 h-8 rounded-full object-cover">
                    <div class="timeline-item-content">
                        <p>
                            <span class="user-name">${escapeHTML(userName)}</span>
                            ${actionText}
                            <span class="task-title">"${escapeHTML(event.titulo)}"</span>
                            ${!isCreation ? `(Status: ${escapeHTML(statusName)})` : ''}
                        </p>
                    </div>
                    <div class="timeline-item-timestamp"> ${timeAgo(event.updated_at)} </div>
                </div> `;
        }).join('');

        feather.replace();

    } catch (error) {
        console.error("Erro ao carregar timeline:", error);
        container.innerHTML = `<div class="alert alert-error">Erro ao carregar timeline: ${escapeHTML(error.message)}</div>`;
    }
}

function timeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInSeconds < 60) return `agora mesmo`;
    if (diffInMinutes === 1) return `1 minuto atrás`;
    if (diffInMinutes < 60) return `${diffInMinutes} minutos atrás`;
    if (diffInHours === 1) return `1 hora atrás`;
    if (diffInHours < 24) return `${diffInHours} horas atrás`;
    if (diffInDays === 1) return `ontem`;
    if (diffInDays < 7) return `${diffInDays} dias atrás`;
    return past.toLocaleDateString('pt-BR');
}



