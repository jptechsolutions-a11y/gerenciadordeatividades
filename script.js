// ========================================
// 1. VARIÁVEIS GLOBAIS E ESTADO
// ========================================
let currentUser = null;
let currentOrg = null; // Organização/Time selecionado
let currentProject = null; // NOVO: Guarda o projeto ativo (simplificado)
let currentColumns = []; // NOVO: Cache das colunas do projeto ativo
let chartInstances = {}; // Cache para gráficos
let currentNoteId = null; // ID da nota ativa no editor

// ========================================
// 2. INICIALIZAÇÃO E AUTENTICAÇÃO
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('inviteForm')?.addEventListener('submit', handleInviteFormSubmit);
    // NOVO: Bind para o form de perfil
    document.getElementById('perfilForm')?.addEventListener('submit', handlePerfilFormSubmit);
    
    // NOVO: Bind para os modais de login
    // Os botões no HTML já têm onclick, mas os forms precisam de submit handler
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) forgotForm.addEventListener('submit', handleForgotPassword);
    
    const requestForm = document.getElementById('requestAccessForm');
    if (requestForm) requestForm.addEventListener('submit', handleRequestAccess);
});

async function handleLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.innerHTML;
    showError('');
    loginButton.disabled = true;
    loginButton.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin-right: 8px;"></div> CARREGANDO...`;

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        const authResponse = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!authResponse.ok) {
             const errorData = await authResponse.json();
             throw new Error(errorData.error || 'Falha na autenticação. Verifique e-mail e senha.');
        }

        const { user: authUser, session: authSession } = await authResponse.json();
        localStorage.setItem('auth_token', authSession.access_token);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Busca Perfil + Times/Orgs (Puxando todos os campos de usuarios)
        const endpoint = `usuarios?auth_user_id=eq.${authUser.id}&select=*,usuario_orgs(org_id,organizacoes(id,nome))`;
        let profileResponse = await supabaseRequest(endpoint, 'GET');

        if (!profileResponse || !profileResponse[0]) {
             console.warn("Perfil não encontrado na primeira tentativa. Tentando novamente após 1.5s...");
             await new Promise(resolve => setTimeout(resolve, 1500));
             profileResponse = await supabaseRequest(endpoint, 'GET');
             if (!profileResponse || !profileResponse[0]) {
                 // Se ainda não houver perfil, pode ser o primeiro login.
                 // Vamos criar um perfil básico.
                 console.log("Criando novo perfil de usuário...");
                 const newProfile = {
                     auth_user_id: authUser.id,
                     email: authUser.email,
                     nome: authUser.email.split('@')[0] // Nome temporário
                 };
                 const createResponse = await supabaseRequest('usuarios', 'POST', newProfile);
                 if (!createResponse || !createResponse[0]) {
                     throw new Error("Falha ao criar o perfil de usuário no banco de dados.");
                 }
                 // Recarrega os dados do perfil recém-criado (sem orgs)
                 currentUser = createResponse[0];
                 currentUser.organizacoes = [];
                 console.log("Novo perfil criado com sucesso!");
             } else {
                currentUser = profileResponse[0];
                console.log("Sucesso na segunda tentativa!");
             }
        } else {
             currentUser = profileResponse[0];
             console.log("Sucesso na primeira tentativa!");
        }

        const userOrgs = (currentUser.usuario_orgs || []).map(uo => uo.organizacoes).filter(Boolean);
        currentUser.organizacoes = userOrgs;
        delete currentUser.usuario_orgs; // Limpa o dado aninhado

        localStorage.setItem('user', JSON.stringify(currentUser));
        redirectToDashboard(loginButton);

    } catch (error) {
        console.error("Erro detalhado no login:", error);
        showError(error.message);
        loginButton.disabled = false;
        loginButton.innerHTML = originalButtonText;
    }
}

function redirectToDashboard(loginButton) {
    if (!currentUser || !currentUser.organizacoes) {
        showError("Erro fatal: Dados do usuário incompletos.");
        logout();
        return;
    }

    const orgs = currentUser.organizacoes;
    const orgSelectGroup = document.getElementById('orgSelectGroup');
    const orgSelect = document.getElementById('orgSelect');
    const loginForm = document.getElementById('loginForm');

    // Se não tiver time (pode usar solo) ou tiver 1 time, entra direto
    if (orgs.length === 0) {
        currentOrg = { id: null, nome: 'Espaço Pessoal' }; // Modo Solo - ID nulo para diferenciar
        showMainSystem();
    } else if (orgs.length === 1) {
        currentOrg = orgs[0];
        showMainSystem();
    }
    // Se tiver múltiplos times, mostra seletor
    else {
        orgSelect.innerHTML = orgs.map(o => `<option value="${o.id}">${escapeHTML(o.nome)}</option>`).join('');
        orgSelectGroup.style.display = 'block';
        orgSelect.focus();

        loginButton.disabled = false;
        loginButton.innerHTML = 'CONFIRMAR TIME';

        loginForm.removeEventListener('submit', handleLogin);
        loginForm.addEventListener('submit', handleOrgSelection);
    }
}

function handleOrgSelection(event) {
    event.preventDefault();
    const orgId = document.getElementById('orgSelect').value;
    const org = currentUser.organizacoes.find(o => o.id == orgId);

    if (org) {
        currentOrg = org;
        document.getElementById('loginForm').removeEventListener('submit', handleOrgSelection);
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
        document.getElementById('orgSelectGroup').style.display = 'none';
        document.querySelector('#loginForm button[type="submit"]').innerHTML = 'ENTRAR';
        showMainSystem();
    } else {
        showError("Erro: Time selecionado inválido.");
    }
}

function showMainSystem() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainSystem').style.display = 'flex';
    document.body.classList.add('system-active');

    document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário';
    document.getElementById('sidebarOrg').textContent = currentOrg.nome || 'N/A';

    // Carrega projeto ativo e colunas antes de mostrar qualquer view
    loadActiveProject().then(() => {
        showView('dashboardView', document.querySelector('a[href="#dashboard"]'));
        feather.replace();
    }).catch(err => {
         console.error("Erro ao carregar projeto ativo:", err);
         showNotification(`Erro: ${err.message}. Verifique o console.`, "error", 6000);
         // Mostra dashboard mesmo assim (pode ter erros parciais)
         showView('dashboardView', document.querySelector('a[href="#dashboard"]'));
         feather.replace();
    });
}

function logout() {
    currentUser = null;
    currentOrg = null;
    currentProject = null; // Zerar
    currentColumns = [];   // Zerar
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    document.body.classList.remove('system-active');

    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';

    // Reseta o form de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.reset();
        showError('');
        document.getElementById('orgSelectGroup').style.display = 'none';
        loginForm.removeEventListener('submit', handleOrgSelection);
        loginForm.addEventListener('submit', handleLogin);
        const loginButton = loginForm.querySelector('button[type="submit"]');
        if (loginButton) loginButton.innerHTML = 'ENTRAR';
    }
}


// ========================================
// 3. NAVEGAÇÃO E UI
// ========================================
function showView(viewId, element = null) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    const viewEl = document.getElementById(viewId);
    if(viewEl) viewEl.classList.add('active');

    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
    element?.classList.add('active');

    // Carrega dados específicos da view
    try {
        switch (viewId) {
            case 'dashboardView': loadDashboardView(); break;
            case 'projetosView': loadKanbanView(); break;
            case 'timelineView': loadTimelineView(); break; // NOVO
            case 'calendarioView': loadCalendarView(); break;
            case 'notasView': loadNotasView(); break;
            case 'timeView': loadTimeView(); break;
            case 'perfilView': loadPerfilView(); break; // NOVO
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
// 4. Carregar Projeto Ativo e Colunas
// ========================================
async function loadActiveProject() {
    console.log("Carregando projeto ativo...");
    currentProject = null;
    currentColumns = [];
    // Filtra por org_id (time) ou, se for espaço pessoal (currentOrg.id == null), filtra por created_by
    const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : `org_id=is.null&created_by=eq.${currentUser.id}`;

    try {
        const projetos = await supabaseRequest(`projetos?${orgFilter}&select=id,nome&limit=1&order=created_at.asc`, 'GET');
        
        if (!projetos || projetos.length === 0) {
            // Se não houver projeto, cria o 'Meu Primeiro Quadro'
            console.warn("Nenhum projeto encontrado. Criando 'Meu Primeiro Quadro'...");
            const newProject = {
                 nome: 'Meu Primeiro Quadro',
                 created_by: currentUser.id,
                 org_id: currentOrg?.id || null
            };
            const createResponse = await supabaseRequest('projetos', 'POST', newProject);
            if (!createResponse || !createResponse[0]) throw new Error("Falha ao criar projeto padrão.");
            currentProject = createResponse[0];
            console.log("Projeto padrão criado:", currentProject);
        } else {
            currentProject = projetos[0];
            console.log("Projeto ativo:", currentProject);
        }

        // Buscar colunas do projeto ativo
        currentColumns = await supabaseRequest(`colunas_kanban?projeto_id=eq.${currentProject.id}&select=id,nome,ordem&order=ordem.asc`, 'GET');
        
        if (!currentColumns || currentColumns.length === 0) {
            console.warn("Nenhuma coluna encontrada para o projeto ativo. Criando padrão.");
            await createDefaultColumns(currentProject.id); // Cria e espera
            // Busca novamente
            currentColumns = await supabaseRequest(`colunas_kanban?projeto_id=eq.${currentProject.id}&select=id,nome,ordem&order=ordem.asc`, 'GET');
             if (!currentColumns || currentColumns.length === 0){
                  throw new Error("Falha ao criar ou buscar colunas padrão após tentativa.");
             }
        }
        console.log("Colunas carregadas:", currentColumns.map(c => `${c.nome} (${c.id})`));

    } catch (error) {
        console.error("Erro fatal ao carregar projeto/colunas:", error);
        throw error; // Repassa o erro para showMainSystem tratar
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
          console.log("Colunas padrão criadas para o projeto:", projectId);
     } catch (error) {
          console.error("Erro ao criar colunas padrão:", error);
     }
}

// ========================================
// 5. LÓGICA DO DASHBOARD (Gráficos)
// ========================================
async function loadDashboardView() {
    const view = document.getElementById('dashboardView');
    // Limpa a view para mostrar o loading
    view.innerHTML = `<h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard de Produtividade</h1>
                      <div class="loading"><div class="spinner"></div> Carregando estatísticas...</div>`;

    if (!currentProject || currentColumns.length === 0) {
         view.innerHTML = '<h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1><div class="alert alert-error">Não foi possível carregar o dashboard. Verifique a configuração do projeto e colunas.</div>';
         return;
    }

    // Recria a estrutura dos cards
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
    
    // Lógica original de busca dos cards (ajustada para usar currentProject)
    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        
        // Encontrar o ID da coluna 'Concluído'
        const doneColumn = currentColumns.find(col => col.nome.toLowerCase() === 'concluído');
        const doneColumnId = doneColumn ? doneColumn.id : null;
        
        // Encontrar IDs de colunas NÃO concluídas
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
        const { count: dueTasks } = await supabaseRequest(`tarefas?${projectFilter}&data_entrega=eq.${today}&coluna_id=in.(${activeColumnIds.join(',')})&select=id`, 'GET', null, { 'Prefer': 'count=exact' });

        document.getElementById('dashTotalTasks').textContent = totalTasks || 0;
        document.getElementById('dashCompletedTasks').textContent = completedTasks || 0;
        document.getElementById('dashDueTasks').textContent = dueTasks || 0;
    } catch (error) { 
        console.error("Erro ao carregar stats do dashboard:", error);
        showNotification("Erro ao carregar estatísticas.", "error");
    }

    renderStatusChart();
    renderGanttChart();
}

async function renderStatusChart() {
    if (!currentProject || currentColumns.length === 0) return;

    const ctx = document.getElementById('statusChart').getContext('2d');
    if (chartInstances.statusChart) chartInstances.statusChart.destroy();

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        
        // Busca a contagem de tarefas para cada coluna em paralelo
        const counts = await Promise.all(currentColumns.map(async (col) => {
            const { count } = await supabaseRequest(`tarefas?${projectFilter}&coluna_id=eq.${col.id}&select=id`, 'GET', null, { 'Prefer': 'count=exact' });
            return count || 0;
        }));

        const backgroundColors = [ '#0077B6', '#F77F00', '#00D4AA', '#00B4D8', '#90E0EF', '#023047'];

        chartInstances.statusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: currentColumns.map(col => col.nome), // Nomes das colunas reais
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
        showNotification("Erro ao carregar gráfico de status.", "error");
    }
}


async function renderGanttChart() {
    if (!currentProject) return;

    const ctx = document.getElementById('ganttChart').getContext('2d');
    if (chartInstances.ganttChart) chartInstances.ganttChart.destroy();

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const tasks = await supabaseRequest(`tarefas?${projectFilter}&select=id,titulo,created_at,data_entrega&data_entrega=not.is.null&order=data_entrega.asc&limit=10`, 'GET');

        if (!tasks || tasks.length === 0) {
             ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
             ctx.font = "16px Inter";
             ctx.fillStyle = "#64748b";
             ctx.textAlign = "center";
             ctx.fillText("Nenhuma tarefa com data para exibir no Gantt.", ctx.canvas.width / 2, ctx.canvas.height / 2);
             return;
        }

        const ganttData = tasks.map((task, index) => ({
             label: task.titulo,
             data: [{ 
                 // Usa created_at como início e data_entrega como fim
                 x: [new Date(task.created_at).toISOString(), new Date(task.data_entrega).toISOString()], 
                 y: task.titulo 
             }],
             backgroundColor: index % 2 === 0 ? 'rgba(0, 212, 170, 0.7)' : 'rgba(0, 180, 216, 0.7)',
             borderColor: index % 2 === 0 ? 'rgba(0, 212, 170, 1)' : 'rgba(0, 180, 216, 1)',
             barPercentage: 0.5
        }));

        const allDates = tasks.flatMap(t => [new Date(t.created_at), new Date(t.data_entrega)]);
        const minDate = new Date(Math.min(...allDates));
        const maxDate = new Date(Math.max(...allDates));
        minDate.setDate(minDate.getDate() - 1); // Margem
        maxDate.setDate(maxDate.getDate() + 1); // Margem

        chartInstances.ganttChart = new Chart(ctx, {
            type: 'bar',
            data: { datasets: ganttData },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day', tooltipFormat: 'dd/MM/yy' },
                        min: minDate.toISOString().split('T')[0],
                        max: maxDate.toISOString().split('T')[0],
                    },
                     y: { display: true }
                },
                plugins: { legend: { display: false } }
            }
        });
    } catch (error) { 
        console.error("Erro ao renderizar gráfico Gantt:", error);
        showNotification("Erro ao carregar gráfico Gantt.", "error");
    }
}

// ========================================
// 6. LÓGICA DO KANBAN (Projetos)
// ========================================
let draggedTask = null; // Guarda o elemento sendo arrastado

async function loadKanbanView() {
    if (!currentProject || currentColumns.length === 0) {
         document.getElementById('kanbanBoard').innerHTML = '<div class="alert alert-error col-span-3">Projeto ou colunas não carregados. Verifique as configurações.</div>';
         return;
    }

    const kanbanBoard = document.getElementById('kanbanBoard');
    kanbanBoard.innerHTML = `<div class="loading col-span-${currentColumns.length}"><div class="spinner"></div> Carregando tarefas...</div>`;

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const tasks = await supabaseRequest(`tarefas?${projectFilter}&select=*,assignee_id(nome,profile_picture_url)&order=ordem_na_coluna.asc`, 'GET');

        kanbanBoard.innerHTML = ''; // Limpar o loading
        currentColumns.forEach(coluna => {
            const columnEl = document.createElement('div');
            columnEl.className = 'kanban-column';
            columnEl.id = `col-${coluna.id}`;
            columnEl.dataset.colunaId = coluna.id;

            const columnContentEl = document.createElement('div');
            columnContentEl.className = 'kanban-column-content';
            columnContentEl.ondragover = handleDragOver;
            columnContentEl.ondrop = (e) => handleDrop(e, coluna.id);

            // Botão de adicionar tarefa (+) na coluna
            const addTaskBtn = `<button class="btn btn-primary btn-small w-full" onclick="openTaskModal(null, '${coluna.id}')">
                                    <i data-feather="plus" class="h-4 w-4"></i>
                                </button>`;

            columnEl.innerHTML = `<h3 class="kanban-column-title">${escapeHTML(coluna.nome)}</h3>`;
            columnEl.appendChild(columnContentEl);
            columnEl.innerHTML += `<div class="p-2">${addTaskBtn}</div>`; // Adiciona o botão no rodapé da coluna

            // Adicionar tasks à coluna
            (tasks || []).filter(t => t.coluna_id === coluna.id).forEach(task => {
                const card = createTaskCard(task);
                columnContentEl.appendChild(card);
            });

            kanbanBoard.appendChild(columnEl);
        });

        feather.replace();

    } catch (error) { 
         console.error("Erro ao carregar quadro Kanban:", error);
         kanbanBoard.innerHTML = `<div class="alert alert-error col-span-3">Erro ao carregar quadro: ${escapeHTML(error.message)}</div>`;
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.id = `task-${task.id}`;
    card.className = 'kanban-card';
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.colunaId = task.coluna_id;

    card.classList.add(`priority-${task.prioridade}`);

    // Data (se existir)
    let dateHtml = '';
    if (task.data_entrega) {
         const dueDate = new Date(task.data_entrega + 'T00:00:00'); // Trata como data local
         const today = new Date(); today.setHours(0,0,0,0);
         const isLate = dueDate < today;
         dateHtml = `
            <span class="kanban-card-date ${isLate ? 'text-red-600 font-bold' : ''}" title="Data de Entrega">
                <i data-feather="calendar" class="h-4 w-4 inline-block -mt-1"></i>
                ${dueDate.toLocaleDateString('pt-BR')}
            </span>`;
    }
        
    // Avatar (Assignee)
    let assigneeHtml = '';
    if (task.assignee_id) {
        assigneeHtml = `
            <img src="${escapeHTML(task.assignee_id.profile_picture_url || 'icon.png')}" 
                 alt="${escapeHTML(task.assignee_id.nome)}" 
                 title="Atribuído a: ${escapeHTML(task.assignee_id.nome)}"
                 class="w-6 h-6 rounded-full object-cover border-2 border-white shadow-sm">
        `;
    }

    card.innerHTML = `
        <div class="kanban-card-title">${escapeHTML(task.titulo)}</div>
        <div class="kanban-card-footer">
            <div>
                ${dateHtml}
                <span class="kanban-card-priority priority-${task.prioridade}">${escapeHTML(task.prioridade)}</span>
            </div>
            ${assigneeHtml}
        </div>
    `;

    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('click', () => openTaskModal(task)); // Abre modal para edição

    return card;
}


// --- Funções de Drag & Drop ---
function handleDragStart(e) {
    draggedTask = e.target.closest('.kanban-card'); // Garante que pegou o card pai
    if(!draggedTask) return;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => draggedTask.classList.add('dragging'), 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const columnContent = e.target.closest('.kanban-column-content');
    if (columnContent) {
        // Remove 'drag-over' de todas as outras colunas
        document.querySelectorAll('.kanban-column-content.drag-over').forEach(col => col.classList.remove('drag-over'));
        columnContent.classList.add('drag-over');
    }
}

// Remove o highlight
document.querySelectorAll('.kanban-column-content').forEach(col => {
    col.addEventListener('dragleave', (e) => col.classList.remove('drag-over'));
    col.addEventListener('drop', (e) => col.classList.remove('drag-over'));
});


async function handleDrop(e, newColunaId) {
    e.preventDefault();
    if (draggedTask) {
        const taskId = draggedTask.dataset.taskId;
        const oldColunaId = draggedTask.dataset.colunaId;

        if (oldColunaId !== newColunaId) {
            console.log(`Movendo task #${taskId} da coluna ${oldColunaId} para ${newColunaId}`);

            // 1. (Otimista) Mover o card na UI
            const targetColumn = document.getElementById(`col-${newColunaId}`).querySelector('.kanban-column-content');
            targetColumn.appendChild(draggedTask);
            draggedTask.dataset.colunaId = newColunaId;
            // TODO: Atualizar a 'ordem_na_coluna' de todos os cards na old e new colunas

            // 2. (Real) Atualizar no Supabase
            try {
                // *** DESCOMENTADO ***
                await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', { 
                    coluna_id: newColunaId,
                    updated_at: new Date().toISOString() // Força atualização do timestamp
                });
                showNotification(`Tarefa #${taskId} movida.`, 'success');
                loadTimelineView(); // Atualiza a timeline
            } catch (error) {
                // Reverter UI em caso de erro
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
// 7. LÓGICA DO MODAL DE TAREFAS
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

    // Garante que o input hidden 'taskColunaId' existe
    let colunaIdInput = document.getElementById('taskColunaId');
    if (!colunaIdInput) {
        colunaIdInput = document.createElement('input');
        colunaIdInput.type = 'hidden';
        colunaIdInput.id = 'taskColunaId';
        form.appendChild(colunaIdInput);
    }

    if (task) {
        // Modo Edição
        document.getElementById('taskModalTitle').textContent = 'Editar Tarefa';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.titulo;
        document.getElementById('taskDescription').value = task.descricao || '';
        document.getElementById('taskDueDate').value = task.data_entrega || '';
        document.getElementById('taskPriority').value = task.prioridade || 'media';
        colunaIdInput.value = task.coluna_id; // Guarda a coluna atual
    } else {
        // Modo Criação
        document.getElementById('taskModalTitle').textContent = 'Nova Tarefa';
        document.getElementById('taskId').value = '';
        // Define a coluna padrão (a coluna clicada ou a primeira coluna)
        colunaIdInput.value = defaultColunaId || currentColumns[0]?.id || '';
    }
    modal.style.display = 'flex';
    feather.replace(); // Recarregar ícones no modal
}


async function handleTaskFormSubmit(e) {
    e.preventDefault();
     if (!currentProject || !currentUser) {
         showNotification("Erro: Projeto ou usuário não carregado.", "error");
         return;
     }

    const alert = document.getElementById('taskAlert');
    alert.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Salvando...</div>';

    const taskId = document.getElementById('taskId').value;
    const taskData = {
        titulo: document.getElementById('taskTitle').value,
        descricao: document.getElementById('taskDescription').value || null,
        data_entrega: document.getElementById('taskDueDate').value || null,
        prioridade: document.getElementById('taskPriority').value,
        org_id: currentOrg?.id || null,
        projeto_id: currentProject.id, // Usa o projeto ativo
        coluna_id: document.getElementById('taskColunaId').value // Usa o input hidden
        // updated_at será atualizado pelo trigger no DB
    };
    
    // Adicionar created_by apenas na criação
     if (!taskId) {
          taskData.created_by = currentUser.id;
     }

    try {
        if (taskId) {
            // Edição (PATCH)
            await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', taskData);
        } else {
            // Criação (POST)
            await supabaseRequest('tarefas', 'POST', taskData);
        }

        showNotification(`Tarefa ${taskId ? 'atualizada' : 'criada'}!`, 'success');
        closeModal('taskModal');
        loadKanbanView(); // Recarrega o quadro
        loadDashboardView(); // Atualiza os gráficos
        loadTimelineView(); // Atualiza a timeline

    } catch (error) {
        console.error("Erro ao salvar tarefa:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
    }
}


// ========================================
// 8. LÓGICA DO TIME (Convites)
// ========================================
async function loadTimeView() {
    const teamBody = document.getElementById('teamTableBody');
    teamBody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Carregando membros...</td></tr>';
    const inviteButton = document.querySelector('#timeView button.btn-success');

    try {
        const orgId = currentOrg?.id;
        if (!orgId) { // Não carrega time se for espaço pessoal
             teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Funcionalidade de time não disponível no Espaço Pessoal.</td></tr>';
             if(inviteButton) inviteButton.style.display = 'none'; // Esconder botão de convite
             return;
        } else {
             if(inviteButton) inviteButton.style.display = 'inline-flex'; // Mostrar botão de convite
        }

        const members = await supabaseRequest(`usuario_orgs?org_id=eq.${orgId}&select=role,joined_at,usuarios(id,nome,email,ativo)`, 'GET');

        if (!members || members.length === 0) {
            teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum membro encontrado neste time.</td></tr>';
            return;
        }

        teamBody.innerHTML = members.map(m => {
            const user = m.usuarios;
            if (!user) return ''; // Proteção caso o usuário tenha sido deletado mas o vínculo não
            const statusClass = user.ativo ? 'status-finalizada' : 'status-negada';
            const statusText = user.ativo ? 'Ativo' : 'Inativo';
            return `
                <tr>
                    <td>${escapeHTML(user.nome)}</td>
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
         showNotification("Você precisa estar em um time (não no Espaço Pessoal) para convidar.", "error");
         return;
    }
    document.getElementById('inviteForm').reset();
    document.getElementById('inviteAlert').innerHTML = '';
    document.getElementById('inviteModal').style.display = 'flex';
    feather.replace(); // Ícones no modal
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
        loadTimeView(); // Recarrega a lista do time

    } catch (error) {
        console.error("Erro ao convidar:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
    }
}

async function removeMember(userIdToRemove) {
     if (!confirm(`Tem certeza que deseja remover este membro do time?`)) return;

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
// 9. LÓGICA DO BLOCO DE NOTAS
// ========================================
async function loadNotasView() {
    const list = document.getElementById('noteList');
    list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>
                      <div class="loading"><div class="spinner"></div> Carregando notas...</div>`;

    try {
        // Filtra por org_id (time) ou, se for espaço pessoal (currentOrg.id == null), filtra por user_id E org_id=is.null
        const orgFilter = currentOrg?.id 
            ? `org_id=eq.${currentOrg.id}` 
            : `org_id=is.null&user_id=eq.${currentUser.id}`;
            
        const notes = await supabaseRequest(`notas?${orgFilter}&select=id,titulo,updated_at&order=updated_at.desc`, 'GET');

        list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>`; // Limpa o loading

        if (!notes || notes.length === 0) {
            list.innerHTML += '<p class="text-center text-sm text-gray-500">Nenhuma nota encontrada.</p>';
            createNewNote(); // Abre editor vazio
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

        // Abre a nota mais recente por padrão
        openNote(notes[0].id);

    } catch (error) {
        console.error("Erro ao carregar notas:", error);
        list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>
                          <div class="alert alert-error">Erro ao carregar notas.</div>`;
        createNewNote(); // Abre editor vazio mesmo com erro
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
    if (noteId === null) {
        createNewNote();
        return;
    }
    document.querySelectorAll('.note-list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.noteId == noteId);
    });

    document.getElementById('noteTitle').value = 'Carregando...';
    document.getElementById('noteBody').value = '';
    currentNoteId = noteId;

    try {
        // Busca a nota completa pelo ID (RLS garantirá que só busque se tiver permissão)
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
        org_id: currentOrg?.id || null, // Permite notas pessoais
        user_id: currentUser.id
        // updated_at será atualizado pelo trigger
    };

    const saveButton = document.querySelector('.note-editor .btn-success');
    const originalButtonText = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...';

    try {
        let savedNote;
        if (currentNoteId) {
            // Update
            savedNote = await supabaseRequest(`notas?id=eq.${currentNoteId}`, 'PATCH', noteData); // Descomentado
        } else {
            // Create
            savedNote = await supabaseRequest('notas', 'POST', noteData); // Descomentado
            if (savedNote && savedNote[0]) {
                 currentNoteId = savedNote[0].id; // Pega o ID da nova nota
            }
        }
        showNotification('Nota salva!', 'success');
        // Recarrega a lista para mostrar o título/data atualizados
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
// 10. LÓGICA DO CALENDÁRIO
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
        // Buscar tarefas com data_entrega no projeto atual
        const tasksWithDate = await supabaseRequest(`tarefas?${projectFilter}&data_entrega=not.is.null&select=id,titulo,data_entrega,prioridade&order=data_entrega.asc`, 'GET');

        if (!tasksWithDate || tasksWithDate.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma tarefa com data de entrega definida neste projeto.</p>';
            return;
        }

        container.innerHTML = `
            <h4 class="text-lg font-semibold mb-3">Próximas Entregas:</h4>
            <ul class_alias="list-disc list-inside space-y-2">
                ${tasksWithDate.map(t => {
                    // Adiciona T00:00:00 para tratar a data como local e evitar bugs de fuso
                    const dataEntrega = new Date(t.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR');
                    return `<li class="flex items-center">
                                <span class="kanban-card-priority priority-${t.prioridade} mr-2" style="font-size: 0.7rem; padding: 2px 6px;">${escapeHTML(t.prioridade)}</span>
                                ${escapeHTML(t.titulo)} - 
                                <strong class="ml-1">${dataEntrega}</strong>
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
// 11. UTILITÁRIOS
// ========================================
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
        console.error("Token JWT não encontrado");
        logout();
        throw new Error("Sessão expirada. Faça login novamente.");
    }

    // Usa a constante SUPABASE_PROXY_URL definida no HTML
    const url = `${SUPABASE_PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`;

    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'Prefer': 'return=representation', // Sempre pede para retornar o registro
            ...headers // Adiciona headers customizados (como 'count=exact')
        }
    };

    if (body && (method === 'POST' || method === 'PATCH')) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);
        if (!response.ok) {
             let errorData = { message: `Erro ${response.status}: ${response.statusText}` };
             try {
                  errorData = await response.json();
             } catch(e) { /* Ignora erro de parse */ }
            console.error("Erro Supabase:", errorData);
            throw new Error(errorData.message || errorData.error || `Erro na requisição Supabase (${response.status})`);
        }
        
        // Tratamento para DELETE ou respostas sem corpo
        if (response.status === 204 || response.headers.get('content-length') === '0' ) return null;

        // Tratamento para count=exact
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
// 12. FUNÇÃO DE ERRO (Login)
// ========================================
function showError(message) {
    const alertContainer = document.getElementById('loginAlert');
    if (!message) {
        if (alertContainer) alertContainer.innerHTML = '';
        return;
    }
    console.error("Erro exibido ao usuário:", message);
    if (alertContainer) {
        alertContainer.innerHTML = `<div class="alert alert-error">${escapeHTML(message)}</div>`;
    }
}

// ========================================
// 13. NOVAS FUNÇÕES: PERFIL
// ========================================
function loadPerfilView() {
    const form = document.getElementById('perfilForm');
    const alertContainer = document.getElementById('perfilAlert');
    alertContainer.innerHTML = '';
    form.reset(); 

    // Preenche campos
    document.getElementById('perfilEmail').value = currentUser.email || '';
    document.getElementById('perfilNome').value = currentUser.nome || '';
    document.getElementById('perfilNickname').value = currentUser.nickname || '';
    document.getElementById('perfilDescription').value = currentUser.description || '';
    document.getElementById('perfilSector').value = currentUser.sector || '';
    document.getElementById('perfilSkills').value = (currentUser.skills || []).join(', '); // Converte array para string
    document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'icon.png'; // Usa icon.png como fallback

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
    const originalButtonText = saveButton.innerHTML;
    alertContainer.innerHTML = '';
    saveButton.disabled = true;
    saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...';

    let profilePicUrl = currentUser.profile_picture_url; // Mantém a URL atual por padrão

    // 1. Faz upload da nova foto, se houver
    const pictureFile = document.getElementById('perfilPicture').files[0];
    if (pictureFile) {
        try {
            console.log("Enviando nova foto de perfil...");
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
                profilePicUrl = result.publicUrl; // Atualiza a URL a ser salva
                console.log("Nova URL da foto:", profilePicUrl);
            } else {
                 throw new Error("API de upload não retornou URL pública.");
            }
        } catch (uploadError) {
            console.error("Falha no upload da foto:", uploadError);
            alertContainer.innerHTML = `<div class="alert alert-error">Falha ao enviar a nova foto: ${escapeHTML(uploadError.message)}. As outras informações podem ter sido salvas.</div>`;
        }
    }

    // 2. Prepara os dados do perfil para salvar
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

    // 3. Salva os dados no banco (na tabela usuarios, usando o ID do usuário)
    try {
        // A política RLS permite este PATCH porque o ID do usuário bate com o auth.uid()
        const updatedUser = await supabaseRequest(`usuarios?id=eq.${currentUser.id}`, 'PATCH', profileData);

        if (updatedUser && updatedUser[0]) {
            // Atualiza o currentUser local com os novos dados
            currentUser = { ...currentUser, ...updatedUser[0] };
            localStorage.setItem('user', JSON.stringify(currentUser)); // Atualiza no localStorage

            // Atualiza a UI imediatamente
            document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário';
            if (!pictureFile) document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'icon.png';

            showNotification('Perfil atualizado com sucesso!', 'success');
        } else {
             throw new Error("Resposta inesperada do servidor ao atualizar perfil.");
        }

    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        if (!alertContainer.innerHTML) { // Só mostra erro se já não houver um erro de upload
             alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar dados: ${escapeHTML(error.message)}</div>`;
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
         document.getElementById('perfilPicture').value = ''; // Limpa o input file
    }
}


// ========================================
// 14. NOVAS FUNÇÕES: TIMELINE
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
        // Buscar tarefas recentes (criadas ou atualizadas), incluindo quem criou e o status (coluna)
        // O ideal seria ter uma tabela de "histórico", mas vamos simular com 'updated_at'
        const events = await supabaseRequest(
            `tarefas?${projectFilter}&select=id,titulo,created_at,updated_at,created_by(nome),assignee_id(nome),colunas_kanban(nome)&order=updated_at.desc&limit=50`,
            'GET'
        );

        if (!events || events.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma atividade recente encontrada neste projeto.</p>';
            return;
        }

        container.innerHTML = events.map(event => {
            const isCreation = (new Date(event.updated_at).getTime() - new Date(event.created_at).getTime()) < 2000; // 2 segundos de margem
            const actionText = isCreation ? 'criou a tarefa' : 'atualizou a tarefa';
            const statusName = event.colunas_kanban?.nome || 'Status Desconhecido';
            const icon = isCreation ? 'plus-circle' : (statusName.toLowerCase() === 'concluído' ? 'check-circle' : 'edit-2');
            const itemClass = isCreation ? 'created' : (statusName.toLowerCase() === 'concluído' ? 'completed' : 'updated');
            const userName = event.created_by?.nome || 'Usuário desconhecido';

            return `
                <div class="timeline-item ${itemClass}">
                    <div class="timeline-item-icon">
                        <i data-feather="${icon}" class="h-5 w-5"></i>
                    </div>
                    <div class="timeline-item-content">
                        <p>
                            <span class="user-name">${escapeHTML(userName)}</span>
                            ${actionText}
                            <span class="task-title">"${escapeHTML(event.titulo)}"</span>
                            ${!isCreation ? `(Status: ${escapeHTML(statusName)})` : ''}
                        </p>
                    </div>
                    <div class="timeline-item-timestamp">
                        ${timeAgo(event.updated_at)}
                    </div>
                </div>
            `;
        }).join('');

        feather.replace();

    } catch (error) {
        console.error("Erro ao carregar timeline:", error);
        container.innerHTML = `<div class="alert alert-error">Erro ao carregar timeline: ${escapeHTML(error.message)}</div>`;
    }
}

// Função utilitária simples para "tempo atrás"
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
    return `${diffInDays} dias atrás`;
}

// ========================================
// 15. NOVAS FUNÇÕES: MODAIS DE LOGIN
// ========================================
function openForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) modal.style.display = 'flex';
}

function openRequestAccessModal() {
    const modal = document.getElementById('requestAccessModal');
    if (modal) modal.style.display = 'flex';
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    const alertContainer = document.getElementById('forgotPasswordAlert');
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    alertContainer.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Enviando...</div>';

    try {
        const response = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        
        // Sempre mostre sucesso, mesmo que o e-mail não exista (por segurança)
        if (!response.ok) {
             const err = await response.json();
             console.error("Erro da API forgot-password:", err.error || err.message);
        }
        
        alertContainer.innerHTML = `<div class="alert alert-success">Se o e-mail estiver cadastrado, um link de recuperação foi enviado.</div>`;
        setTimeout(() => closeModal('forgotPasswordModal'), 3000);

    } catch (error) {
        console.error("Erro de rede ao recuperar senha:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Não foi possível enviar a solicitação. Verifique sua conexão.</div>`;
    } finally {
        button.disabled = false;
    }
}

async function handleRequestAccess(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('requestAccessAlert');
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    alertContainer.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Enviando...</div>';

    const nome = document.getElementById('requestNome').value;
    const email = document.getElementById('requestEmail').value;
    const motivo = document.getElementById('requestMotivo').value;

    try {
        const response = await fetch('/api/request-access', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ nome, email, motivo })
        });

        if (!response.ok) {
            let errorMsg = 'Falha ao enviar solicitação.';
            try {
                const result = await response.json();
                errorMsg = result.error || errorMsg;
            } catch (e) { /* Ignora erro de parse */ }
             throw new Error(errorMsg);
        }

        alertContainer.innerHTML = `<div class="alert alert-success">Solicitação enviada! O administrador avaliará seu pedido.</div>`;
        setTimeout(() => closeModal('requestAccessModal'), 3000);

    } catch (error) {
        console.error("Erro ao solicitar acesso:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao enviar: ${escapeHTML(error.message)}</div>`;
    } finally {
         button.disabled = false;
    }
}
