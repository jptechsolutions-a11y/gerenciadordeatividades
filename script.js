// ========================================
// 1. VARIÁVEIS GLOBAIS E ESTADO
// ========================================
let currentUser = null;
let currentOrg = null; // Organização/Time selecionado
let chartInstances = {}; // Cache para gráficos
let currentNoteId = null; // ID da nota ativa no editor

// ========================================
// 2. INICIALIZAÇÃO E AUTENTICAÇÃO (DA REFERÊNCIA)
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);

    // Bind de eventos dos modais
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('inviteForm')?.addEventListener('submit', handleInviteFormSubmit);
});

// (Funções handleLogin, redirectToDashboard, handleOrgSelection, logout, e supabaseRequest
// são adaptadas da sua referência `script.js` - `handleLogin`, `redirectToDashboard`, `handleFilialSelection`, `logout`, `supabaseRequest`)

async function handleLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.innerHTML;
    showError('');
    loginButton.disabled = true;
    loginButton.innerHTML = `<div class_alias="spinner"></div> CARREGANDO...`; // Corrigido class_alias para class

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        // 1. Autenticação (Reutilizando API da referência)
        const authResponse = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        }); //

        if (!authResponse.ok) throw new Error('Falha na autenticação. Verifique e-mail e senha.'); //

        const { user: authUser, session: authSession } = await authResponse.json(); //
        localStorage.setItem('auth_token', authSession.access_token); //

        await new Promise(resolve => setTimeout(resolve, 500)); // Delay da referência

        // 2. Buscar Perfil e Times (Organizações) do usuário
        // (Aqui adaptamos a lógica de 'filiais' para 'times/orgs')
        // Ajuste no endpoint para buscar dados da tabela correta 'usuarios' e relacionamento 'usuario_orgs'
        const endpoint = `usuarios?auth_user_id=eq.${authUser.id}&select=id,nome,email,usuario_orgs(org_id,organizacoes(id,nome))`;
        const profileResponse = await supabaseRequest(endpoint, 'GET'); //

        if (!profileResponse || !profileResponse[0]) {
            // Tentar novamente após um delay maior caso seja race condition
             console.warn("Perfil não encontrado na primeira tentativa (race condition?). Tentando novamente após 1.5s...");
             await new Promise(resolve => setTimeout(resolve, 1500));
             const profileResponseRetry = await supabaseRequest(endpoint, 'GET'); //
             if (!profileResponseRetry || !profileResponseRetry[0]) {
                 throw new Error('Perfil de usuário não encontrado ou RLS bloqueou o acesso, mesmo após nova tentativa.');
             }
             currentUser = profileResponseRetry[0];
             console.log("Sucesso na segunda tentativa!");
        } else {
             currentUser = profileResponse[0];
             console.log("Sucesso na primeira tentativa!");
        }


        const userOrgs = (currentUser.usuario_orgs || []).map(uo => uo.organizacoes).filter(Boolean); //
        currentUser.organizacoes = userOrgs; //
        delete currentUser.usuario_orgs; //

        localStorage.setItem('user', JSON.stringify(currentUser));
        redirectToDashboard(loginButton); // Passa o botão para ser resetado //

    } catch (error) {
        console.error("Erro detalhado no login:", error);
        showError(error.message); //
        loginButton.disabled = false;
        loginButton.innerHTML = originalButtonText;
    }
}


function redirectToDashboard(loginButton) {
    if (!currentUser || !currentUser.organizacoes) {
        showError("Erro fatal: Dados do usuário incompletos."); //
        logout(); //
        return;
    }

    const orgs = currentUser.organizacoes; //
    const orgSelectGroup = document.getElementById('orgSelectGroup'); //
    const orgSelect = document.getElementById('orgSelect'); //
    const loginForm = document.getElementById('loginForm'); //

    // Se não tiver time (pode usar solo) ou tiver 1 time, entra direto
    if (orgs.length === 0) {
        currentOrg = { id: null, nome: 'Espaço Pessoal' }; // Modo Solo - ID nulo para diferenciar
        showMainSystem(); //
    } else if (orgs.length === 1) {
        currentOrg = orgs[0]; //
        showMainSystem(); //
    }
    // Se tiver múltiplos times, mostra seletor
    else {
        orgSelect.innerHTML = orgs.map(o => `<option value="${o.id}">${escapeHTML(o.nome)}</option>`).join(''); //
        orgSelectGroup.style.display = 'block'; //
        orgSelect.focus(); //

        loginButton.disabled = false;
        loginButton.innerHTML = 'CONFIRMAR TIME'; //

        loginForm.removeEventListener('submit', handleLogin); //
        loginForm.addEventListener('submit', handleOrgSelection); //
    }
}

function handleOrgSelection(event) {
    event.preventDefault(); //
    const orgId = document.getElementById('orgSelect').value; //
    const org = currentUser.organizacoes.find(o => o.id == orgId); //

    if (org) {
        currentOrg = org; //

        // Reseta o form de login para o estado inicial
        document.getElementById('loginForm').removeEventListener('submit', handleOrgSelection); //
        document.getElementById('loginForm').addEventListener('submit', handleLogin); //
        document.getElementById('orgSelectGroup').style.display = 'none'; //
        document.querySelector('#loginForm button[type="submit"]').innerHTML = 'ENTRAR'; //

        showMainSystem(); //
    } else {
        showError("Erro: Time selecionado inválido."); //
    }
}

function showMainSystem() {
    document.getElementById('loginContainer').style.display = 'none'; //
    document.getElementById('mainSystem').style.display = 'flex'; //
    document.body.classList.add('system-active'); //

    document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário'; //
    document.getElementById('sidebarOrg').textContent = currentOrg.nome || 'N/A'; //

    // Ativa a primeira view (Dashboard)
    showView('dashboardView', document.querySelector('a[href="#dashboard"]')); //
    feather.replace(); //
}

function logout() {
    currentUser = null; //
    currentOrg = null; //
    localStorage.removeItem('user'); //
    localStorage.removeItem('auth_token'); //
    document.body.classList.remove('system-active'); //

    document.getElementById('mainSystem').style.display = 'none'; //
    document.getElementById('loginContainer').style.display = 'flex'; //

    // Reseta o form de login
    const loginForm = document.getElementById('loginForm'); //
    loginForm.reset(); //
    showError(''); //
    document.getElementById('orgSelectGroup').style.display = 'none'; //
    loginForm.removeEventListener('submit', handleOrgSelection); //
    loginForm.addEventListener('submit', handleLogin); //
    document.querySelector('#loginForm button[type="submit"]').innerHTML = 'ENTRAR'; //
}

// ========================================
// 3. NAVEGAÇÃO E UI (Adaptado da Referência)
// ========================================
function showView(viewId, element = null) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active')); //
    document.getElementById(viewId)?.classList.add('active'); //

    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active')); //
    element?.classList.add('active'); //

    // Carrega dados específicos da view
    try {
        switch (viewId) {
            case 'dashboardView': loadDashboardView(); break; //
            case 'projetosView': loadKanbanView(); break; //
            case 'calendarioView': loadCalendarView(); break; //
            case 'notasView': loadNotasView(); break; //
            case 'timeView': loadTimeView(); break; //
        }
    } catch(e) { console.error(`Erro ao carregar view ${viewId}:`, e); } //
    feather.replace(); //
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId); //
    if (modal) modal.style.display = 'none'; //
}

function showNotification(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer'); //
    // (Lógica de notificação idêntica à da referência `script.js`)
    if (!container) return; //
    const notification = document.createElement('div'); //
    notification.className = `notification ${type}`; //
    let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'x-circle' : 'info'); //
    notification.innerHTML = `
        <div class="notification-header">
            <i data-feather="${icon}" class="h-5 w-5 mr-2"></i>
            <span>${type === 'success' ? 'Sucesso!' : (type === 'error' ? 'Erro!' : 'Aviso')}</span>
        </div>
        <div class="notification-body">${escapeHTML(message)}</div>`; //
    container.appendChild(notification); //
    feather.replace(); //
    setTimeout(() => {
        notification.classList.add('hide'); //
        notification.addEventListener('animationend', () => notification.remove()); //
    }, timeout); //
}

// ========================================
// 4. LÓGICA DO DASHBOARD (Gráficos)
// ========================================
async function loadDashboardView() {
    // Busca dados reais para os cards
    try {
        const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : 'org_id=is.null'; // Filtra por time ou pessoal
        const { count: totalTasks } = await supabaseRequest(`tarefas?${orgFilter}&select=id`, 'GET', null, { 'Prefer': 'count=exact' }); //
        const { count: completedTasks } = await supabaseRequest(`tarefas?${orgFilter}&coluna_id=eq.${/*ID_DA_COLUNA_DONE*/'uuid-da-coluna-done'}&updated_at=gte.${new Date(new Date().setDate(1)).toISOString()}&select=id`, 'GET', null, { 'Prefer': 'count=exact' }); // // Precisa do ID da coluna 'Concluído'
        const today = new Date().toISOString().split('T')[0];
        const { count: dueTasks } = await supabaseRequest(`tarefas?${orgFilter}&data_entrega=eq.${today}&select=id`, 'GET', null, { 'Prefer': 'count=exact' }); //

        document.getElementById('dashTotalTasks').textContent = totalTasks || 0; //
        document.getElementById('dashCompletedTasks').textContent = completedTasks || 0; //
        document.getElementById('dashDueTasks').textContent = dueTasks || 0; //
    } catch (error) {
        console.error("Erro ao carregar stats do dashboard:", error);
        showNotification("Erro ao carregar estatísticas.", "error"); //
    }

    renderStatusChart(); //
    renderGanttChart(); //
}

async function renderStatusChart() {
    const ctx = document.getElementById('statusChart').getContext('2d'); //
    if (chartInstances.statusChart) chartInstances.statusChart.destroy(); //

    try {
        const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : 'org_id=is.null'; //
        // Buscar contagem por coluna (status). Assume que você tem os IDs das colunas
        // Substitua 'uuid-col-todo', 'uuid-col-doing', 'uuid-col-done' pelos IDs reais
        const { count: todoCount } = await supabaseRequest(`tarefas?${orgFilter}&coluna_id=eq.${'uuid-col-todo'}&select=id`, 'GET', null, { 'Prefer': 'count=exact' }); //
        const { count: doingCount } = await supabaseRequest(`tarefas?${orgFilter}&coluna_id=eq.${'uuid-col-doing'}&select=id`, 'GET', null, { 'Prefer': 'count=exact' }); //
        const { count: doneCount } = await supabaseRequest(`tarefas?${orgFilter}&coluna_id=eq.${'uuid-col-done'}&select=id`, 'GET', null, { 'Prefer': 'count=exact' }); //

        chartInstances.statusChart = new Chart(ctx, { //
            type: 'doughnut', //
            data: { //
                labels: ['A Fazer', 'Em Andamento', 'Concluído'], //
                datasets: [{ //
                    label: 'Tarefas por Status', //
                    data: [todoCount || 0, doingCount || 0, doneCount || 0], //
                    backgroundColor: ['#0077B6', '#F77F00', '#00D4AA'], // Cores da referência
                }]
            },
            options: { responsive: true, maintainAspectRatio: false } //
        });
    } catch (error) {
        console.error("Erro ao renderizar gráfico de status:", error);
        showNotification("Erro ao carregar gráfico de status.", "error"); //
    }
}


async function renderGanttChart() {
    const ctx = document.getElementById('ganttChart').getContext('2d'); //
    if (chartInstances.ganttChart) chartInstances.ganttChart.destroy(); //

    try {
        const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : 'org_id=is.null'; //
        // Buscar tarefas com data de início (created_at) e data de entrega
        const tasks = await supabaseRequest(`tarefas?${orgFilter}&select=id,titulo,created_at,data_entrega&data_entrega=not.is.null&order=data_entrega.asc&limit=10`, 'GET'); //

        const ganttData = tasks.map((task, index) => ({ //
             label: task.titulo, //
             data: [{ x: [task.created_at, task.data_entrega], y: task.titulo }], //
             // Alternar cores para melhor visualização
             backgroundColor: index % 2 === 0 ? 'rgba(0, 212, 170, 0.7)' : 'rgba(0, 180, 216, 0.7)', //
             borderColor: index % 2 === 0 ? 'rgba(0, 212, 170, 1)' : 'rgba(0, 180, 216, 1)', //
             barPercentage: 0.5 //
        }));

        const minDate = tasks.length > 0 ? tasks[0].created_at : new Date().toISOString(); //
        const maxDate = tasks.length > 0 ? tasks[tasks.length - 1].data_entrega : new Date().toISOString(); //

        chartInstances.ganttChart = new Chart(ctx, { //
            type: 'bar', //
            data: { datasets: ganttData }, //
            options: { //
                indexAxis: 'y', //
                responsive: true, //
                maintainAspectRatio: false, //
                scales: { //
                    x: { //
                        type: 'time', //
                        time: { unit: 'day', tooltipFormat: 'dd/MM/yy' }, //
                        min: minDate, //
                        max: maxDate //
                    },
                    y: { //
                         display: true // Mostrar os títulos das tarefas no eixo Y
                    }
                },
                plugins: { //
                    legend: { display: false } //
                }
            }
        });
    } catch (error) {
         console.error("Erro ao renderizar gráfico Gantt:", error);
         showNotification("Erro ao carregar gráfico Gantt.", "error"); //
    }
}

// ========================================
// 5. LÓGICA DO KANBAN (Projetos)
// ========================================
let draggedTask = null; // Guarda o elemento sendo arrastado //

async function loadKanbanView() {
    const kanbanBoard = document.getElementById('kanbanBoard'); //
    kanbanBoard.innerHTML = '<div class="loading col-span-3"><div class="spinner"></div> Carregando quadro...</div>'; //

    try {
        const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : 'org_id=is.null'; //
        // 1. Buscar colunas do projeto (simplificado, assume 1 projeto por org/user)
        // Você precisará adaptar para múltiplos projetos se necessário
        const colunas = await supabaseRequest(`colunas_kanban?${orgFilter.replace('org_id','projeto_id')}&select=id,nome,ordem&order=ordem.asc`, 'GET'); // // Mocked endpoint
        if (!colunas || colunas.length === 0) {
             // Criar colunas padrão se não existirem (ex: 'todo', 'doing', 'done')
             // Por simplificação, vamos assumir que elas existem ou logar um erro
             console.error("Nenhuma coluna Kanban encontrada para esta organização/usuário.");
             kanbanBoard.innerHTML = '<div class="alert alert-error col-span-3">Erro: Nenhuma coluna Kanban configurada.</div>'; //
             return;
        }

        // 2. Buscar tarefas
        const tasks = await supabaseRequest(`tarefas?${orgFilter}&select=id,titulo,descricao,prioridade,data_entrega,coluna_id,ordem_na_coluna&order=ordem_na_coluna.asc`, 'GET'); //

        // 3. Renderizar colunas e cards
        kanbanBoard.innerHTML = ''; // Limpar o loading
        colunas.forEach(coluna => { //
            const columnEl = document.createElement('div'); //
            columnEl.className = 'kanban-column'; //
            columnEl.id = `col-${coluna.id}`; //
            columnEl.dataset.colunaId = coluna.id; //

            const columnContentEl = document.createElement('div'); //
            columnContentEl.className = 'kanban-column-content'; //
            columnContentEl.ondragover = handleDragOver; //
            columnContentEl.ondrop = (e) => handleDrop(e, coluna.id); // Passa o ID da coluna //

            columnEl.innerHTML = `<h3 class="kanban-column-title">${escapeHTML(coluna.nome)}</h3>`; //
            columnEl.appendChild(columnContentEl); //

            // Adicionar tasks à coluna
            tasks.filter(t => t.coluna_id === coluna.id).forEach(task => { //
                const card = createTaskCard(task); //
                columnContentEl.appendChild(card); //
            });

            kanbanBoard.appendChild(columnEl); //
        });

        feather.replace(); //

    } catch (error) {
        console.error("Erro ao carregar quadro Kanban:", error);
        kanbanBoard.innerHTML = `<div class="alert alert-error col-span-3">Erro ao carregar quadro: ${escapeHTML(error.message)}</div>`; //
    }
}

function createTaskCard(task) {
    const card = document.createElement('div'); //
    card.id = `task-${task.id}`; //
    card.className = 'kanban-card'; //
    card.draggable = true; //
    card.dataset.taskId = task.id; //
    card.dataset.colunaId = task.coluna_id; // Guardar coluna atual //

    // Adiciona classe de prioridade para estilização
    card.classList.add(`priority-${task.prioridade}`); //

    // Data (se existir)
    const dateHtml = task.data_entrega ? `
        <span class="kanban-card-date">
            <i data-feather="calendar" class="h-4 w-4 inline-block -mt-1"></i>
            ${new Date(task.data_entrega).toLocaleDateString('pt-BR')}
        </span>` : ''; //

    card.innerHTML = `
        <div class="kanban-card-title">${escapeHTML(task.titulo)}</div>
        <div class="kanban-card-footer">
            ${dateHtml}
            <span class="kanban-card-priority priority-${task.prioridade}">${escapeHTML(task.prioridade)}</span>
        </div>
    `; //

    // Event Listeners
    card.addEventListener('dragstart', handleDragStart); //
    card.addEventListener('click', () => openTaskModal(task)); // Abre modal para edição //

    return card; //
}


// --- Funções de Drag & Drop ---
function handleDragStart(e) {
    draggedTask = e.target; //
    e.dataTransfer.effectAllowed = 'move'; //
    setTimeout(() => e.target.classList.add('dragging'), 0); // Adiciona classe 'dragging' //
}

function handleDragOver(e) {
    e.preventDefault(); //
    e.dataTransfer.dropEffect = 'move'; //
    const columnContent = e.target.closest('.kanban-column-content'); //
    if (columnContent) { //
        columnContent.classList.add('drag-over'); //
    }
}

// Remove o highlight
document.querySelectorAll('.kanban-column-content').forEach(col => {
    col.addEventListener('dragleave', (e) => col.classList.remove('drag-over')); //
    col.addEventListener('drop', (e) => col.classList.remove('drag-over')); //
});


async function handleDrop(e, newColunaId) {
    e.preventDefault(); //
    if (draggedTask) { //
        const taskId = draggedTask.dataset.taskId; //
        const oldColunaId = draggedTask.dataset.colunaId; //

        if (oldColunaId !== newColunaId) { //
            console.log(`Movendo task #${taskId} da coluna ${oldColunaId} para ${newColunaId}`); //

            // 1. (Otimista) Mover o card na UI
            e.target.closest('.kanban-column-content').appendChild(draggedTask); //
            draggedTask.dataset.colunaId = newColunaId; //

            // 2. (Real) Atualizar no Supabase
            try {
                // *** DESCOMENTADO ***
                await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', { coluna_id: newColunaId }); //
                showNotification(`Tarefa #${taskId} movida.`, 'success'); //
            } catch (error) {
                // Reverter UI em caso de erro
                console.error("Falha ao atualizar task:", error); //
                document.getElementById(`col-${oldColunaId}`).querySelector('.kanban-column-content').appendChild(draggedTask); //
                draggedTask.dataset.colunaId = oldColunaId; //
                showNotification('Falha ao mover tarefa.', 'error'); //
            }
        }
        draggedTask.classList.remove('dragging'); //
        draggedTask = null; //
    }
}


// ========================================
// 6. LÓGICA DO MODAL DE TAREFAS
// ========================================
function openTaskModal(task = null, defaultColunaId = null) {
    const modal = document.getElementById('taskModal'); //
    const form = document.getElementById('taskForm'); //
    form.reset(); //
    document.getElementById('taskAlert').innerHTML = ''; //

    if (task) {
        // Modo Edição
        document.getElementById('taskModalTitle').textContent = 'Editar Tarefa'; //
        document.getElementById('taskId').value = task.id; //
        document.getElementById('taskTitle').value = task.titulo; //
        document.getElementById('taskDescription').value = task.descricao || ''; //
        document.getElementById('taskDueDate').value = task.data_entrega || ''; //
        document.getElementById('taskPriority').value = task.prioridade || 'media'; //
        // Guardar a coluna atual em um hidden input (se necessário para lógica posterior)
        // document.getElementById('taskColunaId').value = task.coluna_id;
    } else {
        // Modo Criação
        document.getElementById('taskModalTitle').textContent = 'Nova Tarefa'; //
        document.getElementById('taskId').value = ''; //
        // Se abriu clicando no botão '+' de uma coluna específica
        if (defaultColunaId) {
             document.getElementById('taskColunaId').value = defaultColunaId; // Assumindo que você adicione um input hidden taskColunaId
        } else {
            // Pegar o ID da primeira coluna como padrão
            const firstColumn = document.querySelector('.kanban-column'); //
            if (firstColumn) {
                 document.getElementById('taskColunaId').value = firstColumn.dataset.colunaId; //
            }
        }
    }
    modal.style.display = 'flex'; //
}

async function handleTaskFormSubmit(e) {
    e.preventDefault(); //
    const alert = document.getElementById('taskAlert'); //
    alert.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>'; //

    const taskId = document.getElementById('taskId').value; //
    const taskData = { //
        titulo: document.getElementById('taskTitle').value, //
        descricao: document.getElementById('taskDescription').value, //
        data_entrega: document.getElementById('taskDueDate').value || null, //
        prioridade: document.getElementById('taskPriority').value, //
        // org_id deve ser pego de currentOrg.id //
        org_id: currentOrg?.id || null, //
        // created_by ou user_id pego de currentUser.id //
        // projeto_id precisa ser definido (pegar do contexto atual ou selecionar)
        projeto_id: 'uuid-do-projeto-atual', // Substituir pelo ID do projeto ativo
        // coluna_id pego do form (se for criação) ou do estado (se for edição sem mover)
        coluna_id: document.getElementById('taskColunaId').value // Assumindo input hidden
    };

    try {
        if (taskId) {
            // Edição
             // *** DESCOMENTADO ***
            await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', taskData); //
        } else {
            // Criação
             // Adicionar user_id na criação
             taskData.created_by = currentUser.id; //
              // *** DESCOMENTADO ***
            await supabaseRequest('tarefas', 'POST', taskData); //
        }

        showNotification(`Tarefa ${taskId ? 'atualizada' : 'criada'}!`, 'success'); //
        closeModal('taskModal'); //
        loadKanbanView(); // Recarrega o quadro //

    } catch (error) {
        console.error("Erro ao salvar tarefa:", error); //
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`; //
    }
}


// ========================================
// 7. LÓGICA DO TIME (Convites)
// ========================================
async function loadTimeView() {
    const teamBody = document.getElementById('teamTableBody'); //
    teamBody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Carregando membros...</td></tr>'; //

    try {
        const orgId = currentOrg?.id; //
        if (!orgId) { // Não carrega time se for espaço pessoal
             teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Funcionalidade de time não disponível no Espaço Pessoal.</td></tr>'; //
             document.querySelector('#timeView button.btn-success').style.display = 'none'; // Esconder botão de convite //
             return;
        } else {
             document.querySelector('#timeView button.btn-success').style.display = 'inline-flex'; // Mostrar botão de convite //
        }

        const members = await supabaseRequest(`usuario_orgs?org_id=eq.${orgId}&select=role,joined_at,usuarios(id,nome,email,ativo)`, 'GET'); //

        if (!members || members.length === 0) {
            teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum membro encontrado neste time.</td></tr>'; //
            return;
        }

        teamBody.innerHTML = members.map(m => { //
            const user = m.usuarios; //
            const statusClass = user.ativo ? 'status-finalizada' : 'status-negada'; //
            const statusText = user.ativo ? 'Ativo' : 'Inativo'; //
            return `
                <tr>
                    <td>${escapeHTML(user.nome)}</td>
                    <td>${escapeHTML(user.email)}</td>
                    <td>${escapeHTML(m.role)}</td>
                    <td><span class="status-badge ${statusClass}">${escapeHTML(statusText)}</span></td>
                    <td>
                        ${m.role !== 'admin' ? '<button class="btn btn-danger btn-small" onclick="removeMember(\''+user.id+'\')">Remover</button>' : '-'}
                    </td>
                </tr>
            `; //
        }).join(''); //
        feather.replace(); //

    } catch (error) {
        console.error("Erro ao carregar membros do time:", error); //
        teamBody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar membros: ${escapeHTML(error.message)}</td></tr>`; //
    }
}

function openInviteModal() {
    document.getElementById('inviteForm').reset(); //
    document.getElementById('inviteAlert').innerHTML = ''; //
    document.getElementById('inviteModal').style.display = 'flex'; //
}

async function handleInviteFormSubmit(e) {
    e.preventDefault(); //
    const alert = document.getElementById('inviteAlert'); //
    alert.innerHTML = '<div class="loading"><div class="spinner"></div>Enviando convite...</div>'; //

    const email = document.getElementById('inviteEmail').value; //
    const role = document.getElementById('inviteRole').value; //

    try {
        // Chamada à API que cuidará da lógica de convite
        const response = await fetch('/api/invite', { //
            method: 'POST', //
            headers: { //
                'Content-Type': 'application/json', //
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}` //
            },
            body: JSON.stringify({ //
                email: email, //
                role: role, //
                org_id: currentOrg.id, //
                org_name: currentOrg.nome //
            })
        });

        if (!response.ok) { //
             const errorData = await response.json(); //
             throw new Error(errorData.error || errorData.message || 'Falha ao enviar convite'); //
        }


        showNotification(`Convite enviado para ${email}!`, 'success'); //
        closeModal('inviteModal'); //
        loadTimeView(); // Recarrega a lista do time //

    } catch (error) {
        console.error("Erro ao convidar:", error); //
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`; //
    }
}

async function removeMember(userIdToRemove) {
     if (!confirm(`Tem certeza que deseja remover este membro do time?`)) return; //

     try {
         await supabaseRequest(`usuario_orgs?usuario_id=eq.${userIdToRemove}&org_id=eq.${currentOrg.id}`, 'DELETE'); //
         showNotification("Membro removido com sucesso.", "success"); //
         loadTimeView(); //
     } catch (error) {
         console.error("Erro ao remover membro:", error); //
         showNotification(`Erro ao remover membro: ${error.message}`, "error"); //
     }
}


// ========================================
// 8. LÓGICA DO BLOCO DE NOTAS
// ========================================
async function loadNotasView() {
    const list = document.getElementById('noteList'); //
    list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>
                      <div class="loading"><div class="spinner"></div> Carregando notas...</div>`; //

    try {
        const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : 'org_id=is.null'; //
        // Buscar apenas título e ID para a lista, ordenado por atualização
        const notes = await supabaseRequest(`notas?${orgFilter}&user_id=eq.${currentUser.id}&select=id,titulo,updated_at&order=updated_at.desc`, 'GET'); //

        list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>`; // // Limpa o loading

        if (!notes || notes.length === 0) {
            list.innerHTML += '<p class="text-center text-sm text-gray-500">Nenhuma nota encontrada.</p>'; //
            createNewNote(); // Abre editor vazio
            return;
        }

        notes.forEach(note => { //
            const item = document.createElement('div'); //
            item.className = 'note-list-item'; //
            item.dataset.noteId = note.id; //
            item.innerHTML = `
                <div class="note-list-title">${escapeHTML(note.titulo) || 'Nota sem título'}</div>
                <div class="note-list-excerpt">Atualizado: ${new Date(note.updated_at).toLocaleDateString()}</div>
            `; //
            item.addEventListener('click', () => openNote(note.id)); //
            list.appendChild(item); //
        });

        // Abre a nota mais recente por padrão
        openNote(notes[0].id); //

    } catch (error) {
        console.error("Erro ao carregar notas:", error); //
        list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>
                          <div class="alert alert-error">Erro ao carregar notas.</div>`; //
        createNewNote(); // Abre editor vazio mesmo com erro
    }
}


function createNewNote() {
    // Limpa o editor para uma nova nota
    currentNoteId = null; //
    document.getElementById('noteTitle').value = ''; //
    document.getElementById('noteBody').value = ''; //
    document.getElementById('noteTitle').focus(); //

    // Remove seleção da lista
    document.querySelectorAll('.note-list-item.active').forEach(item => item.classList.remove('active')); //
}

async function openNote(noteId) {
    if (noteId === null) { //
        createNewNote(); //
        return; //
    }

    // Marca como ativo na lista imediatamente
    document.querySelectorAll('.note-list-item').forEach(item => { //
        item.classList.toggle('active', item.dataset.noteId == noteId); //
    });

    // Mostra loading no editor
    document.getElementById('noteTitle').value = 'Carregando...'; //
    document.getElementById('noteBody').value = ''; //
    currentNoteId = noteId; //

    try {
        // Busca a nota completa pelo ID
        const note = await supabaseRequest(`notas?id=eq.${noteId}&select=titulo,conteudo`, 'GET'); //
        if (!note || note.length === 0) throw new Error("Nota não encontrada."); //

        document.getElementById('noteTitle').value = note[0].titulo || ''; //
        document.getElementById('noteBody').value = note[0].conteudo || ''; //

    } catch (error) {
         console.error(`Erro ao abrir nota ${noteId}:`, error); //
         showNotification("Erro ao carregar conteúdo da nota.", "error"); //
         // Limpa o editor em caso de erro
         document.getElementById('noteTitle').value = 'Erro ao carregar'; //
         document.getElementById('noteBody').value = ''; //
         currentNoteId = null; //
    }
}


async function saveNote() {
    const title = document.getElementById('noteTitle').value; //
    const body = document.getElementById('noteBody').value; //

    const noteData = { //
        titulo: title || 'Nota sem título', // Define um título padrão se vazio //
        conteudo: body, //
        org_id: currentOrg?.id || null, //
        user_id: currentUser.id //
    };

    // Mostra um feedback de salvamento (ex: spinner no botão)
    const saveButton = document.querySelector('.note-editor .btn-success'); //
    const originalButtonText = saveButton.innerHTML; //
    saveButton.disabled = true; //
    saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...'; //


    try {
        let savedNote;
        if (currentNoteId) { //
            // Update
             // *** DESCOMENTADO ***
            savedNote = await supabaseRequest(`notas?id=eq.${currentNoteId}`, 'PATCH', noteData); //
        } else {
            // Create
             // *** DESCOMENTADO ***
            savedNote = await supabaseRequest('notas', 'POST', noteData); //
            if (savedNote && savedNote[0]) { //
                 currentNoteId = savedNote[0].id; // Pega o ID da nova nota //
            }
        }
        showNotification('Nota salva!', 'success'); //
        loadNotasView(); // Recarrega a lista (para mostrar novo título/excerto) //

    } catch (error) {
        console.error("Erro ao salvar nota:", error); //
        showNotification('Falha ao salvar nota.', 'error'); //
    } finally {
        // Restaura o botão
        saveButton.disabled = false; //
        saveButton.innerHTML = originalButtonText; //
    }
}


// ========================================
// 9. LÓGICA DO CALENDÁRIO
// ========================================
function loadCalendarView() {
    // Implementação básica - apenas mostra tarefas com data
    const container = document.getElementById('calendarContainer'); //
    container.innerHTML = `<div class="loading"><div class="spinner"></div> Carregando tarefas...</div>`; //

    // Simulação - Buscar tarefas com data_entrega
    setTimeout(() => { // Simula busca no DB
        const tasksWithDate = [
            { id: 1, titulo: 'Tela de login', data_entrega: '2025-10-30' },
            { id: 2, titulo: 'Modelar BD', data_entrega: '2025-10-28' },
        ];

        if (tasksWithDate.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma tarefa com data de entrega definida.</p>'; //
            return;
        }

        container.innerHTML = `
            <h4 class="text-lg font-semibold mb-3">Próximas Entregas:</h4>
            <ul class="list-disc list-inside space-y-2">
                ${tasksWithDate.map(t => `<li>${escapeHTML(t.titulo)} - ${new Date(t.data_entrega).toLocaleDateString('pt-BR')}</li>`).join('')}
            </ul>
        `; //
    }, 500); // Simula delay
}


// ========================================
// 10. UTILITÁRIOS (DA REFERÊNCIA)
// ========================================
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token'); //
    if (!authToken) { //
        console.error("Token JWT não encontrado"); //
        logout(); //
        throw new Error("Sessão expirada."); //
    }

    // Usa a constante SUPABASE_PROXY_URL definida no HTML
    const url = `${SUPABASE_PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`; //

    const config = { //
        method: method, //
        headers: { //
            'Content-Type': 'application/json', //
            'Authorization': `Bearer ${authToken}`, //
            'Prefer': 'return=representation', //
            ...headers // Adiciona headers customizados (como 'count=exact') //
        }
    };

    if (body && (method === 'POST' || method === 'PATCH')) { //
        config.body = JSON.stringify(body); //
    }

    try {
        const response = await fetch(url, config); //
        if (!response.ok) { //
             // Tenta parsear o erro do Supabase
             let errorData = { message: `Erro ${response.status}: ${response.statusText}` }; //
             try {
                  errorData = await response.json(); //
             } catch(e) { /* Ignora erro de parse */ } //
            console.error("Erro Supabase:", errorData); //
            throw new Error(errorData.message || errorData.error || `Erro na requisição Supabase (${response.status})`); //
        }
        // Tratamento para DELETE ou respostas sem corpo
        if (response.status === 204 || response.headers.get('content-length') === '0' ) return null; //

        return await response.json(); //
    } catch (error) {
        console.error("Erro em supabaseRequest:", error); //
        // Se for erro de autorização, deslogar
        if (error.message.includes("401") || error.message.includes("Unauthorized") || error.message.includes("expired")) { //
             logout(); //
        }
        throw error; //
    }
}


function escapeHTML(str) {
    if (str === null || str === undefined) return ''; //
    return String(str) //
         .replace(/&/g, '&amp;') //
         .replace(/</g, '&lt;') //
         .replace(/>/g, '&gt;') //
         .replace(/"/g, '&quot;') //
         .replace(/'/g, '&#39;'); //
}

// ========================================
// 11. FUNÇÃO DE ERRO (ADICIONADA)
// ========================================
function showError(message) {
    const alertContainer = document.getElementById('loginAlert'); //

    if (!message) { //
        if (alertContainer) alertContainer.innerHTML = ''; //
        return; //
    }

    console.error("Erro exibido ao usuário:", message); //

    if (alertContainer) { //
        // Usa escapeHTML para segurança
        alertContainer.innerHTML = `<div class="alert alert-error">${escapeHTML(message)}</div>`; //
    }
}
