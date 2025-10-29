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
    loginButton.innerHTML = `<div class_alias="spinner"></div> CARREGANDO...`;

    const email = document.getElementById('email').value.trim(); 
    const password = document.getElementById('password').value;
    
    try {
        // 1. Autenticação (Reutilizando API da referência)
        const authResponse = await fetch('/api/login', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!authResponse.ok) throw new Error('Falha na autenticação. Verifique e-mail e senha.');

        const { user: authUser, session: authSession } = await authResponse.json();
        localStorage.setItem('auth_token', authSession.access_token);
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay da referência
        
        // 2. Buscar Perfil e Times (Organizações) do usuário
        // (Aqui adaptamos a lógica de 'filiais' para 'times/orgs')
        const endpoint = `usuarios?auth_user_id=eq.${authUser.id}&select=id,nome,email,usuario_orgs(org_id,organizacoes(id,nome))`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || !profileResponse[0]) {
            throw new Error('Perfil de usuário não encontrado ou RLS bloqueou o acesso.');
        }
        
        currentUser = profileResponse[0];
        const userOrgs = (currentUser.usuario_orgs || []).map(uo => uo.organizacoes).filter(Boolean);
        currentUser.organizacoes = userOrgs;
        delete currentUser.usuario_orgs;
        
        localStorage.setItem('user', JSON.stringify(currentUser)); 
        redirectToDashboard(loginButton); // Passa o botão para ser resetado

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
        currentOrg = { id: 'solo', nome: 'Espaço Pessoal' }; // Modo Solo
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
        
        // Reseta o form de login para o estado inicial
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
    document.body.classList.add('system-active'); // Ativa o fundo claro

    document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário';
    document.getElementById('sidebarOrg').textContent = currentOrg.nome || 'N/A';

    // Ativa a primeira view (Dashboard)
    showView('dashboardView', document.querySelector('a[href="#dashboard"]'));
    feather.replace();
}

function logout() {
    currentUser = null;
    currentOrg = null;
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    document.body.classList.remove('system-active');
    
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    
    // Reseta o form de login
    const loginForm = document.getElementById('loginForm');
    loginForm.reset();
    showError('');
    document.getElementById('orgSelectGroup').style.display = 'none';
    loginForm.removeEventListener('submit', handleOrgSelection);
    loginForm.addEventListener('submit', handleLogin);
    document.querySelector('#loginForm button[type="submit"]').innerHTML = 'ENTRAR';
}

// ========================================
// 3. NAVEGAÇÃO E UI (Adaptado da Referência)
// ========================================
function showView(viewId, element = null) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');

    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
    element?.classList.add('active');

    // Carrega dados específicos da view
    try {
        switch (viewId) {
            case 'dashboardView': loadDashboardView(); break;
            case 'projetosView': loadKanbanView(); break;
            case 'calendarioView': loadCalendarView(); break;
            case 'notasView': loadNotasView(); break;
            case 'timeView': loadTimeView(); break;
        }
    } catch(e) { console.error(`Erro ao carregar view ${viewId}:`, e); }
    feather.replace();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showNotification(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer');
    // (Lógica de notificação idêntica à da referência `script.js`)
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'x-circle' : 'info');
    notification.innerHTML = `
        <div class_alias="notification-header">
            <i data-feather="${icon}" class="h-5 w-5 mr-2"></i>
            <span>${type === 'success' ? 'Sucesso!' : (type === 'error' ? 'Erro!' : 'Aviso')}</span>
        </div>
        <div class_alias="notification-body">${escapeHTML(message)}</div>`;
    container.appendChild(notification);
    feather.replace();
    setTimeout(() => {
        notification.classList.add('hide');
        notification.addEventListener('animationend', () => notification.remove());
    }, timeout);
}

// ========================================
// 4. LÓGICA DO DASHBOARD (Gráficos)
// ========================================
function loadDashboardView() {
    // (Simulação de dados)
    document.getElementById('dashTotalTasks').textContent = '42';
    document.getElementById('dashCompletedTasks').textContent = '12';
    document.getElementById('dashDueTasks').textContent = '3';
    
    renderStatusChart();
    renderGanttChart();
}

function renderStatusChart() {
    const ctx = document.getElementById('statusChart').getContext('2d');
    if (chartInstances.statusChart) chartInstances.statusChart.destroy();
    
    chartInstances.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['A Fazer', 'Em Andamento', 'Concluído'],
            datasets: [{
                label: 'Tarefas por Status',
                data: [20, 15, 7], // Dados de exemplo
                backgroundColor: ['#0077B6', '#F77F00', '#00D4AA'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderGanttChart() {
    const ctx = document.getElementById('ganttChart').getContext('2d');
    if (chartInstances.ganttChart) chartInstances.ganttChart.destroy();

    // Simulação de cronograma (Gantt)
    const data = {
        datasets: [{
            label: 'Projeto Alpha',
            data: [{ x: ['2025-10-01', '2025-10-15'], y: 'Fase 1: Design' }],
            backgroundColor: 'rgba(0, 212, 170, 0.7)',
            borderColor: 'rgba(0, 212, 170, 1)',
            barPercentage: 0.5
        }, {
            label: 'Projeto Beta',
            data: [{ x: ['2025-10-10', '2025-10-30'], y: 'Fase 2: Dev' }],
            backgroundColor: 'rgba(0, 180, 216, 0.7)',
            borderColor: 'rgba(0, 180, 216, 1)',
            barPercentage: 0.5
        }, {
            label: 'Projeto Gamma',
            data: [{ x: ['2025-10-25', '2025-11-05'], y: 'Fase 3: Testes' }],
            backgroundColor: 'rgba(0, 119, 182, 0.7)',
            borderColor: 'rgba(0, 119, 182, 1)',
            barPercentage: 0.5
        }]
    };

    chartInstances.ganttChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            indexAxis: 'y', // Isso transforma em Gantt
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', tooltipFormat: 'dd/MM/yy' },
                    min: '2025-10-01',
                    max: '2025-11-10'
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// ========================================
// 5. LÓGICA DO KANBAN (Projetos)
// ========================================
let draggedTask = null; // Guarda o elemento sendo arrastado

async function loadKanbanView() {
    // (Idealmente, buscaria do Supabase. Por ora, usamos dados locais)
    const tasks = [
        { id: 1, title: 'Desenvolver tela de login', status: 'doing', priority: 'alta', dueDate: '2025-10-30' },
        { id: 2, title: 'Modelar banco de dados', status: 'todo', priority: 'urgente', dueDate: '2025-10-28' },
        { id: 3, title: 'Configurar API de e-mail', status: 'todo', priority: 'media', dueDate: '2025-11-01' },
        { id: 4, title: 'Testar fluxo de pagamento', status: 'done', priority: 'alta', dueDate: '2025-10-25' },
    ];
    
    // Limpa os quadros
    document.querySelectorAll('.kanban-column-content').forEach(col => col.innerHTML = '');
    
    // Renderiza os cards
    tasks.forEach(task => {
        const card = createTaskCard(task);
        document.getElementById(`col-${task.status}`).querySelector('.kanban-column-content').appendChild(card);
    });
    feather.replace();
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.id = `task-${task.id}`;
    card.className = 'kanban-card';
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.status = task.status;
    
    // Adiciona prioridade na borda
    card.classList.add(`priority-${task.priority}`);
    
    // Data (se existir)
    const dateHtml = task.dueDate ? `
        <span class="kanban-card-date">
            <i data-feather="calendar" class="h-4 w-4 inline-block -mt-1"></i>
            ${new Date(task.dueDate).toLocaleDateString('pt-BR')}
        </span>` : '';
        
    card.innerHTML = `
        <div class="kanban-card-title">${escapeHTML(task.title)}</div>
        <div class="kanban-card-footer">
            ${dateHtml}
            <span class="kanban-card-priority priority-${task.priority}">${escapeHTML(task.priority)}</span>
        </div>
    `;
    
    // Event Listeners
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('click', () => openTaskModal(task));
    
    return card;
}

// --- Funções de Drag & Drop ---
function handleDragStart(e) {
    draggedTask = e.target;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0); // Adiciona classe 'dragging'
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const columnContent = e.target.closest('.kanban-column-content');
    if (columnContent) {
        columnContent.classList.add('drag-over');
    }
}

// Remove o highlight
document.querySelectorAll('.kanban-column-content').forEach(col => {
    col.addEventListener('dragleave', (e) => col.classList.remove('drag-over'));
    col.addEventListener('drop', (e) => col.classList.remove('drag-over'));
});


async function handleDrop(e, newStatus) {
    e.preventDefault();
    if (draggedTask) {
        const taskId = draggedTask.dataset.taskId;
        const oldStatus = draggedTask.dataset.status;
        
        if (oldStatus !== newStatus) {
            console.log(`Movendo task #${taskId} de ${oldStatus} para ${newStatus}`);
            
            // 1. (Otimista) Mover o card na UI
            e.target.closest('.kanban-column-content').appendChild(draggedTask);
            draggedTask.dataset.status = newStatus;
            
            // 2. (Real) Atualizar no Supabase
            try {
                // (Aqui iria a chamada `supabaseRequest` real)
                // await supabaseRequest(`tasks?id=eq.${taskId}`, 'PATCH', { status: newStatus });
                showNotification(`Tarefa #${taskId} movida para ${newStatus}.`, 'success');
            } catch (error) {
                // Reverter UI em caso de erro
                console.error("Falha ao atualizar task:", error);
                document.getElementById(`col-${oldStatus}`).querySelector('.kanban-column-content').appendChild(draggedTask);
                draggedTask.dataset.status = oldStatus;
                showNotification('Falha ao mover tarefa.', 'error');
            }
        }
        draggedTask.classList.remove('dragging');
        draggedTask = null;
    }
}

// ========================================
// 6. LÓGICA DO MODAL DE TAREFAS
// ========================================
function openTaskModal(task = null, defaultStatus = 'todo') {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    form.reset();
    document.getElementById('taskAlert').innerHTML = '';
    
    if (task) {
        // Modo Edição
        document.getElementById('taskModalTitle').textContent = 'Editar Tarefa';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskDueDate').value = task.dueDate || '';
        document.getElementById('taskPriority').value = task.priority || 'media';
        document.getElementById('taskStatus').value = task.status;
    } else {
        // Modo Criação
        document.getElementById('taskModalTitle').textContent = 'Nova Tarefa';
        document.getElementById('taskId').value = '';
        document.getElementById('taskStatus').value = defaultStatus; // Status da coluna onde foi clicado
    }
    modal.style.display = 'flex';
}

async function handleTaskFormSubmit(e) {
    e.preventDefault();
    const alert = document.getElementById('taskAlert');
    alert.innerHTML = '<div class_alias="loading"><div class_alias="spinner"></div>Salvando...</div>';
    
    const taskId = document.getElementById('taskId').value;
    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        due_date: document.getElementById('taskDueDate').value || null,
        priority: document.getElementById('taskPriority').value,
        status: document.getElementById('taskStatus').value,
        org_id: currentOrg.id, // Vincula à organização
        user_id: currentUser.id // Vincula ao criador
    };

    try {
        if (taskId) {
            // Edição
            // await supabaseRequest(`tasks?id=eq.${taskId}`, 'PATCH', taskData);
        } else {
            // Criação
            // await supabaseRequest('tasks', 'POST', taskData);
        }
        
        showNotification(`Tarefa ${taskId ? 'atualizada' : 'criada'}!`, 'success');
        closeModal('taskModal');
        loadKanbanView(); // Recarrega o quadro
        
    } catch (error) {
        console.error("Erro ao salvar tarefa:", error);
        alert.innerHTML = `<div class_alias="alert alert-error">${error.message}</div>`;
    }
}

// ========================================
// 7. LÓGICA DO TIME (Convites)
// ========================================
function loadTimeView() {
    // (Simulação)
    const teamBody = document.getElementById('teamTableBody');
    teamBody.innerHTML = `
        <tr>
            <td>${escapeHTML(currentUser.nome)}</td>
            <td>${escapeHTML(currentUser.email)}</td>
            <td>Admin</td>
            <td><span class="status-badge status-finalizada">Ativo</span></td>
            <td>-</td>
        </tr>
        <tr>
            <td>Membro Convidado</td>
            <td>convidado@exemplo.com</td>
            <td>Membro</td>
            <td><span class="status-badge status-aguardando_aprovacao">Pendente</span></td>
            <td><button class="btn btn-danger btn-small">Cancelar</button></td>
        </tr>
    `;
    feather.replace();
}

function openInviteModal() {
    document.getElementById('inviteForm').reset();
    document.getElementById('inviteAlert').innerHTML = '';
    document.getElementById('inviteModal').style.display = 'flex';
}

async function handleInviteFormSubmit(e) {
    e.preventDefault();
    const alert = document.getElementById('inviteAlert');
    alert.innerHTML = '<div class_alias="loading"><div class_alias="spinner"></div>Enviando convite...</div>';
    
    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('inviteRole').value;
    
    try {
        // Chamada à API que cuidará da lógica de convite
        await fetch('/api/invite', {
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
        
        showNotification(`Convite enviado para ${email}!`, 'success');
        closeModal('inviteModal');
        loadTimeView(); // Recarrega a lista do time

    } catch (error) {
        console.error("Erro ao convidar:", error);
        alert.innerHTML = `<div class_alias="alert alert-error">${error.message}</div>`;
    }
}


// ========================================
// 8. LÓGICA DO BLOCO DE NOTAS
// ========================================
function loadNotasView() {
    // (Simulação)
    const notes = [
        { id: 1, title: 'Ideias do Projeto', excerpt: 'Requisitos iniciais e...' },
        { id: 2, title: 'Links Úteis', excerpt: 'Documentação do Supabase...' }
    ];
    
    const list = document.getElementById('noteList');
    list.innerHTML = `<button class="btn btn-primary w-full mb-4" onclick="createNewNote()">+ Nova Nota</button>`;
    
    notes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-list-item';
        item.dataset.noteId = note.id;
        item.innerHTML = `
            <div class="note-list-title">${escapeHTML(note.title)}</div>
            <div class="note-list-excerpt">${escapeHTML(note.excerpt)}</div>
        `;
        item.addEventListener('click', () => openNote(note.id));
        list.appendChild(item);
    });
    
    // Abre a primeira nota por padrão (ou uma nota vazia)
    openNote(notes[0]?.id || null);
}

function createNewNote() {
    // Limpa o editor para uma nova nota
    currentNoteId = null;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteBody').value = '';
    document.getElementById('noteTitle').focus();
    
    // Remove seleção da lista
    document.querySelectorAll('.note-list-item.active').forEach(item => item.classList.remove('active'));
}

function openNote(noteId) {
    if (noteId === null) {
        createNewNote();
        return;
    }
    
    // (Simulação: buscaria a nota completa)
    const note = { id: noteId, title: 'Ideias do Projeto', body: 'Requisitos iniciais e...\n\n- API de Pagamento\n- Autenticação JWT' };
    
    currentNoteId = note.id;
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteBody').value = note.body;
    
    // Destaca na lista
    document.querySelectorAll('.note-list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.noteId == noteId);
    });
}

async function saveNote() {
    const title = document.getElementById('noteTitle').value;
    const body = document.getElementById('noteBody').value;
    
    const noteData = {
        title: title,
        body: body,
        org_id: currentOrg.id,
        user_id: currentUser.id
    };
    
    try {
        if (currentNoteId) {
            // Update
            // await supabaseRequest(`notes?id=eq.${currentNoteId}`, 'PATCH', noteData);
        } else {
            // Create
            // const response = await supabaseRequest('notes', 'POST', noteData);
            // currentNoteId = response[0].id; // Pega o ID da nova nota
        }
        showNotification('Nota salva!', 'success');
        loadNotasView(); // Recarrega a lista (para mostrar novo título/excerto)
        
    } catch (error) {
        console.error("Erro ao salvar nota:", error);
        showNotification('Falha ao salvar nota.', 'error');
    }
}


// ========================================
// 9. LÓGICA DO CALENDÁRIO
// ========================================
function loadCalendarView() {
    // Esta é uma implementação simples. Para um calendário interativo (drag/drop)
    // seria necessária uma biblioteca como FullCalendar.
    const container = document.getElementById('calendarContainer');
    container.innerHTML = `<p class="text-center text-gray-600">Carregando calendário...</p>`;
    
    // Simulação de renderização
    container.innerHTML = `
        <div class="calendar-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid #e5e7eb;">
            <div class="font-semibold p-2 text-center border-b border-r">Dom</div>
            <div class="font-semibold p-2 text-center border-b border-r">Seg</div>
            <div class="font-semibold p-2 text-center border-b border-r">Ter</div>
            <div class="font-semibold p-2 text-center border-b border-r">Qua</div>
            <div class="font-semibold p-2 text-center border-b border-r">Qui</div>
            <div class="font-semibold p-2 text-center border-b border-r">Sex</div>
            <div class="font-semibold p-2 text-center border-b">Sáb</div>
            
            <div class="h-24 border-r border-b p-1 text-gray-400">27</div>
            <div class="h-24 border-r border-b p-1 text-gray-400">28</div>
            <div class="h-24 border-r border-b p-1 text-gray-400">29</div>
            <div class="h-24 border-r border-b p-1">1</div>
            <div class="h-24 border-r border-b p-1">2</div>
            <div class="h-24 border-r border-b p-1">3</div>
            <div class="h-24 border-b p-1">4</div>
            
            <div class="h-24 border-r border-b p-1">5
                <div class="text-xs p-1 rounded bg-red-100 text-red-700 font-medium truncate">#2 Vence Hoje</div>
            </div>
            </div>
    `;
}


// ========================================
// 10. UTILITÁRIOS (DA REFERÊNCIA)
// ========================================
async function supabaseRequest(endpoint, method = 'GET', body = null) {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
        console.error("Token JWT não encontrado");
        logout(); 
        throw new Error("Sessão expirada.");
    }

    const url = `/api/proxy?endpoint=${encodeURIComponent(endpoint)}`;
    
    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'Prefer': 'return=representation'
        }
    };

    if (body && (method === 'POST' || 'PATCH')) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || errorData.error || 'Erro na requisição Supabase');
        }
        if (response.status === 204) return null; // No content (ex: DELETE)
        return await response.json();
    } catch (error) {
        console.error("Erro em supabaseRequest:", error);
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
