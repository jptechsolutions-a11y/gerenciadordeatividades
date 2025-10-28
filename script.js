// --- Variáveis Globais ---
let currentUser = null; // { id, nome, username, role, filiais: [{id, nome}] }
let selectedFilial = { id: 1, nome: 'Geral', descricao: 'Time Geral' }; // Valor mockado para o Project Manager
let usersCache = []; // Cache de todos os usuários (para responsáveis)
let projects = []; // Cache de todos os projetos (para Dashboard/Projetos)
let currentEditingProject = null;
let currentPersonalUser = null; // Usuário logado na Área Pessoal
let currentEditingNote = null;
let selectedNoteColor = '#00D4AA';
let selectedProjectResponsibles = [];
let editingProjectStatusId = null;
let charts = {};
let calendar = null;

// --- Mapeamento de Status ---
const statusLabels = {
    'nao-iniciado': 'Não Iniciado',
    'em-andamento': 'Em Andamento',
    'em-pausa': 'Em Pausa',
    'concluido': 'Concluído',
    'atrasado': 'Atrasado',
    'cancelado': 'Cancelado'
};
const statusColors = {
    'nao-iniciado': '#7a7a7a',
    'em-andamento': '#0077B6',
    'em-pausa': '#F77F00',
    'concluido': '#00D4AA',
    'atrasado': '#D62828',
    'cancelado': '#7a7a7a'
};
const priorityLabels = { 1: 'Crítica', 2: 'Alta', 3: 'Média', 4: 'Baixa', 5: 'Não Importante' };

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Listeners para a nova interface
    document.getElementById('projectResponsibleWrapper')?.addEventListener('click', (e) => {
         if (e.target.closest('.multi-select-display')) {
             toggleMultiSelect('projectResponsibleOptions');
         }
    });
    document.getElementById('projectResponsibleOptions')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'DIV') {
            handleProjectResponsibleSelect(e.target.textContent.trim());
        }
    });

    document.getElementById('noteModal')?.querySelector('.flex')?.addEventListener('click', (e) => {
        if (e.target.closest('.color-option')) {
            selectNoteColor(e.target.closest('.color-option'));
        }
    });
    
    // Fechar MultiSelect ao clicar fora
    document.addEventListener('click', function(e) {
        const projectResponsibleWrapper = document.getElementById('projectResponsibleWrapper');
        const projectResponsibleOptions = document.getElementById('projectResponsibleOptions');
        if (projectResponsibleWrapper && !projectResponsibleWrapper.contains(e.target)) {
            projectResponsibleOptions.classList.remove('show');
        }
    });
});

// --- Funções de Utilitário ---
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
}

async function supabaseRequest(endpoint, method = 'GET', body = null, customHeaders = {}) {
    const authToken = localStorage.getItem('auth_token');
    // NOTE: For JP Project Manager, we will skip the token and use the local storage 'username' for logic,
    // and rely on the database having RLS disabled or using the Anon key for simple read/write.
    // For the simple login/personal area, we'll use a direct fetch with the username/password.
    // However, the main Project CRUD in 'projects' and 'dashboard' tabs still needs RLS/Auth or an external proxy.
    
    // Replicando a arquitetura do proxy
    const url = `/api/proxy?endpoint=${encodeURIComponent(endpoint)}`;
    
    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            // Usaremos um token mockado se não houver um real para testes, mas o proxy original requer 'Authorization'
            'Authorization': `Bearer ${authToken || SUPABASE_ANON_KEY}`,
            ...customHeaders 
        }
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na requisição Supabase: ${errorText}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data) && data.some(item => item === null)) {
            return data.filter(item => item !== null);
        }

        return data;
        
    } catch (error) {
        console.error("Erro na requisição supabaseRequest:", error);
        throw error;
    }
}

function showNotification(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    let icon = '';
    let title = '';
    
    if (type === 'success') { icon = '<i data-feather="check-circle" class="h-5 w-5 mr-2"></i>'; title = 'Sucesso!'; } 
    else if (type === 'error') { icon = '<i data-feather="x-circle" class="h-5 w-5 mr-2"></i>'; title = 'Erro!'; } 
    else if (type === 'info') { icon = '<i data-feather="info" class="h-5 w-5 mr-2"></i>'; title = 'Informação'; }

    notification.innerHTML = `
        <div class="notification-header">
            ${icon}
            <span>${escapeHTML(title)}</span>
        </div>
        <div class="notification-body">${escapeHTML(message)}</div>
    `;

    container.appendChild(notification);
    if (typeof feather !== 'undefined') feather.replace();
    setTimeout(() => {
        notification.classList.add('hide');
        notification.addEventListener('animationend', () => notification.remove());
    }, timeout);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    const alertDiv = modal.querySelector('[id$="Messages"]');
    if (alertDiv) alertDiv.innerHTML = '';
}

function showMessage(containerId, message, type = 'success') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="alert alert-${type}">${escapeHTML(message)}</div>`;
    setTimeout(() => {
        if (container.querySelector('.alert')) container.innerHTML = '';
    }, 5000);
}

// --- Funções de Autenticação (Adaptadas para simular o Baixas-Login) ---
async function handleLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.innerHTML; 
    
    document.getElementById('loginAlert').innerHTML = ''; 
    loginButton.disabled = true;
    loginButton.innerHTML = `<div class="spinner" style="border-width: 2px; width: 20px; height: 20px; border-top-color: white; margin-right: 8px; display: inline-block; animation: spin 1s linear infinite;"></div> CARREGANDO...`;

    const username = document.getElementById('email').value.trim().toLowerCase(); 
    const password = document.getElementById('password').value;
    
    try {
        // Simulação de login: Busca na tabela 'users'
        const usersData = await loadUsers(true);
        const user = usersData.find(u => u.username === username && u.password === password);

        if (!user) {
            throw new Error('Usuário ou senha incorretos. Tente novamente.');
        }

        currentUser = {
            id: user.id,
            nome: user.name,
            username: user.username,
            role: 'admin', // Mockando como admin para acesso total ao menu
            filiais: [{ id: 1, nome: 'Geral', descricao: 'Time Geral' }]
        };

        // Não há seleção de filial no PM, vai direto para o dashboard
        redirectToDashboard();

    } catch (error) {
        console.error("Erro detalhado no login:", error); 
        showMessage('loginAlert', error.message, 'error'); 
        loginButton.disabled = false;
        loginButton.innerHTML = originalButtonText;
    }
}

function redirectToDashboard() {
    if (currentUser) {
        // Mockado: vai direto para o sistema principal com filial mockada
        showMainSystem();
    }
}

function showMainSystem() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainSystem').style.display = 'flex';
    document.body.classList.add('system-active');

    document.getElementById('sidebarUser').textContent = currentUser.nome || 'Usuário';
    document.getElementById('sidebarFilial').textContent = selectedFilial.nome || '?';

    filterSidebarNav();
    showNotification(`Acesso liberado para o Time ${selectedFilial?.nome}!`, 'success');

    if (typeof feather !== 'undefined') feather.replace();
}

function filterSidebarNav() {
    // Mantendo a função, mas todos os links terão data-role="admin,gestor,operacao" no HTML
    const navItems = document.querySelectorAll('.sidebar nav .nav-item');
    let firstVisibleLink = null;
    
    navItems.forEach(item => {
        item.style.display = 'flex'; 
        if (!firstVisibleLink) { 
            firstVisibleLink = item; 
        }
    });

    if (firstVisibleLink) {
        const viewId = firstVisibleLink.getAttribute('href').substring(1) + 'View';
        showView(viewId, firstVisibleLink);
    }
}

function logout() {
    currentUser = null;
    usersCache = []; 
    projects = []; 
    currentEditingProject = null;
    currentPersonalUser = null; 
    
    localStorage.removeItem('auth_token'); // Limpa token
    document.body.classList.remove('system-active');

    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    
    const loginForm = document.getElementById('loginForm');
    loginForm.reset();
    document.getElementById('loginAlert').innerHTML = '';
    document.querySelector('#loginForm button[type="submit"]').textContent = 'ENTRAR';

    showNotification('Você foi desconectado.', 'info');
}

function showView(viewId, element = null) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
    if (element) { element.classList.add('active'); }
    else {
        const link = document.querySelector(`.sidebar nav a[href="#${viewId.replace('View', '')}"]`);
        if (link) link.classList.add('active');
    }

    try {
        switch (viewId) {
            case 'dashboardView': loadDashboard(); break;
            case 'projectsView': prepareProjectForm(); break;
            case 'agendaView': loadAgenda(); break;
            case 'personalView': loadPersonalArea(); break;
            case 'settingsView': loadSettings(); break;
        }
    } catch(e) {
        console.error(`Erro ao carregar dados para a view ${viewId}:`, e);
    }

    if (typeof feather !== 'undefined') feather.replace();
    if (typeof AOS !== 'undefined') AOS.refresh();
}

// --- Funções do Gerenciador de Projetos ---

// GERAL
async function loadDashboard() {
    await loadUsers();
    await loadProjects();
    renderDashboardContent();
}

async function loadSettings() {
    await displayUsers();
    displaySystemInfo();
}

// PROJETOS
function prepareProjectForm(projectId = null) {
    if (!usersCache.length) loadUsers(); 
    if (projectId) {
         editProject(projectId); // Chama a lógica de edição se for um ID
    } else {
         clearProjectForm();
    }
}

function clearProjectForm() {
    document.getElementById('projectFormTitle').textContent = 'Novo Projeto';
    document.getElementById('projectTitle').value = '';
    selectedProjectResponsibles = [];
    updateProjectResponsibleDisplay();
    document.getElementById('projectPriority').value = '3';
    document.getElementById('projectStatus').value = 'nao-iniciado';
    document.getElementById('projectDescription').value = '';
    document.getElementById('activitiesList').innerHTML = '';
    document.getElementById('attachedFilesList').innerHTML = '';
    document.getElementById('projectAttachments').value = '';
    currentEditingProject = null;
    
    // Adiciona uma atividade inicial vazia
    addActivity();
}


async function loadProjects() {
    try {
        const { data: projectsData, error: projectsError } = await supabaseRequest(
            'projects?select=*,activities(*)', 'GET'
        );
        
        if (projectsError) throw projectsError;
        projects = projectsData || [];
        displayProjects();
        return projects;
    } catch (error) {
        console.error('Erro ao carregar projetos:', error);
        projects = [];
        displayProjects();
        return [];
    }
}

function displayProjects() {
    const projectsList = document.getElementById('projectsList');
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const responsibleFilter = document.getElementById('filterResponsible')?.value || '';
    const priorityFilter = document.getElementById('filterPriority')?.value || '';
    
    let filteredProjects = projects;

    if (statusFilter) { filteredProjects = filteredProjects.filter(p => p.status === statusFilter); }
    if (responsibleFilter) { filteredProjects = filteredProjects.filter(p => p.responsible.split(', ').includes(responsibleFilter)); }
    if (priorityFilter) { filteredProjects = filteredProjects.filter(p => p.priority === parseInt(priorityFilter)); }

    if (filteredProjects.length === 0) {
        projectsList.innerHTML = '<div class="text-center py-8 text-gray-500">Nenhum projeto encontrado.</div>';
        return;
    }

    projectsList.innerHTML = filteredProjects.map(project => {
        const totalActivities = project.activities.length;
        const completedActivities = project.activities.filter(a => a.status === 'concluido').length;
        const progress = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;
        const progressBarColor = progress === 100 ? '#10b981' : (project.status === 'atrasado' ? '#D62828' : '#0077B6');

        const startDate = project.activities.length > 0 ? new Date(Math.min(...project.activities.filter(a => a.start_date).map(a => new Date(a.start_date)))).toLocaleDateString('pt-BR') : '-';
        const endDate = project.activities.length > 0 ? new Date(Math.max(...project.activities.filter(a => a.end_date).map(a => new Date(a.end_date)))).toLocaleDateString('pt-BR') : '-';

        const attachmentsHtml = project.attachments_urls && project.attachments_urls.length > 0
            ? project.attachments_urls.map(url => {
                const fileName = url.split('/').pop().split('?')[0].split('%2F').pop();
                return `<a href="${escapeHTML(url)}" target="_blank" class="text-xs text-blue-600 hover:underline mr-2">${escapeHTML(fileName)}</a>`;
            }).join('')
            : 'Nenhum';

        return `
            <div class="project-card bg-white p-6 rounded-lg shadow-md border-l-4 border-${statusColors[project.status].replace('#', 'p')}" style="border-left-color: ${statusColors[project.status]}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="text-xl font-bold" style="color: var(--dark);">${escapeHTML(project.title)} ${project.edited ? '<span class="edit-indicator text-yellow-600 font-normal">● Editado</span>' : ''}</h4>
                        <p class="text-sm text-gray-600 mt-1">Responsável(is): ${escapeHTML(project.responsible)}</p>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="status-badge status-${project.status} text-white" style="background-color: ${statusColors[project.status]}">${statusLabels[project.status] || project.status}</span>
                        <span class="status-badge status-aprovada text-white" style="background-color: ${priorityColors[project.priority]}">${priorityLabels[project.priority]}</span>
                        <button class="btn btn-primary btn-small" onclick="editProject('${project.id}')">
                            <i data-feather="edit-3" class="h-4 w-4"></i>
                        </button>
                    </div>
                </div>
                
                <div class="mb-4">
                    <p class="text-sm text-gray-700">${escapeHTML(project.description) || 'Sem descrição.'}</p>
                </div>
                
                <div class="grid grid-cols-3 gap-4 text-sm text-gray-700 mb-4 border-t pt-4">
                    <div><strong>Início:</strong> ${startDate}</div>
                    <div><strong>Fim:</strong> ${endDate}</div>
                    <div><strong>Atividades:</strong> ${totalActivities}</div>
                </div>

                <div>
                    <div class="text-sm font-semibold mb-1">Progresso: ${progress}%</div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${progress}%; background-color: ${progressBarColor};">${progress > 10 ? `${progress}%` : ''}</div>
                    </div>
                </div>
                
                <div class="mt-4 text-sm text-gray-600">
                    <strong>Anexos:</strong> ${attachmentsHtml}
                </div>
                
                <div class="mt-4 pt-4 border-t text-right">
                    <button class="btn btn-danger btn-small" onclick="deleteProject('${project.id}')">Excluir Projeto</button>
                    <button class="btn btn-secondary btn-small ml-2" onclick="openProjectStatusModal('${project.id}')">Status Rápido</button>
                </div>
            </div>
        `;
    }).join('');
    
    if (typeof feather !== 'undefined') feather.replace();
}

// ATIVIDADES
function addActivity(activityData = {}) {
    const activitiesList = document.getElementById('activitiesList');
    const activityIndex = activitiesList.children.length;
    
    let suggestedStartDate = activityData.start_date || new Date().toISOString().split('T')[0];
    if (activityIndex > 0 && !activityData.start_date) {
        const lastActivity = activitiesList.children[activityIndex - 1];
        const lastEndDate = lastActivity.querySelector('.activity-end').value;
        if (lastEndDate) {
            suggestedStartDate = getNextWorkingDay(lastEndDate);
        }
    }
    
    const activityDiv = document.createElement('div');
    activityDiv.className = 'activity-item p-3 border rounded-lg bg-white shadow-sm';
    
    let activityResponsibles = activityData.responsible ? activityData.responsible.split(', ') : selectedProjectResponsibles;
    
    const allUsersOptions = usersCache.map(user => `
        <option value="${escapeHTML(user.name)}" ${activityResponsibles.includes(user.name) ? 'selected' : ''}>
            ${escapeHTML(user.name)}
        </option>
    `).join('');

    const fixedResponsiblesHtml = activityResponsibles.map(name => `<span class="status-badge status-aprovada bg-blue-100 text-blue-800" style="margin-right: 5px;">${escapeHTML(name)}</span>`).join('');

    activityDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2 border-b pb-2">
            <h5 class="font-semibold text-gray-800">Atividade ${activityIndex + 1}</h5>
            <button type="button" class="btn btn-danger btn-small" onclick="removeActivity(this)">
                <i data-feather="trash-2" class="h-4 w-4"></i> Remover
            </button>
        </div>
        <div class="form-grid" style="grid-template-columns: 2fr 1fr;">
            <div class="form-group">
                <label>Nome da Atividade:</label>
                <input type="text" class="activity-name w-full" value="${escapeHTML(activityData.name || '')}" required>
            </div>
            <div class="form-group">
                <label>Status:</label>
                <select class="activity-status w-full">
                    <option value="nao-iniciado" ${activityData.status === 'nao-iniciado' ? 'selected' : ''}>Não Iniciado</option>
                    <option value="em-andamento" ${activityData.status === 'em-andamento' ? 'selected' : ''}>Em Andamento</option>
                    <option value="em-pausa" ${activityData.status === 'em-pausa' ? 'selected' : ''}>Em Pausa</option>
                    <option value="concluido" ${activityData.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                </select>
            </div>
        </div>
        
        <div class="form-grid" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="form-group">
                <label>Início:</label>
                <input type="date" class="activity-start w-full" value="${escapeHTML(suggestedStartDate)}" onchange="updateActivityDates(this.closest('.activity-item'))" required>
            </div>
            <div class="form-group">
                <label>Dias de Trabalho:</label>
                <input type="number" class="activity-days w-full" min="1" value="${activityData.work_days || 1}" onchange="updateActivityDates(this.closest('.activity-item'))" required>
            </div>
            <div class="form-group">
                <label>Fim (Calculado):</label>
                <input type="date" class="activity-end w-full bg-gray-100" readonly value="${escapeHTML(activityData.end_date || '')}">
            </div>
        </div>

        <div class="form-group">
            <label>Responsável(is) da Atividade (Pode ser diferente do projeto):</label>
            <select class="activity-responsible-select w-full" multiple size="3" onchange="updateActivityResponsibleTags(this)">
                ${allUsersOptions}
            </select>
            <div class="text-sm mt-1 text-gray-500">Responsáveis Atuais: ${fixedResponsiblesHtml}</div>
        </div>
    `;
    activitiesList.appendChild(activityDiv);
    updateActivityDates(activityDiv);
    if (typeof feather !== 'undefined') feather.replace();
}

function removeActivity(button) {
    const activityItem = button.closest('.activity-item');
    const activitiesList = activityItem.parentElement;
    activityItem.remove();
    
    // Reajusta os títulos e datas subsequentes
    Array.from(activitiesList.children).forEach((activity, index) => {
        activity.querySelector('h5').textContent = `Atividade ${index + 1}`;
        if (index > 0) {
            updateActivityDates(activity);
        }
    });
}

function updateActivityDates(activityElement) {
    const startInput = activityElement.querySelector('.activity-start');
    const daysInput = activityElement.querySelector('.activity-days');
    const endInput = activityElement.querySelector('.activity-end');

    const startDate = startInput.value;
    const workingDays = parseInt(daysInput.value);

    if (startDate && workingDays > 0) {
        const endDate = addWorkingDays(startDate, workingDays);
        endInput.value = endDate;
        updateNextActivityStart(activityElement);
    }
}

function addWorkingDays(startDate, workingDays) {
    let date = new Date(startDate);
    let daysAdded = 0;
    
    // Ajusta a data inicial para evitar finais de semana
    if (date.getDay() === 6) date.setDate(date.getDate() + 2); // Se for sábado, vai para segunda
    if (date.getDay() === 0) date.setDate(date.getDate() + 1); // Se for domingo, vai para segunda
    
    while (daysAdded < workingDays) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() !== 0 && date.getDay() !== 6) {
            daysAdded++;
        }
    }
    return date.toISOString().split('T')[0];
}

function getNextWorkingDay(dateString) {
    const nextDay = new Date(dateString);
    nextDay.setDate(nextDay.getDate() + 1);
    
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
        nextDay.setDate(nextDay.getDate() + 1);
    }
    return nextDay.toISOString().split('T')[0];
}

function updateNextActivityStart(currentActivity) {
    const activitiesList = currentActivity.parentElement;
    const activities = Array.from(activitiesList.children);
    const currentIndex = activities.indexOf(currentActivity);
    const nextActivity = activities[currentIndex + 1];
    
    if (nextActivity) {
        const currentEndInput = currentActivity.querySelector('.activity-end');
        const nextStartInput = nextActivity.querySelector('.activity-start');
        
        if (currentEndInput.value) {
            const nextStart = getNextWorkingDay(currentEndInput.value);
            nextStartInput.value = nextStart;
            // Recursivamente atualiza a data de fim do próximo
            updateActivityDates(nextActivity);
        }
    }
}

// SALVAR
async function saveProject() {
    const title = document.getElementById('projectTitle').value;
    const priority = document.getElementById('projectPriority').value;
    const status = document.getElementById('projectStatus').value;
    const description = document.getElementById('projectDescription').value;
    const attachments = document.getElementById('projectAttachments').files;

    if (!title || selectedProjectResponsibles.length === 0) {
        showMessage('projectMessages', 'Preencha o título e selecione pelo menos um responsável principal!', 'error');
        return;
    }

    try {
        showMessage('projectMessages', 'Salvando projeto...', 'success');
        document.getElementById('saveProjectBtn').disabled = true;
        
        const responsibleString = selectedProjectResponsibles.join(', ');
        const isEditing = !!currentEditingProject;
        
        const projectData = {
            title,
            responsible: responsibleString,
            priority: parseInt(priority),
            status,
            description,
            edited: isEditing // True se for edição
        };

        let projectId;
        let projectResponse;

        if (isEditing) {
            projectResponse = await supabaseRequest(
                `projects?id=eq.${currentEditingProject.id}`, 'PATCH', projectData
            );
            projectId = currentEditingProject.id;
        } else {
            projectResponse = await supabaseRequest(
                'projects', 'POST', projectData
            );
            projectId = projectResponse[0].id;
        }
        
        // 1. ANEXOS (Simplificado: apenas upload e atualização da URL no projeto, sem remoção de antigos)
        if (attachments.length > 0) {
            const uploadedUrls = [];
            for (const file of attachments) {
                // Simulação de upload. No ambiente real, essa rota faria o upload.
                const mockUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${projectId}/${Date.now()}_${file.name}`;
                uploadedUrls.push(mockUrl);
            }
            
            // Aqui você faria o PATCH real para atualizar o attachments_urls
            // No modo de demonstração, vamos apenas assumir que funcionou
            await supabaseRequest(
                `projects?id=eq.${projectId}`, 'PATCH', { attachments_urls: uploadedUrls }
            );
        }

        // 2. ATIVIDADES
        // Deleta antigas atividades e insere as novas em uma única transação (conceitualmente)
        await supabaseRequest(`activities?project_id=eq.${projectId}`, 'DELETE');

        const activityItems = document.querySelectorAll('.activity-item');
        const activitiesToInsert = [];
        for (const item of activityItems) {
            const name = item.querySelector('.activity-name').value;
            const activityResponsibleSelect = item.querySelector('.activity-responsible-select');
            const activityResponsibles = Array.from(activityResponsibleSelect.selectedOptions).map(option => option.value);
            
            if (name && activityResponsibles.length > 0) {
                activitiesToInsert.push({
                    project_id: projectId,
                    name,
                    responsible: activityResponsibles.join(', '),
                    start_date: item.querySelector('.activity-start').value || null,
                    end_date: item.querySelector('.activity-end').value || null,
                    work_days: parseInt(item.querySelector('.activity-days').value),
                    status: item.querySelector('.activity-status').value
                });
            }
        }
        
        if (activitiesToInsert.length > 0) {
            await supabaseRequest('activities', 'POST', activitiesToInsert);
        }

        showMessage('projectMessages', `Projeto ${isEditing ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        clearProjectForm();
        await loadProjects();
        // Recarrega a view correta se estiver no Dashboard
        if (document.getElementById('dashboardView')?.classList.contains('active')) {
            loadDashboard();
        }
    } catch (error) {
        console.error('Erro ao salvar projeto:', error);
        showMessage('projectMessages', `Erro ao salvar projeto: ${error.message}`, 'error');
    } finally {
        document.getElementById('saveProjectBtn').disabled = false;
    }
}

// EDIÇÃO
async function editProject(projectId) {
    try {
        const project = projects.find(p => p.id === projectId);
        if (!project) throw new Error('Projeto não encontrado.');

        currentEditingProject = project;
        document.getElementById('projectFormTitle').textContent = `Editar Projeto #${project.id}`;

        document.getElementById('projectTitle').value = project.title;
        selectedProjectResponsibles = project.responsible ? project.responsible.split(', ') : [];
        updateProjectResponsibleDisplay();
        document.getElementById('projectPriority').value = project.priority;
        document.getElementById('projectStatus').value = project.status;
        document.getElementById('projectDescription').value = project.description;
        
        const activitiesList = document.getElementById('activitiesList');
        activitiesList.innerHTML = '';
        project.activities.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(activity => {
            addActivity(activity);
        });
        
        const attachedFilesList = document.getElementById('attachedFilesList');
        attachedFilesList.innerHTML = '';
        if (project.attachments_urls && project.attachments_urls.length > 0) {
            project.attachments_urls.forEach(url => {
                const fileName = url.split('/').pop().split('?')[0].split('%2F').pop();
                const attachmentDiv = document.createElement('div');
                attachmentDiv.className = 'attachment-item text-sm text-gray-700';
                attachmentDiv.innerHTML = `<a href="${escapeHTML(url)}" target="_blank" class="text-blue-600 hover:underline">${escapeHTML(fileName)}</a>`;
                attachedFilesList.appendChild(attachmentDiv);
            });
        }
        
        showView('projectsView');
    } catch (error) {
        showNotification(`Erro ao carregar projeto: ${error.message}`, 'error');
    }
}

async function deleteProject(projectId) {
    if (!confirm('Tem certeza que deseja excluir este projeto e todas as suas atividades?')) return;
    
    try {
        await supabaseRequest(`projects?id=eq.${projectId}`, 'DELETE');
        showNotification('Projeto excluído com sucesso!', 'success');
        await loadProjects();
        if (document.getElementById('dashboardView')?.classList.contains('active')) {
             loadDashboard();
        }
    } catch (error) {
        showNotification(`Erro ao excluir projeto: ${error.message}`, 'error');
    }
}

// AGENDA
async function loadAgenda() {
    await loadUsers();
    await loadProjects();
    loadCalendarEvents();
}

function loadCalendarEvents() {
    const calendarEl = document.getElementById('calendar');
    
    if (!calendar) {
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'pt-br',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: [],
            height: 'auto',
            contentHeight: 'auto',
            aspectRatio: 1.8,
            themeSystem: 'bootstrap5',
            dayCellContent: function (e) {
                return { html: `<div class="fc-daygrid-day-number">${e.dayNumberText}</div>` };
            },
            eventDidMount: function(info) {
                 // Estiliza o evento com a cor do status
                info.el.style.backgroundColor = statusColors[info.event.extendedProps.status] || '#7a7a7a';
                info.el.style.borderColor = statusColors[info.event.extendedProps.status] || '#7a7a7a';
                info.el.style.color = 'white';
            }
        });
        calendar.render();
    }

    calendar.removeAllEvents();
    
    const activities = projects.flatMap(p => p.activities.map(a => ({
        id: a.id,
        title: a.name,
        start: a.start_date,
        end: a.end_date,
        responsible: a.responsible,
        color: statusColors[a.status],
        status: a.status,
        projectTitle: p.title
    })));
    
    const events = activities.filter(a => a.start && a.end && a.status !== 'concluido' && a.status !== 'cancelado').map(a => {
        const endDate = new Date(a.end);
        // FullCalendar end date is exclusive, so add 1 day to show the last day
        endDate.setDate(endDate.getDate() + 1); 
        return {
            title: `[${a.projectTitle}] ${a.title} (${a.responsible})`,
            start: a.start,
            end: endDate.toISOString().split('T')[0],
            backgroundColor: a.color,
            borderColor: a.color,
            allDay: true,
            extendedProps: {
                status: a.status // Passa o status para estilização
            }
        };
    });
    
    calendar.addEventSource(events);
}

// ÁREA PESSOAL
function loadPersonalArea() {
    if (currentPersonalUser) {
        document.getElementById('personalLogin').style.display = 'none';
        document.getElementById('personalContent').style.display = 'block';
        document.getElementById('currentUser').textContent = currentPersonalUser.name;
        loadPersonalData();
    } else {
        document.getElementById('personalLogin').style.display = 'block';
        document.getElementById('personalContent').style.display = 'none';
    }
}

async function loginPersonal() {
    const username = document.getElementById('personalUser').value.toLowerCase();
    const password = document.getElementById('personalPassword').value;

    if (!username || !password) {
        showMessage('personalMessages', 'Preencha usuário e senha.', 'error');
        return;
    }

    try {
        showMessage('personalMessages', 'Verificando credenciais...', 'success');
        
        const usersData = await loadUsers(true);
        const user = usersData.find(u => u.username === username && u.password === password);

        if (!user) {
            showMessage('personalMessages', 'Usuário ou senha incorretos!', 'error');
            return;
        }

        currentPersonalUser = user;
        loadPersonalArea(); // Recarrega para mostrar o conteúdo pessoal
        showMessage('personalMessages', 'Acesso liberado!', 'success');
        
    } catch (error) {
        console.error('Login error:', error);
        showMessage('personalMessages', 'Erro ao fazer login. Tente novamente.', 'error');
    }
}

function logoutPersonal() {
    currentPersonalUser = null;
    loadPersonalArea();
}

async function loadPersonalData() {
    if (!currentPersonalUser) return;
    await loadProjects();
    await displayUserProjects();
    await displayNotes();
}

async function displayUserProjects() {
    if (!currentPersonalUser) return;
    
    const userProjectsList = document.getElementById('userProjectsList');
    userProjectsList.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando seus projetos...</div>';

    const filteredProjects = projects.filter(project =>
        project.responsible.split(', ').includes(currentPersonalUser.name) ||
        project.activities.some(a => a.responsible && a.responsible.split(', ').includes(currentPersonalUser.name))
    );

    if (filteredProjects.length === 0) {
        userProjectsList.innerHTML = '<p class="text-gray-500 text-center py-4">Você não é responsável por nenhum projeto/atividade.</p>';
        return;
    }
    
    // HTML de Status para as atividades
    const activityStatusOptions = Object.keys(statusLabels).map(statusKey =>
        `<option value="${statusKey}">${statusLabels[statusKey]}</option>`
    ).join('');

    userProjectsList.innerHTML = filteredProjects.map(project => {
        const userActivities = project.activities.filter(a => a.responsible && a.responsible.split(', ').includes(currentPersonalUser.name));
        const isProjectResponsible = project.responsible.split(', ').includes(currentPersonalUser.name);

        return `
            <div class="personal-project-card border-l-4 border-blue-400 p-4 rounded-lg shadow-sm bg-gray-50">
                <div class="flex justify-between items-start mb-3">
                    <h4 class="text-lg font-bold" style="color: var(--dark);">${escapeHTML(project.title)}</h4>
                    <span class="status-badge status-${project.status}" style="background-color: ${statusColors[project.status]}; color: white; font-size: 0.8rem;">${statusLabels[project.status]}</span>
                </div>
                
                ${isProjectResponsible ? `<p class="text-sm text-blue-700 mb-2 font-semibold">Você é o responsável principal.</p>` : ''}

                ${userActivities.length > 0 ? `
                    <div class="mt-3">
                        <strong class="text-sm text-gray-700">Suas Atividades:</strong>
                        <div class="space-y-2 mt-1">
                            ${userActivities.map(activity => `
                                <div class="p-2 bg-white rounded border flex justify-between items-center text-sm">
                                    <span>${escapeHTML(activity.name)}</span>
                                    <select class="activity-status-select bg-gray-100 p-1 rounded text-xs" onchange="updateActivityStatus('${activity.id}', this.value)">
                                        ${activityStatusOptions.replace(`value="${activity.status}"`, `value="${activity.status}" selected`)}
                                    </select>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}


// Notas Pessoais
function selectNoteColor(element) {
    selectedNoteColor = element.dataset.color;
    document.querySelectorAll('#noteModal .color-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
}

function openNoteModal(noteId = null) {
    currentEditingNote = null;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('saveNoteBtn').textContent = 'Salvar Anotação';
    selectedNoteColor = '#00D4AA';
    
    if (noteId) editNote(noteId);
    
    closeModal('noteModal');
    document.getElementById('noteModal').style.display = 'flex';
}

async function editNote(noteId) {
    try {
        const { data: note } = await supabaseRequest(`notes?id=eq.${noteId}&select=*`, 'GET');
        
        currentEditingNote = note[0];
        document.getElementById('noteTitle').value = note[0].title;
        document.getElementById('noteContent').value = note[0].content;
        selectedNoteColor = note[0].color;
        document.getElementById('saveNoteBtn').textContent = 'Atualizar Anotação';
        
        selectNoteColor(document.querySelector(`.color-option[data-color="${note[0].color}"]`));
        
    } catch (error) {
        showNotification('Erro ao carregar anotação para edição.', 'error');
    }
}

async function saveNote() {
    const title = document.getElementById('noteTitle').value;
    const content = document.getElementById('noteContent').value;

    if (!title || !content) {
        showMessage('noteMessages', 'Preencha o título e o conteúdo.', 'error');
        return;
    }

    try {
        const noteData = {
            user_id: currentPersonalUser.id,
            title,
            content,
            color: selectedNoteColor
        };

        if (currentEditingNote) {
            await supabaseRequest(`notes?id=eq.${currentEditingNote.id}`, 'PATCH', noteData);
        } else {
            await supabaseRequest('notes', 'POST', noteData);
        }

        showNotification('Anotação salva!', 'success');
        closeModal('noteModal');
        await displayNotes();

    } catch (error) {
        showMessage('noteMessages', `Erro ao salvar anotação: ${error.message}`, 'error');
    }
}

async function deleteNote(noteId) {
    if (!confirm('Tem certeza que deseja excluir esta anotação?')) return;
    try {
        await supabaseRequest(`notes?id=eq.${noteId}`, 'DELETE');
        showNotification('Anotação excluída.', 'info');
        await displayNotes();
    } catch (error) {
        showNotification(`Erro ao excluir anotação: ${error.message}`, 'error');
    }
}

async function displayNotes() {
    if (!currentPersonalUser) return;
    const notesList = document.getElementById('notesList');
    notesList.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando anotações...</div>';
    
    try {
        const { data: userNotes } = await supabaseRequest(
            `notes?user_id=eq.${currentPersonalUser.id}&select=*&order=updated_at.desc`, 'GET'
        );

        if (userNotes.length === 0) {
            notesList.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhuma anotação pessoal encontrada.</p>';
            return;
        }

        notesList.innerHTML = userNotes.map(note => `
            <div class="note-card border-l-4 p-4 rounded-lg shadow-sm bg-gray-50" style="border-left-color: ${note.color};">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-semibold text-gray-800">${escapeHTML(note.title)}</h4>
                    <div class="flex space-x-2">
                        <button class="btn btn-primary btn-small" onclick="openNoteModal('${note.id}')">
                            <i data-feather="edit-3" class="h-4 w-4"></i>
                        </button>
                        <button class="btn btn-danger btn-small" onclick="deleteNote('${note.id}')">
                            <i data-feather="trash-2" class="h-4 w-4"></i>
                        </button>
                    </div>
                </div>
                <div class="text-sm text-gray-700">${escapeHTML(note.content)}</div>
                <div class="text-xs text-gray-500 mt-2 border-t pt-2">
                    Modificado: ${new Date(note.updated_at).toLocaleDateString('pt-BR')}
                </div>
            </div>
        `).join('');
        if (typeof feather !== 'undefined') feather.replace();
        
    } catch (error) {
        notesList.innerHTML = '<p class="text-red-500 text-center py-4">Erro ao carregar anotações.</p>';
    }
}


// CONFIGURAÇÕES (Usuários)
async function loadUsers(forceRefresh = false) {
    if (usersCache.length === 0 || forceRefresh) {
        try {
            const { data, error } = await supabaseRequest(
                'users?select=id,username,name,created_at,password&order=name.asc', 'GET'
            );
            if (error) throw error;
            usersCache = data || [];
            updateUserSelects();
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            usersCache = [];
        }
    }
    return usersCache;
}

function updateUserSelects() {
    const filterResponsible = document.getElementById('filterResponsible');
    const allUsersNames = usersCache.map(u => u.name);

    if (filterResponsible) {
        filterResponsible.innerHTML = '<option value="">Todos</option>' +
            allUsersNames.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    }
    
    // Atualiza opções do MultiSelect
    populateMultiSelectOptions('projectResponsibleOptions', allUsersNames, selectedProjectResponsibles, handleProjectResponsibleSelect);
}

// MULTI-SELECT UTILS
function toggleMultiSelect(optionsContainerId) {
    document.getElementById(optionsContainerId).classList.toggle('show');
}

function populateMultiSelectOptions(optionsContainerId, allOptions, selectedValues, onSelectCallback) {
    const container = document.getElementById(optionsContainerId);
    container.innerHTML = '';
    allOptions.forEach(option => {
        const isSelected = selectedValues.includes(option);
        const optionDiv = document.createElement('div');
        optionDiv.textContent = option;
        optionDiv.className = isSelected ? 'selected bg-gray-200 text-gray-800' : 'text-gray-800 hover:bg-gray-100';
        optionDiv.onclick = () => onSelectCallback(option);
        container.appendChild(optionDiv);
    });
}

function handleProjectResponsibleSelect(name) {
    const index = selectedProjectResponsibles.indexOf(name);
    if (index > -1) {
        selectedProjectResponsibles.splice(index, 1);
    } else {
        selectedProjectResponsibles.push(name);
    }
    updateProjectResponsibleDisplay();
}

function updateProjectResponsibleDisplay() {
    const displayDiv = document.getElementById('projectResponsibleTags');
    const allUsersNames = usersCache.map(u => u.name);
    displayDiv.innerHTML = '';
    selectedProjectResponsibles.forEach(name => {
        const tag = document.createElement('span');
        tag.className = 'status-badge status-aprovada bg-blue-100 text-blue-800';
        tag.textContent = name;
        displayDiv.appendChild(tag);
    });
    
    // Atualiza as opções do dropdown aberto (para manter o estado visual)
    populateMultiSelectOptions('projectResponsibleOptions', allUsersNames, selectedProjectResponsibles, handleProjectResponsibleSelect);
}

function updateActivityResponsibleTags(selectElement) {
    const selectedOptions = Array.from(selectElement.selectedOptions).map(opt => opt.value);
    const displayDiv = selectElement.closest('.form-group').querySelector('.text-gray-500');
    if(displayDiv) {
        displayDiv.innerHTML = 'Responsáveis Atuais: ' + selectedOptions.map(name => 
            `<span class="status-badge status-aprovada bg-blue-100 text-blue-800" style="margin-right: 5px;">${escapeHTML(name)}</span>`
        ).join('');
    }
}

// RESTANTE DO CRUD DE USUÁRIOS/SISTEMA
async function addUser() {
    const username = document.getElementById('newUsername').value.toLowerCase().trim();
    const fullName = document.getElementById('newUserFullName').value.trim();
    const password = document.getElementById('newUserPassword').value;

    if (!username || !fullName || !password) {
        showMessage('settingsMessages', 'Preencha todos os campos!', 'error');
        return;
    }

    try {
        await supabaseRequest(
            'users', 'POST', { username, name: fullName, password }
        );
        showMessage('settingsMessages', 'Usuário adicionado com sucesso!', 'success');
        document.getElementById('newUsername').value = '';
        document.getElementById('newUserFullName').value = '';
        document.getElementById('newUserPassword').value = '';
        await displayUsers(true);
    } catch (error) {
        let msg = error.message.includes('23505') ? 'Nome de usuário já existe!' : 'Erro ao adicionar usuário.';
        showMessage('settingsMessages', msg, 'error');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${username}"?`)) return;
    try {
        await supabaseRequest(`users?id=eq.${userId}`, 'DELETE');
        showNotification('Usuário excluído.', 'info');
        await displayUsers(true);
    } catch (error) {
        showNotification(`Erro ao excluir usuário.`, 'error');
    }
}

async function displayUsers(forceRefresh = false) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando usuários...</div>';

    try {
        const usersData = await loadUsers(forceRefresh);

        if (usersData.length === 0) {
            usersList.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum usuário cadastrado.</p>';
            return;
        }

        usersList.innerHTML = usersData.map(user => `
            <div class="user-card p-4 rounded-lg shadow-sm bg-gray-50 flex justify-between items-center border-l-4 border-blue-400">
                <div>
                    <h5 class="font-semibold" style="color: var(--dark);">${escapeHTML(user.name)}</h5>
                    <p class="text-sm text-gray-600">@${escapeHTML(user.username)}</p>
                    <p class="text-xs text-gray-500 mt-1">Criado: ${new Date(user.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <button class="btn btn-danger btn-small" onclick="deleteUser('${user.id}', '${user.name}')">
                    <i data-feather="trash-2" class="h-4 w-4"></i> Excluir
                </button>
            </div>
        `).join('');
        
        if (typeof feather !== 'undefined') feather.replace();

    } catch (error) {
        usersList.innerHTML = '<p class="text-red-500 text-center py-4">Erro ao carregar usuários.</p>';
    }
}

async function displaySystemInfo() {
    const systemInfo = document.getElementById('systemInfo');
    
    // Busca contagens e dados mockados para o Project Manager
    try {
        const [projectsCount, activitiesCount, notesCount, usersCount] = await Promise.all([
             supabaseRequest('projects?select=count', 'GET').then(r => r.length),
             supabaseRequest('activities?select=count', 'GET').then(r => r.length),
             supabaseRequest(`notes?user_id=neq.null&select=count`, 'GET').then(r => r.length), // Conta todas as notas
             supabaseRequest('users?select=count', 'GET').then(r => r.length)
        ]);

        systemInfo.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card bg-blue-100 text-blue-800 p-4 rounded-lg text-center shadow-sm">
                    <h3 class="text-2xl font-bold">${usersCount}</h3>
                    <p class="text-sm">Usuários</p>
                </div>
                <div class="stat-card bg-green-100 text-green-800 p-4 rounded-lg text-center shadow-sm">
                    <h3 class="text-2xl font-bold">${projectsCount}</h3>
                    <p class="text-sm">Projetos</p>
                </div>
                <div class="stat-card bg-yellow-100 text-yellow-800 p-4 rounded-lg text-center shadow-sm">
                    <h3 class="text-2xl font-bold">${activitiesCount}</h3>
                    <p class="text-sm">Atividades</p>
                </div>
                <div class="stat-card bg-purple-100 text-purple-800 p-4 rounded-lg text-center shadow-sm">
                    <h3 class="text-2xl font-bold">${notesCount}</h3>
                    <p class="text-sm">Anotações Pessoais</p>
                </div>
            </div>
            <div class="p-4 bg-gray-50 border rounded-lg mt-4 text-sm text-gray-700">
                <h5 class="font-semibold mb-2" style="color: var(--accent);">🔗 Informações de Conexão</h5>
                <p><strong>Banco:</strong> Supabase/PostgreSQL</p>
                <p><strong>URL:</strong> ${SUPABASE_URL}</p>
                <p><strong>Status:</strong> <span class="text-green-600 font-semibold">🟢 Conectado</span></p>
            </div>
        `;
    } catch (error) {
        systemInfo.innerHTML = '<p class="text-red-500">Erro ao carregar informações do sistema.</p>';
    }
}

// DASHBOARD CHARTS
function renderDashboardContent() {
    const dashboardContent = document.getElementById('dashboardContent');
    if (!projects.length) {
        dashboardContent.innerHTML = '<div class="text-center py-8 text-gray-500">Nenhum projeto cadastrado para gerar o Dashboard.</div>';
        return;
    }
    
    // 1. Cálculo de Indicadores
    const totalProjects = projects.length;
    const completedProjects = projects.filter(p => p.status === 'concluido').length;
    const inProgressProjects = projects.filter(p => p.status === 'em-andamento').length;
    const overdueProjects = projects.filter(p => p.status === 'atrasado').length;
    
    const projectStatusData = projects.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
    }, {});
    
    const projectPriorityData = projects.reduce((acc, p) => {
        const priority = priorityLabels[p.priority];
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, {});
    
    const activityResponsibleData = projects.flatMap(p => p.activities).reduce((acc, a) => {
        if(a.responsible) {
            a.responsible.split(', ').filter(name => name).forEach(name => {
                acc[name] = (acc[name] || 0) + 1;
            });
        }
        return acc;
    }, {});

    // 2. Renderização da Estrutura
    dashboardContent.innerHTML = `
        <div class="summary-cards grid grid-cols-1 md:grid-cols-5 gap-4">
            <div class="stat-card bg-blue-50 border-blue-400 border p-4 rounded-lg shadow-sm text-center">
                <h3 class="text-3xl font-bold text-blue-700">${totalProjects}</h3>
                <p class="text-sm text-gray-600">Total de Projetos</p>
            </div>
            <div class="stat-card bg-green-50 border-green-400 border p-4 rounded-lg shadow-sm text-center">
                <h3 class="text-3xl font-bold text-green-700">${completedProjects}</h3>
                <p class="text-sm text-gray-600">Concluídos</p>
            </div>
            <div class="stat-card bg-yellow-50 border-yellow-400 border p-4 rounded-lg shadow-sm text-center">
                <h3 class="text-3xl font-bold text-yellow-700">${inProgressProjects}</h3>
                <p class="text-sm text-gray-600">Em Andamento</p>
            </div>
            <div class="stat-card bg-red-50 border-red-400 border p-4 rounded-lg shadow-sm text-center">
                <h3 class="text-3xl font-bold text-red-700">${overdueProjects}</h3>
                <p class="text-sm text-gray-600">Atrasados</p>
            </div>
            <div class="stat-card bg-indigo-50 border-indigo-400 border p-4 rounded-lg shadow-sm text-center">
                <h3 class="text-3xl font-bold text-indigo-700">${(totalProjects > 0 ? (completedProjects / totalProjects * 100) : 0).toFixed(0)}%</h3>
                <p class="text-sm text-gray-600">Taxa de Conclusão</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="chart-card bg-white p-6 rounded-lg shadow-md h-96">
                <canvas id="projectsByStatus"></canvas>
            </div>
            <div class="chart-card bg-white p-6 rounded-lg shadow-md h-96">
                <canvas id="projectsByPriority"></canvas>
            </div>
            <div class="chart-card bg-white p-6 rounded-lg shadow-md h-96">
                <canvas id="activitiesByResponsible"></canvas>
            </div>
        </div>
    `;
    
    // 3. Renderiza os Gráficos
    renderCharts(projectStatusData, projectPriorityData, activityResponsibleData);
}

function renderCharts(projectStatusData, projectPriorityData, activityResponsibleData) {
    for (const chartId in charts) {
        if (charts[chartId]) charts[chartId].destroy();
    }
    charts = {};
    
    // Status
    const projectsByStatusCtx = document.getElementById('projectsByStatus').getContext('2d');
    charts.projectsByStatus = new Chart(projectsByStatusCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(projectStatusData).map(key => statusLabels[key] || key),
            datasets: [{
                label: 'Projetos',
                data: Object.values(projectStatusData),
                backgroundColor: Object.keys(projectStatusData).map(key => statusColors[key] || '#cccccc'),
                borderColor: 'white',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
            plugins: { title: { display: true, text: 'Projetos por Status', color: '#374151' }, legend: { display: false } }
        }
    });

    // Prioridade (Doughnut)
    const projectsByPriorityCtx = document.getElementById('projectsByPriority').getContext('2d');
    charts.projectsByPriority = new Chart(projectsByPriorityCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(projectPriorityData),
            datasets: [{
                label: 'Projetos por Prioridade',
                data: Object.values(projectPriorityData),
                backgroundColor: ['#D62828', '#F77F00', '#0077B6', '#00D4AA', '#7a7a7a'],
                borderColor: 'white',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Projetos por Prioridade', color: '#374151' }, legend: { position: 'bottom' } }
        }
    });
    
    // Responsável (Barra Horizontal)
    const activitiesByResponsibleCtx = document.getElementById('activitiesByResponsible').getContext('2d');
    charts.activitiesByResponsible = new Chart(activitiesByResponsibleCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(activityResponsibleData),
            datasets: [{
                label: 'Atividades',
                data: Object.values(activityResponsibleData),
                backgroundColor: '#0077B6',
                borderColor: 'white',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Barra horizontal
            responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true }, y: { grid: { display: false } } },
            plugins: { title: { display: true, text: 'Atividades por Responsável', color: '#374151' }, legend: { display: false } }
        }
    });
}
