// --- script.js (AJUSTADO PARA JP PROJECT MANAGER) ---

// --- Variáveis Globais (Mantendo o padrão de nomenclatura) ---
let currentUser = null; 
// Mockado, mas mantido para consistência arquitetônica com a seleção de filial
let selectedFilial = { id: 1, nome: 'Geral', descricao: 'Time Geral' }; 
let usersCache = []; 
let projects = []; 
let selectedProjectResponsibles = [];
let currentPersonalUser = null; 
let currentEditingNote = null;
let selectedNoteColor = '#00D4AA';
let charts = {};
let calendar = null;

// --- Mapeamento de Status (Simplificado para o PM) ---
const statusLabels = { 'nao-iniciado': 'Não Iniciado', 'em-andamento': 'Em Andamento', 'em-pausa': 'Em Pausa', 'concluido': 'Concluído', 'atrasado': 'Atrasado', 'cancelado': 'Cancelado' };
const statusColors = { 'nao-iniciado': '#7a7a7a', 'em-andamento': '#0077B6', 'em-pausa': '#F77F00', 'concluido': '#00D4AA', 'atrasado': '#D62828', 'cancelado': '#7a7a7a' };
const priorityLabels = { 1: 'Crítica', 2: 'Alta', 3: 'Média', 4: 'Baixa', 5: 'Não Importante' };
const priorityColors = { 1: '#D62828', 2: '#F77F00', 3: '#0077B6', 4: '#00D4AA', 5: '#7a7a7a' };


// --- Inicialização e Bindings ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Liga os botões de modais de Auth
    document.querySelector('a[onclick="openForgotPasswordModal()"]').onclick = (e) => { e.preventDefault(); openForgotPasswordModal(); };
    document.querySelector('a[onclick="openRequestAccessModal()"]').onclick = (e) => { e.preventDefault(); openRequestAccessModal(); };

    // Placeholder para os handlers principais do sistema
    document.getElementById('saveProjectBtn')?.addEventListener('click', saveProject);
    // ... (Outros listeners para o CRUD de projetos) ...
});

// --- Funções de Utilitário (Proxy, Notifications, Modals) ---

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function supabaseRequest(endpoint, method = 'GET', body = null, customHeaders = {}) {
    const authToken = localStorage.getItem('auth_token');
    const url = `/api/proxy?endpoint=${encodeURIComponent(endpoint)}`;
    
    const config = {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken || SUPABASE_ANON_KEY}`, ...customHeaders }
    };
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) { config.body = JSON.stringify(body); }

    try {
        const response = await fetch(url, config);
        if (!response.ok) {
            const errorText = await response.text();
            let errorJson; try { errorJson = JSON.parse(errorText); } catch(e) { errorJson = { message: errorText }; }
            throw new Error(errorJson.message || errorJson.error || `Erro na requisição Supabase (${response.status})`);
        }
        const data = await response.json();
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
    notification.innerHTML = `<div class="notification-header"><span></span></div><div class="notification-body">${escapeHTML(message)}</div>`;
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
    const alertDiv = modal.querySelector('[id$="Alert"]');
    if (alertDiv) alertDiv.innerHTML = '';
}


// --- LÓGICA DE AUTENTICAÇÃO (Vínculo com Auth/project_users) ---

async function handleLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.innerHTML; 
    
    document.getElementById('loginAlert').innerHTML = ''; 
    loginButton.disabled = true;
    loginButton.innerHTML = `<div class="spinner" style="border-width: 2px; width: 20px; height: 20px; border-top-color: white; margin-right: 8px; display: inline-block; animation: spin 1s linear infinite;"></div> CARREGANDO...`;

    const email = document.getElementById('email').value.trim(); 
    const password = document.getElementById('password').value;
    
    try {
        // 1. Chamar a API de Login do Supabase
        const authResponse = await fetch('/api/login', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!authResponse.ok) { throw new Error('Falha na autenticação. E-mail ou senha incorretos.'); }

        const { user: authUser, session: authSession } = await authResponse.json();
        
        localStorage.setItem('auth_token', authSession.access_token);
        
        await new Promise(resolve => setTimeout(resolve, 500)); 
        
        // 2. Buscar/Criar o Perfil do Usuário (project_users)
        const endpoint = `project_users?id=eq.${authUser.id}&select=id,name,role,email`;
        let customProfile = await supabaseRequest(endpoint, 'GET');
        let user = customProfile[0];
        
        if (!user) {
            // Cria o perfil inicial (operacao) se não existir
            const newProfile = { id: authUser.id, name: authUser.email.split('@')[0], role: 'operacao', email: authUser.email };
            await supabaseRequest('project_users', 'POST', newProfile);
            user = newProfile;
        }
        
        currentUser = {
            id: user.id,
            nome: user.name,
            role: user.role,
            filiais: [{ id: 1, nome: 'Geral', descricao: 'Time Geral' }] 
        };
        
        redirectToDashboard();

    } catch (error) {
        console.error("Erro detalhado no login:", error); 
        showMessage('loginAlert', error.message, 'error'); 
        loginButton.disabled = false;
        loginButton.innerHTML = originalButtonText;
    }
}

function redirectToDashboard() {
    if (currentUser) { showMainSystem(); }
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

function logout() {
    currentUser = null;
    localStorage.removeItem('auth_token'); 
    document.body.classList.remove('system-active');

    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    
    document.getElementById('loginForm').reset();
    document.getElementById('loginAlert').innerHTML = '';
    document.querySelector('#loginForm button[type="submit"]').textContent = 'ENTRAR';

    showNotification('Você foi desconectado.', 'info');
}

// --- Handlers de Modais de Login (idênticos ao sistema de Baixas) ---

function openForgotPasswordModal() {
    closeModal('forgotPasswordModal');
    document.getElementById('forgotPasswordModal').style.display = 'flex';
}

function openRequestAccessModal() {
    closeModal('requestAccessModal');
    document.getElementById('requestAccessModal').style.display = 'flex';
}

async function handleForgotPassword(event) {
    event.preventDefault(); 
    const email = document.getElementById('forgotEmail').value.trim();
    const alertContainer = document.getElementById('forgotPasswordAlert');

    if (!alertContainer) return; 
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Enviando...</div>';

    if (!email) { alertContainer.innerHTML = `<div class="alert alert-error">Por favor, digite seu e-mail.</div>`; return; }

    try {
        const response = await fetch('/api/forgot-password', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        if (!response.ok) { console.error("Erro da API forgot-password (backend logado)."); } 

        alertContainer.innerHTML = ''; 
        showNotification('Se o e-mail estiver cadastrado, um link de recuperação foi enviado.', 'success', 6000);
        closeModal('forgotPasswordModal');

    } catch (error) {
        console.error("Erro de rede ao solicitar recuperação de senha:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Não foi possível enviar a solicitação. Verifique sua conexão.</div>`;
    }
}

async function handleRequestAccess(event) {
    event.preventDefault(); 
    const nome = document.getElementById('requestNome').value.trim();
    const email = document.getElementById('requestEmail').value.trim();
    const motivo = document.getElementById('requestMotivo').value.trim();
    const alertContainer = document.getElementById('requestAccessAlert');

    if (!alertContainer || !nome || !email || !motivo) {
        if(alertContainer) alertContainer.innerHTML = `<div class="alert alert-error">Todos os campos são obrigatórios.</div>`;
        return;
    }

    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Enviando solicitação...</div>';

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

        alertContainer.innerHTML = '';
        showNotification('Solicitação de acesso enviada com sucesso! Aguarde a aprovação do administrador.', 'success', 6000);
        closeModal('requestAccessModal');

    } catch (error) {
        console.error("Erro ao solicitar acesso:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao enviar: ${escapeHTML(error.message)}</div>`;
    }
}

// --- Funções do CORE (UI/Navegação/CRUD - Placeholder) ---

function filterSidebarNav() {
    // Implementa a lógica de filtragem do menu baseada em currentUser.role
    const navItems = document.querySelectorAll('.sidebar nav .nav-item');
    let firstVisibleLink = null;
    
    navItems.forEach(item => {
        // Lógica de permissões (simples: se não for admin, esconde configurações)
        const roles = item.dataset.role ? item.dataset.role.split(',') : [];
        if (roles.length === 0 || roles.includes(currentUser.role) || currentUser.role === 'admin') {
             item.style.display = 'flex';
             if (!firstVisibleLink && item.getAttribute('href') !== '#settings') { 
                firstVisibleLink = item; 
            }
        } else {
             item.style.display = 'none';
        }
    });

    if (firstVisibleLink) {
        const viewId = firstVisibleLink.getAttribute('href').substring(1) + 'View';
        showView(viewId, firstVisibleLink);
    }
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

    // Carregamento de dados para a view (Substituir com a lógica real do PM)
    switch (viewId) {
        case 'dashboardView': loadDashboard(); break;
        case 'projectsView': clearProjectForm(); loadProjects(); break;
        case 'agendaView': loadAgenda(); break;
        case 'personalView': loadPersonalArea(); break;
        case 'settingsView': loadSettings(); break;
    }

    if (typeof feather !== 'undefined') feather.replace();
}

async function loadDashboard() { 
    // Simulação de carregamento do dashboard
    document.getElementById('dashboardContent').innerHTML = `<div class="loading"><div class="spinner"></div>Carregando Dashboard...</div>`;
    // *Implementação real: Busca projects, calcula indicadores e chama renderCharts*
    document.getElementById('dashboardContent').innerHTML = `
        <div class="alert alert-info">Dashboard pronto! Implemente a função loadProjects() para preencher os dados.</div>
    `;
    // Placeholder para a lista de projetos
    displayProjects();
}

async function loadProjects() {
    // Implementação de busca de projetos (usando projects, activities, project_users)
    // ...
    return projects;
}

function displayProjects() {
    // Implementação de renderização da lista de projetos (Usando projectsList)
    const projectsList = document.getElementById('projectsList');
    if(projectsList) projectsList.innerHTML = `<div class="text-center py-8 text-gray-500">Implemente a função loadProjects() para carregar os dados.</div>`;
}

function clearProjectForm() {
    // Implementação de limpeza de formulário
    document.getElementById('projectFormTitle').textContent = 'Novo Projeto';
    // ... reset de inputs ...
}

function saveProject() {
     // Implementação de salvar (POST/PATCH) projeto e atividades
}

function loadAgenda() {
     // Implementação de carregar eventos e renderizar FullCalendar
}

function loadPersonalArea() {
     // Implementação de carregar a área pessoal (projects/notes)
}

function loadSettings() {
     // Implementação de carregar a tela de configurações (usuários/sistema)
}
// ... (Fim das funções do sistema) ...
