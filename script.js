const SUPABASE_URL = 'https://mxtlanpjzenfghsjubzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dGxhbnBqemVuZmdoc2p1YnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NTk0MzksImV4cCI6MjA3NzIzNTQzOX0.RFfy6orSso72v-0GtkSqwt4WJ3XWlLmZkyHoE71Dtdc';

let currentUser = null;
let currentOrg = null; 
let currentProject = null; 
let currentColumns = []; 
let chartInstances = {}; 
let currentNoteId = null; 
let currentGroups = []; 

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('inviteForm')?.addEventListener('submit', handleInviteFormSubmit);
    document.getElementById('perfilForm')?.addEventListener('submit', handlePerfilFormSubmit);
    document.getElementById('createTeamForm')?.addEventListener('submit', handleCreateTeamFormSubmit);
    document.getElementById('joinTeamForm')?.addEventListener('submit', handleJoinTeamFormSubmit);
    document.getElementById('projectForm')?.addEventListener('submit', handleProjectFormSubmit);
    
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const appShell = document.getElementById('appShell');
    
    const sidebarOverlay = document.createElement('div');
    sidebarOverlay.id = 'sidebarOverlay';
    document.body.appendChild(sidebarOverlay);

    if (sidebarToggle && sidebar && appShell) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.innerWidth <= 768) {
                document.body.classList.toggle('sidebar-open');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
        
        sidebarOverlay.addEventListener('click', () => {
             document.body.classList.remove('sidebar-open');
        });

        document.querySelectorAll('.sidebar .nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    document.body.classList.remove('sidebar-open');
                }
            });
        });
    }

    function setupDropdown(buttonId, dropdownId) {
        const button = document.getElementById(buttonId);
        const dropdown = document.getElementById(dropdownId);
        if (!button || !dropdown) return;

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAlreadyOpen = dropdown.classList.contains('open');

            document.querySelectorAll('.dropdown-menu.open, .relative.open').forEach(dd => {
                dd.classList.remove('open');
            });

            if (!isAlreadyOpen) {
                dropdown.classList.toggle('open');
                dropdown.parentElement?.classList.toggle('open');
            }
        });
    }
    setupDropdown('profileDropdownButton', 'profileDropdownMenu');
    setupDropdown('teamSelectorButton', 'teamSelectorMenu');
    
    document.addEventListener('click', (e) => {
        const openDropdown = document.querySelector('.dropdown-menu.open');
        if (openDropdown && !openDropdown.parentElement.contains(e.target)) {
            openDropdown.classList.remove('open');
            openDropdown.parentElement?.classList.remove('open');
        }
    });

    const { createClient } = supabase;
    
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

    window.logout = async () => {
        console.log("Deslogando usuário...");
        currentUser = null;
        currentOrg = null;
        currentProject = null;
        currentColumns = [];
        currentGroups = [];
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token'); 
        localStorage.removeItem('current_org_id'); 
        
        const { error } = await supabaseClient.auth.signOut();
        if (error) console.error("Erro ao deslogar:", error);
    };
});

async function initializeApp(session) {
    
    localStorage.setItem('auth_token', session.access_token);
    
    const authUser = session.user;

    try {
        const endpoint = `usuarios?email=eq.${authUser.email}&select=*,usuario_orgs(org_id,organizacoes(id,nome,invite_code))`; 
        let profileResponse = await supabaseRequest(endpoint, 'GET');

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

        const userOrgs = (currentUser.usuario_orgs || []).map(uo => uo.organizacoes).filter(Boolean);
        currentUser.organizacoes = userOrgs;
        delete currentUser.usuario_orgs;

        if (!currentUser.auth_user_id && authUser.id) {
            console.log(`Corrigindo auth_user_id (NULL) para o usuário: ${currentUser.id}`);
            await supabaseRequest(`usuarios?id=eq.${currentUser.id}`, 'PATCH', {
                auth_user_id: authUser.id
            });
            currentUser.auth_user_id = authUser.id;
        }

        localStorage.setItem('user', JSON.stringify(currentUser));
        
        redirectToDashboard();

    } catch (error) {
        console.error("Erro detalhado na inicialização:", error);
        logout();
    }
}

function redirectToDashboard() {
    if (!currentUser || !currentUser.organizacoes) {
        console.error("Erro fatal: Dados do usuário incompletos.");
        logout();
        return;
    }

    const orgs = currentUser.organizacoes;
    const savedOrgId = localStorage.getItem('current_org_id');

    if (orgs.length === 0) {
        console.log("Nenhuma organização encontrada. Iniciando fluxo de onboarding.");
        openCreateTeamModal(); 
    } else {
        currentOrg = orgs.find(org => org.id === savedOrgId);
        
        if (!currentOrg) {
            currentOrg = orgs[0];
            localStorage.setItem('current_org_id', currentOrg.id);
        }
        
        showMainSystem();
    }
}

function openCreateTeamModal() {
    document.getElementById('appShell').style.display = 'flex';
    document.body.classList.add('system-active');
    document.getElementById('teamOnboardingModal').style.display = 'flex';
    showOnboardingTab('create');
    feather.replace();
}
function openJoinTeamModal() {
    document.getElementById('appShell').style.display = 'flex';
    document.body.classList.add('system-active');
    document.getElementById('teamOnboardingModal').style.display = 'flex';
    showOnboardingTab('join');
    feather.replace();
}

function showOnboardingTab(tabName) {
    if (tabName === 'create') {
        document.getElementById('panelCreateTeam').style.display = 'block';
        document.getElementById('panelJoinTeam').style.display = 'none';
        document.getElementById('tabCreateTeam').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('tabCreateTeam').classList.remove('border-transparent', 'text-gray-500');
        document.getElementById('tabJoinTeam').classList.add('border-transparent', 'text-gray-500');
        document.getElementById('tabJoinTeam').classList.remove('border-blue-600', 'text-blue-600');
    } else {
        document.getElementById('panelCreateTeam').style.display = 'none';
        document.getElementById('panelJoinTeam').style.display = 'block';
        document.getElementById('tabJoinTeam').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('tabJoinTeam').classList.remove('border-transparent', 'text-gray-500');
        document.getElementById('tabCreateTeam').classList.add('border-transparent', 'text-gray-500');
        document.getElementById('tabCreateTeam').classList.remove('border-blue-600', 'text-blue-600');
    }
}

async function handleCreateTeamFormSubmit(event) {
    event.preventDefault();
    const alert = document.getElementById('createTeamAlert');
    const button = event.target.querySelector('button[type="submit"]');
    alert.innerHTML = '';
    button.disabled = true;
    button.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Criando...';

    const teamName = document.getElementById('teamName').value;

    try {
        const newOrgData = {
            nome: teamName,
            created_by: currentUser.id 
        };
        const newOrgResponse = await supabaseRequest('organizacoes', 'POST', newOrgData);
        if (!newOrgResponse || !newOrgResponse[0]) {
            throw new Error("Falha ao criar organização.");
        }
        const newOrg = newOrgResponse[0];

        const linkData = {
            usuario_id: currentUser.id,
            org_id: newOrg.id,
            role: 'admin'
        };
        await supabaseRequest('usuario_orgs', 'POST', linkData);

        currentOrg = newOrg;
        const fullOrg = await supabaseRequest(`organizacoes?id=eq.${newOrg.id}&select=*`, 'GET');
        currentOrg = fullOrg[0];
        
        currentUser.organizacoes.push(currentOrg); 
        localStorage.setItem('user', JSON.stringify(currentUser));
        localStorage.setItem('current_org_id', currentOrg.id); 
        
        document.getElementById('teamOnboardingModal').style.display = 'none'; 
        showMainSystem(); 

    } catch (error) {
        console.error("Erro ao criar time:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
        button.disabled = false;
        button.innerHTML = '<i data-feather="arrow-right" class="h-4 w-4 mr-2"></i> Criar e Continuar';
        feather.replace();
    }
}

async function handleJoinTeamFormSubmit(event) {
    event.preventDefault();
    const alert = document.getElementById('joinTeamAlert');
    const button = event.target.querySelector('button[type="submit"]');
    alert.innerHTML = '';
    button.disabled = true;
    button.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Verificando...';

    const inviteCode = document.getElementById('teamInviteCode').value.toUpperCase();

    try {
        const orgResponse = await supabaseRequest(`organizacoes?invite_code=eq.${inviteCode}&select=id,nome,invite_code`, 'GET');
        if (!orgResponse || orgResponse.length === 0) {
            throw new Error("Código de convite inválido ou não encontrado.");
        }
        const orgToJoin = orgResponse[0];

        if (currentUser.organizacoes.some(org => org.id === orgToJoin.id)) {
             showNotification(`Você já é membro do time "${orgToJoin.nome}". Trocando para ele...`, 'info');
             switchActiveTeam(orgToJoin.id);
             document.getElementById('teamOnboardingModal').style.display = 'none';
             button.disabled = false;
             button.innerHTML = '<i data-feather="log-in" class="h-4 w-4 mr-2"></i> Entrar no Time';
             return;
        }

        const linkData = {
            usuario_id: currentUser.id,
            org_id: orgToJoin.id,
            role: 'membro'
        };
        await supabaseRequest('usuario_orgs', 'POST', linkData);

        currentOrg = orgToJoin;
        currentUser.organizacoes.push(currentOrg); 
        localStorage.setItem('user', JSON.stringify(currentUser));
        localStorage.setItem('current_org_id', currentOrg.id); 
        
        document.getElementById('teamOnboardingModal').style.display = 'none'; 
        showMainSystem(); 

    } catch (error) {
        console.error("Erro ao entrar no time:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
        button.disabled = false;
        button.innerHTML = '<i data-feather="log-in" class="h-4 w-4 mr-2"></i> Entrar no Time';
        feather.replace();
    }
}

async function showMainSystem() {
    document.getElementById('appShell').style.display = 'flex';
    document.body.classList.add('system-active');

    document.getElementById('topBarUserName').textContent = currentUser.nome || 'Usuário';
    document.getElementById('topBarUserAvatar').src = currentUser.profile_picture_url || 'icon.png';
    document.getElementById('dropdownUserName').textContent = currentUser.nome || 'Usuário';
    document.getElementById('dropdownUserEmail').textContent = currentUser.email || '...';
    
    populateTeamSelector();
    updateActiveTeamUI();

    try {
        console.log("🔄 Carregando projeto ativo (Quadro)...");
        await loadActiveProject(); 
        
        if (!currentProject || !currentProject.id) {
            throw new Error("Quadro (projeto) inválido após carregamento");
        }
        if (!currentColumns || currentColumns.length === 0) {
            throw new Error("Nenhuma coluna (status) carregada");
        }
        
        console.log("✅ Quadro carregado com sucesso!");
        console.log("   - Quadro ID (projeto):", currentProject.id);
        console.log("   - Colunas (status):", currentColumns.length);
        console.log("   - Projetos (grupos):", currentGroups.length);
        
        showView('listView', document.querySelector('a[href="#lista"]')); 
        feather.replace();
        
    } catch (err) {
        console.error("❌ Erro ao carregar projeto ativo:", err);
        
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="container mx-auto px-6 py-8">
                <div class="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
                    <div class="flex items-center mb-4">
                        <i data-feather="alert-circle" class="h-6 w-6 text-red-500 mr-3"></i>
                        <h2 class="text-xl font-bold text-red-900">Erro na Inicialização</h2>
                    </div>
                    <p class="text-red-700 mb-4">${escapeHTML(err.message)}</p>
                    <div class="bg-white p-4 rounded border border-red-200 mb-4">
                        <h3 class="font-semibold text-red-900 mb-2">Possíveis causas:</h3>
                        <ul class="list-disc list-inside text-sm text-red-700 space-y-1">
                            <li>Políticas RLS (Row Level Security) não configuradas corretamente no Supabase</li>
                            <li>Usuário sem permissão para criar ou visualizar projetos/quadros</li>
                            <li>Problema de conexão com o banco de dados</li>
                        </ul>
                    </div>
                    <div class="flex gap-3">
                        <button class="btn btn-danger" onclick="logout()">
                            <i data-feather="log-out" class="h-4 w-4 mr-2"></i>
                            Sair e Tentar Novamente
                        </button>
                        <button class="btn btn-secondary" onclick="location.reload()">
                            <i data-feather="refresh-cw" class="h-4 w-4 mr-2"></i>
                            Recarregar Página
                        </button>
                    </div>
                </div>
            </div>
        `;
        feather.replace();
    }
}

function updateActiveTeamUI() {
    if (currentOrg) {
        document.getElementById('topBarProjectName').textContent = currentOrg.nome || 'Time Pessoal';
    } else {
        document.getElementById('topBarProjectName').textContent = 'Espaço Pessoal';
    }
    document.querySelectorAll('#teamSelectorList .team-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.orgId === currentOrg?.id) {
            item.classList.add('active');
        }
    });
}

function populateTeamSelector() {
    const list = document.getElementById('teamSelectorList');
    if (!list) return;

    list.innerHTML = ''; 
    
    currentUser.organizacoes.forEach(org => {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'dropdown-item team-item';
        item.dataset.orgId = org.id;
        item.innerHTML = `<i data-feather="users" class="h-4 w-4 mr-2"></i> ${escapeHTML(org.nome)}`;
        if (org.id === currentOrg?.id) {
            item.classList.add('active');
        }
        item.onclick = (e) => {
            e.preventDefault();
            switchActiveTeam(org.id);
        };
        list.appendChild(item);
    });

    feather.replace();
}

async function switchActiveTeam(orgId) {
    const newOrg = currentUser.organizacoes.find(org => org.id === orgId);
    if (!newOrg || newOrg.id === currentOrg?.id) {
        document.getElementById('teamSelectorMenu').classList.remove('open');
        document.getElementById('teamSelectorButton').parentElement?.classList.remove('open');
        return;
    }

    currentOrg = newOrg;
    localStorage.setItem('current_org_id', currentOrg.id);
    
    console.log(`Trocando para o time: ${currentOrg.nome}`);
    
    updateActiveTeamUI();
    document.getElementById('teamSelectorMenu').classList.remove('open');
    document.getElementById('teamSelectorButton').parentElement?.classList.remove('open');

    try {
        await loadActiveProject(); 
        const activeView = document.querySelector('.view-content.active')?.id || 'listView'; 
        const activeLink = document.querySelector(`.sidebar .nav-item[href="#${activeView.replace('View', '')}"]`);
        showView(activeView, activeLink);
    } catch (err) {
        console.error("Erro ao trocar de time:", err);
        showNotification(`Erro ao carregar dados do time: ${err.message}`, 'error');
    }
}

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
            case 'listView': loadProjectListView(true); break; 
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

async function loadActiveProject() {
    console.log("🔄 Carregando Quadro ativo (projeto)...");
    currentProject = null;
    currentColumns = [];
    currentGroups = [];
    
    const orgFilter = currentOrg?.id ? `org_id=eq.${currentOrg.id}` : `org_id=is.null&created_by=eq.${currentUser.id}`;

    try {
        let projetos = await supabaseRequest(`projetos?${orgFilter}&select=id,nome&limit=1&order=created_at.asc`, 'GET');
        
        const projetosValidos = Array.isArray(projetos) ? projetos.filter(p => p && p.id) : [];

        if (projetosValidos.length === 0) {
            console.warn("⚠️ Nenhum Quadro (projeto) encontrado. Criando 'Meu Primeiro Quadro'...");
            
            const newProject = {
                nome: 'Meu Primeiro Quadro',
                created_by: currentUser.id,
                org_id: currentOrg?.id || null
            };
            
            const createResponse = await supabaseRequest('projetos', 'POST', newProject);
            
            if (!createResponse || !Array.isArray(createResponse) || !createResponse[0] || !createResponse[0].id) {
                console.error("❌ Resposta inválida ao criar quadro:", createResponse);
                throw new Error("Falha ao criar quadro padrão. Verifique as permissões RLS da tabela 'projetos'.");
            }
            
            currentProject = createResponse[0];
            console.log("✅ Quadro criado com sucesso:", currentProject);
        } else {
            currentProject = projetosValidos[0];
            console.log("✅ Quadro encontrado:", currentProject);
        }

        if (!currentProject || !currentProject.id) {
            console.error("❌ Erro fatal: currentProject (Quadro) inválido:", currentProject);
            throw new Error("Não foi possível carregar ou criar um quadro válido. Verifique as políticas RLS do Supabase para a tabela 'projetos'.");
        }

        console.log("✅ Quadro ativo carregado:", currentProject.nome, `(ID: ${currentProject.id})`);

        let cols = await supabaseRequest(`colunas_kanban?projeto_id=eq.${currentProject.id}&select=id,nome,ordem&order=ordem.asc`, 'GET');
        currentColumns = Array.isArray(cols) ? cols.filter(c => c && c.id) : [];

        if (currentColumns.length === 0) {
            console.warn("⚠️ Nenhuma coluna (status) encontrada. Criando colunas padrão...");
            await createDefaultColumns(currentProject.id);
            
            cols = await supabaseRequest(`colunas_kanban?projeto_id=eq.${currentProject.id}&select=id,nome,ordem&order=ordem.asc`, 'GET');
            currentColumns = Array.isArray(cols) ? cols.filter(c => c && c.id) : [];
            
            if (currentColumns.length === 0) {
                throw new Error("Falha ao criar ou buscar colunas (status) padrão. Verifique as políticas RLS da tabela 'colunas_kanban'.");
            }
        }
        
        console.log("✅ Colunas (Status) carregadas:", currentColumns.length);

        let groups = await supabaseRequest(`grupos_tarefas?projeto_id=eq.${currentProject.id}&select=id,nome,ordem,prioridade&order=ordem.asc`, 'GET');
        currentGroups = Array.isArray(groups) ? groups.filter(g => g && g.id) : [];
        
        console.log("✅ Projetos (grupos_tarefas) carregados:", currentGroups.length);

    } catch (error) {
        console.error("❌ Erro fatal ao carregar quadro/colunas/projetos:", error);
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
          console.log("✅ Colunas padrão criadas");
     } catch (error) {
          console.error("❌ Erro ao criar colunas padrão:", error);
     }
}
        
async function loadDashboardView() {
    const view = document.getElementById('dashboardView');
    
    if (chartInstances.ganttChart) {
        chartInstances.ganttChart.destroy();
        chartInstances.ganttChart = null;
    }
    if (chartInstances.statusChart) {
        chartInstances.statusChart.destroy();
        chartInstances.statusChart = null;
    }
    
    if (!currentProject || !currentProject.id) {
        console.error("❌ loadDashboardView: currentProject (Quadro) inválido:", currentProject);
        view.innerHTML = `
            <div class="container mx-auto px-6 py-8">
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
                <div class="alert alert-error">
                    <p>Erro: Quadro não carregado corretamente.</p>
                    <button class="btn btn-primary mt-4" onclick="location.reload()">Recarregar</button>
                </div>
            </div>`;
        return;
    }
    
    if (!currentColumns || currentColumns.length === 0) {
        console.error("❌ loadDashboardView: Colunas (Status) não carregadas");
        view.innerHTML = `
            <div class="container mx-auto px-6 py-8">
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
                <div class="alert alert-error">
                    <p>Erro: Colunas (Status) não carregadas.</p>
                    <button class="btn btn-primary mt-4" onclick="location.reload()">Recarregar</button>
                </div>
            </div>`;
        return;
    }
    
    console.log("📊 Carregando dashboard para quadro:", currentProject.nome);
    
    view.innerHTML = `
        <div class="container mx-auto px-6 py-8">
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
        console.error("❌ Erro ao carregar stats do dashboard:", error);
    }

    renderStatusChart();
    renderGanttChart();
}

async function renderStatusChart() {
    if (chartInstances.statusChart) {
        chartInstances.statusChart.destroy();
        chartInstances.statusChart = null;
    }
    
    if (!currentProject || currentColumns.length === 0) return;
    const ctx = document.getElementById('statusChart')?.getContext('2d');
    if (!ctx) {
        console.warn("Canvas 'statusChart' não encontrado para renderizar.");
        return;
    }

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const counts = await Promise.all(currentColumns.map(async (col) => {
            const { count } = await supabaseRequest(`tarefas?${projectFilter}&coluna_id=eq.${col.id}&select=id`, 'GET', null, { 'Prefer': 'count=exact' });
            return count || 0;
        }));
        const backgroundColors = [ '#0077B6', '#F77F00', '#00D4AA', '#00B4D8', '#90E0EF', '#023047'];
        
        chartInstances.statusChart = new Chart(ctx, {
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
    if (chartInstances.ganttChart) {
        chartInstances.ganttChart.destroy();
        chartInstances.ganttChart = null;
    }
    
    if (!currentProject) return;
    const ctx = document.getElementById('ganttChart')?.getContext('2d');
     if (!ctx) {
        console.warn("Canvas 'ganttChart' não encontrado para renderizar.");
        return;
     }

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

let draggedTask = null;

async function loadKanbanView() {
    const kanbanView = document.getElementById('projetosView'); 
    if (!kanbanView) return;
    
    if (!kanbanView.querySelector('.container')) {
         kanbanView.innerHTML = `<div class="container mx-auto px-6 py-8">${kanbanView.innerHTML}</div>`;
    }
    
    const kanbanBoard = document.getElementById('kanbanBoard');
    if (!kanbanBoard) {
        console.error("Elemento #kanbanBoard não encontrado!");
        return;
    }

    if (!currentProject || currentColumns.length === 0) {
         kanbanBoard.innerHTML = '<div class="alert alert-error col-span-3">Quadro ou colunas não carregados.</div>';
         return;
    }

    kanbanBoard.innerHTML = `<div class="loading col-span-${currentColumns.length}"><div class="spinner"></div> Carregando tarefas...</div>`;

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        
        const taskQuery = `tarefas?${projectFilter}&select=*,assignee:assignee_id(id,nome,profile_picture_url)&order=ordem_na_coluna.asc`;
        console.log("Query Kanban:", taskQuery); 
        const tasks = await supabaseRequest(taskQuery, 'GET');

        if (!tasks) {
             console.warn("[Kanban] NENHUMA TAREFA encontrada.");
        }
        
        kanbanBoard.innerHTML = '';
        
        const fallbackColumnId = currentColumns[0]?.id || null;

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

            if (tasks && tasks.length > 0) {
                const tasksParaEstaColuna = tasks.filter(t => {
                    if (t.coluna_id === coluna.id) {
                        return true;
                    }
                    if (t.coluna_id === null && coluna.id === fallbackColumnId) {
                        console.warn(`[Kanban] Tarefa órfã '${t.titulo}' (coluna_id: null) movida para '${coluna.nome}'`);
                        return true;
                    }
                    return false;
                });

                tasksParaEstaColuna.forEach(task => {
                    const card = createTaskCard(task);
                    columnContentEl.appendChild(card);
                });
            }

            kanbanBoard.appendChild(columnEl);
        });

        feather.replace();

    } catch (error) { 
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
    if (task.assignee) {
        assigneeHtml = `
            <img src="${escapeHTML(task.assignee.profile_picture_url || 'https://placehold.co/24x24/00D4AA/023047?text=JP')}"
                 alt="${escapeHTML(task.assignee.nome)}"
                 title="Atribuído a: ${escapeHTML(task.assignee.nome)}"
                 class="w-5 h-5 rounded-full object-cover border border-gray-200 shadow-sm">
        `;
    } else if (task.assignee_id) {
         assigneeHtml = `
            <span title="Atribuído (ID: ${task.assignee_id})">
                <i data-feather="user" class="w-5 h-5 text-gray-500"></i>
            </span>
        `;
    }

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

document.addEventListener('dragend', () => {
    document.querySelectorAll('.kanban-column-content.drag-over').forEach(col => col.classList.remove('drag-over'));
    if (draggedTask) {
        draggedTask.classList.remove('dragging');
        draggedTask = null;
    }
});
document.addEventListener('dragover', (e) => {
    if (!e.target.closest('.kanban-column-content')) {
         document.querySelectorAll('.kanban-column-content.drag-over').forEach(col => col.classList.remove('drag-over'));
    }
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
                showNotification(`Tarefa movida.`, 'success');
                loadTimelineView(); 
                loadDashboardView();
                loadProjectListView(false); 
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

async function openTaskModal(task = null, defaultColunaId = null, defaultGrupoId = null) { 
     if (!currentProject || currentColumns.length === 0) {
          showNotification("Crie ou selecione um quadro e suas colunas primeiro.", "error");
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
        colunaIdInput.name = 'coluna_id'; 
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
        
        document.getElementById('taskAssignee').value = task.assignee_id || '';
        document.getElementById('taskGroup').value = task.grupo_id || ''; 
        document.getElementById('taskEsforcoPrevisto').value = task.esforco_previsto || '';
        document.getElementById('taskEsforcoUtilizado').value = task.esforco_utilizado || '';
        document.getElementById('taskDataConclusaoReal').value = task.data_conclusao_real || '';

    } else {
        document.getElementById('taskModalTitle').textContent = 'Nova Tarefa';
        document.getElementById('taskId').value = '';
        
        const primeiraColunaId = currentColumns[0]?.id;
        colunaIdInput.value = defaultColunaId || primeiraColunaId || '';
        
        document.getElementById('taskGroup').value = defaultGrupoId || '';
        
        if (!colunaIdInput.value) {
            console.error("CRÍTICO: Não foi possível determinar a coluna (status) padrão para a nova tarefa!");
            document.getElementById('taskAlert').innerHTML = '<div class="alert alert-error">Erro: Colunas (Status) não carregadas. Não é possível criar tarefa.</div>';
        }
    }

    await loadTeamMembersForSelect('taskAssignee', task ? task.assignee_id : null);
    await loadGroupsForSelect('taskGroup', task ? task.grupo_id : (defaultGrupoId || ''));

    modal.style.display = 'flex';
    feather.replace();
}

async function loadTeamMembersForSelect(selectId, selectedUserId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;

    while (select.options.length > 1) {
        select.remove(1);
    }
    select.value = ''; 

    if (!currentOrg?.id) {
        console.warn("Não é possível carregar membros, não há time (org) selecionado.");
        return;
    }

    try {
        const membersData = await supabaseRequest(`usuario_orgs?org_id=eq.${currentOrg.id}&select=usuarios(id,nome)`, 'GET');
        
        if (membersData && membersData.length > 0) {
            membersData.forEach(member => {
                if (member.usuarios) { 
                    const user = member.usuarios;
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.nome;
                    select.appendChild(option);
                }
            });
        }
        if (selectedUserId) {
            select.value = selectedUserId;
        }

    } catch (error) {
        console.error("Erro ao carregar membros do time para o select:", error);
        showNotification("Não foi possível carregar os membros do time.", "error");
    }
}

async function loadGroupsForSelect(selectId, selectedGroupId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const label = document.querySelector(`label[for="${selectId}"]`);
    if (label) label.textContent = 'Projeto:';

    while (select.options.length > 1) { 
        select.remove(1);
    }
    select.options[0].textContent = 'Nenhum projeto'; 
    select.value = '';

    if (currentGroups && currentGroups.length > 0) {
        currentGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.nome; 
            select.appendChild(option);
        });
    }
    
    if (selectedGroupId) {
        select.value = selectedGroupId;
    }
}


async function handleTaskFormSubmit(e) {
    e.preventDefault();
     if (!currentProject || !currentUser || !document.getElementById('taskColunaId').value) {
         showNotification("Erro: Quadro, usuário ou status inválido.", "error");
         return;
     }

    const alert = document.getElementById('taskAlert');
    alert.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Salvando...</div>';

    const taskId = document.getElementById('taskId').value;
    
    let colunaIdFinal = document.getElementById('taskColunaId').value;
    if (colunaIdFinal === '') {
        console.warn("Nenhum ID de coluna (status) encontrado no form, tentando fallback para a primeira coluna...");
        colunaIdFinal = currentColumns[0]?.id || null;
    }

    const taskData = {
        titulo: document.getElementById('taskTitle').value,
        descricao: document.getElementById('taskDescription').value || null,
        data_inicio: document.getElementById('taskStartDate').value || null,
        data_entrega: document.getElementById('taskDueDate').value || null,
        prioridade: document.getElementById('taskPriority').value,
        assignee_id: document.getElementById('taskAssignee').value || null,
        grupo_id: document.getElementById('taskGroup').value || null, 
        esforco_previsto: parseInt(document.getElementById('taskEsforcoPrevisto').value) || null,
        esforco_utilizado: parseInt(document.getElementById('taskEsforcoUtilizado').value) || null,
        data_conclusao_real: document.getElementById('taskDataConclusaoReal').value || null,
        org_id: currentOrg?.id || null,
        projeto_id: currentProject.id, 
        coluna_id: colunaIdFinal, 
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
        loadProjectListView(false); 

    } catch (error) {
        console.error("Erro ao salvar tarefa:", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
    }
}

function openCreateProjectModal() {
    document.getElementById('projectForm').reset();
    document.getElementById('projectAlert').innerHTML = '';
    document.getElementById('projectModal').style.display = 'flex';
    feather.replace();
}

async function handleProjectFormSubmit(e) {
    e.preventDefault();
    const alert = document.getElementById('projectAlert');
    const button = e.target.querySelector('button[type="submit"]');
    alert.innerHTML = '<div class="loading"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div>Salvando...</div>';
    button.disabled = true;

    const projectName = document.getElementById('projectName').value;
    const projectPriority = document.getElementById('projectPriority').value;

    const newOrder = currentGroups.length;

    const projectData = {
        projeto_id: currentProject.id, 
        org_id: currentOrg?.id || null,
        nome: projectName,
        prioridade: projectPriority,
        ordem: newOrder
    };

    try {
        const newProject = await supabaseRequest('grupos_tarefas', 'POST', projectData);
        
        if (newProject && newProject[0]) {
            currentGroups.push(newProject[0]); 
        }

        showNotification(`Projeto "${projectName}" criado!`, 'success');
        closeModal('projectModal');
        loadProjectListView(false); 
    } catch (error) {
        console.error("Erro ao criar projeto (grupo):", error);
        alert.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
    } finally {
        button.disabled = false;
    }
}

async function loadTimeView() {
    const teamView = document.getElementById('timeView');
    if (!teamView.querySelector('.container')) {
         teamView.innerHTML = `<div class="container mx-auto px-6 py-8">${teamView.innerHTML}</div>`;
    }
    
    const teamBody = document.getElementById('teamTableBody');
    const inviteCodeInput = document.getElementById('teamInviteCodeDisplay');
    teamBody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Carregando membros...</td></tr>';
    inviteCodeInput.value = 'Carregando...';

    const inviteButton = document.querySelector('#timeView button.btn-success');

    try {
        const orgId = currentOrg?.id;
        if (!orgId) {
             teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Funcionalidade de time não disponível no Espaço Pessoal.</td></tr>';
             inviteCodeInput.value = 'N/A';
             if(inviteButton) inviteButton.style.display = 'none';
             return;
        } else {
             if(inviteButton) inviteButton.style.display = 'inline-flex';
        }

        if (currentOrg && currentOrg.invite_code) {
            inviteCodeInput.value = currentOrg.invite_code;
        } else {
            const orgData = await supabaseRequest(`organizacoes?id=eq.${orgId}&select=invite_code`, 'GET');
            if (orgData && orgData[0] && orgData[0].invite_code) {
                inviteCodeInput.value = orgData[0].invite_code;
                currentOrg.invite_code = orgData[0].invite_code; 
            } else {
                inviteCodeInput.value = 'Erro ao carregar';
            }
        }

        const members = await supabaseRequest(`usuario_orgs?org_id=eq.${orgId}&select=role,joined_at,usuarios(id,nome,email,ativo,profile_picture_url)`, 'GET');

        if (!members || members.length === 0) {
            teamBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum membro encontrado neste time.</td></tr>';
            return;
        }

        teamBody.innerHTML = members.map(m => {
            const user = m.usuarios;
            if (!user) return '';
            const statusClass = user.ativo ? 'status-concluído' : 'status-parado';
            const statusText = user.ativo ? 'Ativo' : 'Inativo'; 
            return `
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img src="${escapeHTML(user.profile_picture_url || 'https://placehold.co/32x32/00D4AA/023047?text=JP')}" alt="Foto" class="w-8 h-8 rounded-full object-cover">
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
        inviteCodeInput.value = 'Erro';
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
             throw new Error(errorData.details || errorData.error || errorData.message || 'Falha ao enviar convite');
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
     const confirmation = window.confirm(`Tem certeza que deseja remover este membro do time? Esta ação não pode ser desfeita.`);
     if (!confirmation) {
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

function copyInviteCode() {
    const code = document.getElementById('teamInviteCodeDisplay').value;
    if (!code || code === 'Carregando...' || code === 'Erro' || code === 'N/A') {
        showNotification("Código de convite não disponível.", "error");
        return;
    }
    
    try {
        const textArea = document.createElement("textarea");
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification("Código de convite copiado!", "success");
    } catch (err) {
        console.error('Falha ao copiar:', err);
        showNotification("Falha ao copiar o código.", "error");
    }
}

async function loadNotasView() {
    const notasView = document.getElementById('notasView');
    if (!notasView.querySelector('.container')) {
         notasView.innerHTML = `<div class="container mx-auto px-6 py-8">${notasView.innerHTML}</div>`;
    }
    
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

async function loadCalendarView() {
    const calView = document.getElementById('calendarioView');
    if (!calView.querySelector('.container')) {
         calView.innerHTML = `<div class="container mx-auto px-6 py-8">${calView.innerHTML}</div>`;
    }
    
    const container = document.getElementById('calendarContainer');
    container.innerHTML = `<div class="loading"><div class="spinner"></div> Carregando tarefas...</div>`;

    if (!currentProject) {
        container.innerHTML = '<p class="text-center text-gray-500">Nenhum quadro ativo selecionado.</p>';
        return;
    }

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const tasksWithDate = await supabaseRequest(`tarefas?${projectFilter}&data_entrega=not.is.null&select=id,titulo,data_entrega,prioridade&order=data_entrega.asc`, 'GET');

        if (!tasksWithDate || tasksWithDate.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma tarefa com data de entrega definida neste quadro.</p>';
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

async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
        console.error("Token JWT não encontrado");
        logout();
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    
    const encodedEndpoint = encodeURIComponent(endpoint);
    const url = `${SUPABASE_PROXY_URL}?endpoint=${encodedEndpoint}`;

    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            ...headers 
        }
    };

    if (['POST', 'PATCH'].includes(method) && !config.headers['Prefer']) {
        config.headers['Prefer'] = 'return=representation';
    }

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);
        
        if (headers['Prefer'] === 'count=exact' && response.ok) {
             const countRange = response.headers.get('content-range');
             const count = countRange ? countRange.split('/')[1] : '0';
             return { count: parseInt(count || '0', 10) };
        }
        
        if (response.status === 204 || response.headers.get('content-length') === '0') {
             return null;
        }

        const responseData = await response.json();

        if (!response.ok) {
             let errorData = responseData;
            console.error("Erro Supabase:", errorData);
            const detailedError = errorData.message || errorData.error || `Erro na requisição Supabase (${response.status})`;
            throw new Error(detailedError);
        }

        return responseData;

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

function loadPerfilView() {
    const perfilView = document.getElementById('perfilView');
    if (!perfilView.querySelector('.container')) {
         perfilView.innerHTML = `<div class="container mx-auto px-6 py-8">${perfilView.innerHTML}</div>`;
    }
    
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
    document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'https://placehold.co/96x96/00D4AA/023047?text=JP';

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
         document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'https://placehold.co/96x96/00D4AA/023047?text=JP';
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
            
            document.getElementById('topBarUserName').textContent = currentUser.nome || 'Usuário';
            document.getElementById('topBarUserAvatar').src = currentUser.profile_picture_url || 'https://placehold.co/32x32/00D4AA/023047?text=JP';
            document.getElementById('dropdownUserName').textContent = currentUser.nome || 'Usuário';
            
            if (!newPictureUploaded) {
                 document.getElementById('perfilPicturePreview').src = currentUser.profile_picture_url || 'https://placehold.co/96x96/00D4AA/023047?text=JP';
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

async function loadTimelineView() {
    const timelineView = document.getElementById('timelineView');
    if (!timelineView.querySelector('.container')) {
         timelineView.innerHTML = `<div class="container mx-auto px-6 py-8">${timelineView.innerHTML}</div>`;
    }
    
    const container = document.getElementById('timelineContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando timeline...</div>';

     if (!currentProject) {
        container.innerHTML = '<p class="text-center text-gray-500">Nenhum quadro ativo selecionado.</p>';
        return;
    }

    try {
        const projectFilter = `projeto_id=eq.${currentProject.id}`;
        const events = await supabaseRequest(
            `tarefas?${projectFilter}&select=id,titulo,created_at,updated_at,created_by(nome,profile_picture_url),assignee:assignee_id(nome),coluna:colunas_kanban(nome)&order=updated_at.desc&limit=50`,
            'GET'
        );

        if (!events || events.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">Nenhuma atividade recente encontrada neste quadro.</p>';
            return;
        }

        container.innerHTML = events.map(event => {
            const isCreation = (new Date(event.updated_at).getTime() - new Date(event.created_at).getTime()) < 3000;
            const actionText = isCreation ? 'criou a tarefa' : 'atualizou a tarefa';
            
            const statusName = event.coluna?.nome || 'Status Desconhecido';
            
            const icon = isCreation ? 'plus-circle' : (statusName.toLowerCase() === 'concluído' ? 'check-circle' : 'edit-2');
            const itemClass = isCreation ? 'created' : (statusName.toLowerCase() === 'concluído' ? 'completed' : 'updated');
            
            const userName = event.created_by?.nome || 'Usuário desconhecido';
            const userPic = event.created_by?.profile_picture_url || 'https://placehold.co/32x32/00D4AA/023047?text=JP';

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

async function loadProjectListView(forceReload = false) { 
    console.log("CARREGANDO VIEW DE PROJETOS (LISTA)");
    const container = document.getElementById('projectListContainer');
    const tbody = document.getElementById('projectListBody');
    
    if (!tbody || !container) {
        console.error("Erro fatal: Elementos da tabela de projeto não encontrados no app.html.");
        return;
    }

    const loadingHTML = `
        <tr id="projectListLoading">
            <td colspan="6">
                <div class="loading" style="color: #94a3b8; background: #1e293b; padding: 40px 0;">
                    <div class="spinner" style="border-top-color: var(--primary);"></div>
                    Carregando projetos...
                </div>
            </td>
        </tr>`;
    tbody.innerHTML = loadingHTML;

    try {
        if (forceReload || currentGroups.length === 0) {
            console.log("Forçando recarga de grupos/projetos...");
            await loadActiveProject(); 
        }

        if (!currentProject) {
            throw new Error("Nenhum quadro ativo selecionado.");
        }

        const projectFilter = `projeto_id=eq.${currentProject.id}`;

        const query = `grupos_tarefas?${projectFilter}&select=id,nome,prioridade,tarefas(*,assignee:assignee_id(id,nome,profile_picture_url),status:coluna_id(id,nome))&order=ordem.asc&tarefas.order=ordem_na_coluna.asc`;
        
        console.log("Query Lista de Projetos:", query);
        const projectsList = await supabaseRequest(query, 'GET');

        const tasksWithoutGroupQuery = `tarefas?${projectFilter}&grupo_id=is.null&select=*,assignee:assignee_id(id,nome,profile_picture_url),status:coluna_id(id,nome)&order=ordem_na_coluna.asc`;
        
        console.log("Query Tarefas Sem Grupo:", tasksWithoutGroupQuery);
        const tasksWithoutGroup = await supabaseRequest(tasksWithoutGroupQuery, 'GET');

        tbody.innerHTML = '';

        if (projectsList && projectsList.length > 0) {
            projectsList.forEach(project => {
                if (project.tarefas && project.tarefas.length > 0) {
                    project.tarefas.sort((a, b) => (a.ordem_na_coluna || 0) - (b.ordem_na_coluna || 0));
                }
                
                tbody.appendChild(createProjectHeaderRow(project));
                if (project.tarefas && project.tarefas.length > 0) {
                    project.tarefas.forEach(task => {
                        tbody.appendChild(createTaskDataRow(task));
                    });
                }
                tbody.appendChild(createAddTaskRow(project.id));
            });
        }

        if (tasksWithoutGroup && tasksWithoutGroup.length > 0) {
            const noGroupProject = {
                id: 'no-group',
                nome: 'Tarefas sem Projeto',
                prioridade: 'baixa',
                tarefas: tasksWithoutGroup || []
            };
            tbody.appendChild(createProjectHeaderRow(noGroupProject));
            tasksWithoutGroup.forEach(task => {
                tbody.appendChild(createTaskDataRow(task));
            });
            tbody.appendChild(createAddTaskRow(null)); 
        }
        
        if (tbody.innerHTML === '') {
             tbody.innerHTML = `<tr><td colspan="6" class="text-center p-8 text-gray-400">Nenhum projeto ou tarefa encontrada. Clique em "Novo Projeto" para começar.</td></tr>`;
        }

        feather.replace();

    } catch (error) {
        console.error("Erro ao carregar lista de projetos:", error);
        tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-error m-4">Erro ao carregar lista: ${escapeHTML(error.message)}</div></td></tr>`;
    }
}

function createProjectHeaderRow(project) {
    const tr = document.createElement('tr');
    tr.className = 'project-header-row expanded'; 
    tr.dataset.projectId = project.id;
    tr.onclick = (e) => {
        if (e.target.closest('.btn-icon-task')) return;
        toggleProjectGroup(project.id);
    };

    const taskCount = project.tarefas?.length || 0;
    const priority = project.prioridade || 'baixa';

    tr.innerHTML = `
        <td colspan="6">
            <div class="project-header-content">
                <i data-feather="chevron-down" class="h-5 w-5 project-toggle"></i>
                <span class="project-priority-dot priority-${priority}" title="Prioridade: ${priority}"></span>
                <span class="project-title">${escapeHTML(project.nome)}</span>
                <span class="project-task-count">(${taskCount} ${taskCount === 1 ? 'Tarefa' : 'Tarefas'})</span>
                <button class="btn-icon-task" title="Adicionar tarefa a este projeto" onclick="event.stopPropagation(); openTaskModal(null, null, '${project.id === 'no-group' ? '' : project.id}')">
                    <i data-feather="plus" class="h-4 w-4"></i>
                </button>
            </div>
        </td>
    `;
    return tr;
}

function createTaskDataRow(task) {
    const tr = document.createElement('tr');
    tr.className = 'task-data-row';
    tr.dataset.taskId = task.id;
    tr.dataset.projectId = task.grupo_id || 'no-group';
    
    let assigneeHtml = '';
    if (task.assignee) {
        assigneeHtml = `
        <div class="person-cell" onclick="openAssigneeModal('${task.id}')">
            <img src="${escapeHTML(task.assignee.profile_picture_url || 'https://placehold.co/24x24/00D4AA/023047?text=JP')}" alt="${escapeHTML(task.assignee.nome)}">
            <span>${escapeHTML(task.assignee.nome)}</span>
        </div>`;
    } else {
        assigneeHtml = `
        <div class="person-cell person-unassigned" onclick="openAssigneeModal('${task.id}')">
            <i data-feather="user-plus" class="h-4 w-4"></i>
        </div>`;
    }

    const status = task.status ? task.status.nome.toLowerCase().replace(/ /g, '-') : 'a-fazer';
    const statusText = task.status ? task.status.nome : 'A Fazer';
    let statusHtml = `
        <div class="status-box status-${status}" onclick="openStatusModal(event, '${task.id}', '${status}')">
            ${escapeHTML(statusText)}
        </div>`;

    let timelineHtml = '<div class="timeline-box" onclick="openTimelineModal(\''+task.id+'\')">';
    if (task.data_inicio && task.data_entrega) {
        const start = new Date(task.data_inicio).getTime();
        const end = new Date(task.data_entrega).getTime();
        const today = new Date().getTime();
        const totalDuration = (end - start) > 0 ? (end - start) : 1; 
        const elapsed = today - start;
        let progress = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));

        const color = (status === 'concluído' || status === 'feito') ? '#059669' : '#f59e0b';
        
        timelineHtml += `<div class="timeline-bar" style="background-color: ${color}; width: ${progress}%;"></div>`;
        timelineHtml += `<span class="timeline-text">${formatDateRange(task.data_inicio, task.data_entrega)}</span>`;
    } else {
         timelineHtml += `<span class="timeline-text">-</span>`;
    }
    timelineHtml += '</div>';

    const effort = task.esforco_previsto ? `${task.esforco_previsto}h` : '-';

    const today = new Date(); today.setHours(0,0,0,0);
    const dueDate = task.data_entrega ? new Date(task.data_entrega + 'T00:00:00') : null;
    const doneDate = task.data_conclusao_real ? new Date(task.data_conclusao_real + 'T00:00:00') : null;
    
    let completionHtml = '<div class="completion-status status-na"><i data-feather="minus" class="h-4 w-4"></i><span>N/A</span></div>';
    
    if (status === 'concluído' || status === 'feito') {
        if (doneDate && dueDate && doneDate > dueDate) {
            completionHtml = '<div class="completion-status status-atrasado"><i data-feather="check" class="h-4 w-4"></i><span>Feito (Atrasado)</span></div>';
        } else {
            completionHtml = '<div class="completion-status status-feito-a-tempo"><i data-feather="check" class="h-4 w-4"></i><span>Feito a tempo</span></div>';
        }
    } else if (dueDate && dueDate < today) {
         completionHtml = '<div class="completion-status status-atrasado"><i data-feather="clock" class="h-4 w-4"></i><span>Atrasado</span></div>';
    }

    tr.innerHTML = `
        <td class="task-title-cell" onclick="openTaskModal(task)">
            <i data-feather="file-text" class="h-4 w-4"></i> ${escapeHTML(task.titulo)}
        </td>
        <td>${assigneeHtml}</td>
        <td>${statusHtml}</td>
        <td>${timelineHtml}</td>
        <td><div class="effort-cell">${effort}</div></td>
        <td>${completionHtml}</td>
    `;
    return tr;
}

function formatDateRange(start, end) {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const options = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString('pt-BR', options)} - ${e.toLocaleDateString('pt-BR', options)}`;
}

function createAddTaskRow(projectId) {
    const tr = document.createElement('tr');
    tr.className = 'add-task-row';
    tr.dataset.projectId = projectId || 'no-group';
    
    const groupId = (projectId === 'no-group' || !projectId) ? '' : projectId;

    tr.innerHTML = `
        <td colspan="6">
            <div class="add-task-button-dark" onclick="openTaskModal(null, null, '${groupId}')">
                <i data-feather="plus" class="h-4 w-4"></i> Adicionar Tarefa
            </div>
        </td>`;
    return tr;
}

function toggleProjectGroup(projectId) {
    const headerRow = document.querySelector(`.project-header-row[data-project-id="${projectId}"]`);
    const taskRows = document.querySelectorAll(`.task-data-row[data-project-id="${projectId}"]`);
    const addRow = document.querySelector(`.add-task-row[data-project-id="${projectId}"]`);

    if (headerRow.classList.contains('expanded')) {
        headerRow.classList.remove('expanded');
        taskRows.forEach(row => row.style.display = 'none');
        if(addRow) addRow.style.display = 'none';
    } else {
        headerRow.classList.add('expanded');
        taskRows.forEach(row => row.style.display = 'table-row');
        if(addRow) addRow.style.display = 'table-row';
    }
}

function openAssigneeModal(taskId) {
    console.log("Abrir modal de Responsável para task:", taskId);
    showNotification("Modal de responsável ainda não implementado.", "info");
}

function openStatusModal(event, taskId, currentStatus) {
    event.stopPropagation(); 
    console.log("Abrir modal de Status para task:", taskId, "Status atual:", currentStatus);
    
    const statusModal = document.getElementById('statusModal');
    const statusModalContent = document.getElementById('statusModalContent');
    const overlay = document.querySelector('.modal-overlay-transparent');
    
    const rect = event.target.getBoundingClientRect();
    statusModal.style.top = `${rect.bottom + 5}px`;
    statusModal.style.left = `max(10px, min(${rect.left + (rect.width / 2) - 100}px, ${window.innerWidth - 210}px))`;
    
    statusModal.style.display = 'block';
    statusModalContent.style.display = 'block';
    overlay.style.display = 'block';

    statusModalContent.innerHTML = '';
    currentColumns.forEach(col => {
        const statusSlug = col.nome.toLowerCase().replace(/ /g, '-');
        const option = document.createElement('div');
        option.className = `status-option status-box status-${statusSlug}`;
        option.textContent = col.nome;
        option.onclick = () => updateTaskStatus(taskId, col.id);
        statusModalContent.appendChild(option);
    });

    const closeListener = (e) => {
        statusModal.style.display = 'none';
        statusModalContent.style.display = 'none';
        overlay.style.display = 'none';
        overlay.removeEventListener('click', closeListener);
    };
    overlay.addEventListener('click', closeListener);
}

async function updateTaskStatus(taskId, newColunaId) {
     console.log(`Atualizando task ${taskId} para coluna ${newColunaId}`);
     
     const overlay = document.querySelector('.modal-overlay-transparent');
     if(overlay) overlay.click(); 

    try {
        await supabaseRequest(`tarefas?id=eq.${taskId}`, 'PATCH', {
            coluna_id: newColunaId,
            updated_at: new Date().toISOString()
        });
        showNotification(`Status atualizado.`, 'success');
        loadProjectListView(false); 
        loadKanbanView(); 
    } catch (error) {
        console.error("Falha ao atualizar status:", error);
        showNotification('Falha ao atualizar status.', 'error');
    }
}

function openTimelineModal(taskId) {
    console.log("Abrir modal de Timeline para task:", taskId);
    showNotification("Modal de timeline ainda não implementado.", "info");
}

}

{
type: uploaded file
fileName: jptechsolutions-a11y/gerenciadordeatividades/gerenciadordeatividades-e7c94b0b3486b4fea4ca75cd007d9e24cf113f62/api/signup.js
fullText:
// /api/signup.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// IMPORTANTE: Use a Service Key para criar usuários no backend!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
        }

        // Cria o usuário no Supabase Auth
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Define como true para enviar e-mail de confirmação
        });

        if (error) {
            console.error('Erro ao criar usuário:', error.message);
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ user: data.user });

    } catch (error) {
        console.error('Erro no endpoint /api/signup:', error);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
};

}

