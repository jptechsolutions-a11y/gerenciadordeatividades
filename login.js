// login.js

// -----------------------------------------------------------------
// CONFIGURAÇÃO: Cole suas chaves públicas do Supabase aqui
// -----------------------------------------------------------------
// Você encontra isso em: Painel Supabase > Settings > API
const SUPABASE_URL = 'https://mxtlanpjzenfghsjubzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dGxhbnBqemVuZmdoc2p1YnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NTk0MzksImV4cCI6MjA3NzIzNTQzOX0.RFfy6orSso72v-0GtkSqwt4WJ3XWlLmZkyHoE71Dtdc';
// -----------------------------------------------------------------

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos da UI
const formTitle = document.getElementById('formTitle');
const formSubtitle = document.getElementById('formSubtitle');
const emailForm = document.getElementById('emailForm');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const emailSubmitBtn = document.getElementById('emailSubmitBtn');
const toggleText = document.getElementById('toggleText');
const toggleLink = document.getElementById('toggleLink');
const loginAlert = document.getElementById('loginAlert');

let isSignUp = false; // Controla se estamos em modo Login ou Cadastro

document.addEventListener('DOMContentLoaded', () => {
    checkHash(); // Verifica se a URL é #signup
    window.addEventListener('hashchange', checkHash); // Ouve mudanças (clique no link)

    googleLoginBtn.addEventListener('click', handleGoogleLogin);
    emailForm.addEventListener('submit', handleEmailFormSubmit);
    toggleLink.addEventListener('click', toggleMode);
supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            window.location.href = 'app.html';
        }
    });
    // Verifica se o usuário já está logado (ex: voltou para a pág de login)
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            window.location.href = 'app.html';
        }
    });
});

function checkHash() {
    isSignUp = (window.location.hash === '#signup');
    updateUI();
}

function toggleMode(e) {
    if (e) e.preventDefault();
    isSignUp = !isSignUp;
    window.location.hash = isSignUp ? '#signup' : '';
    updateUI();
}

function updateUI() {
    loginAlert.innerHTML = '';
    if (isSignUp) {
        formTitle.textContent = 'Criar sua conta';
        formSubtitle.textContent = 'Comece sua jornada de produtividade.';
        emailSubmitBtn.textContent = 'Cadastrar com E-mail';
        toggleText.textContent = 'Já tem uma conta?';
        toggleLink.textContent = 'Entrar';
        toggleLink.href = '#';
    } else {
        formTitle.textContent = 'Acesso ao JProjects';
        formSubtitle.textContent = 'Seu hub de produtividade';
        emailSubmitBtn.textContent = 'Continuar com E-mail';
        toggleText.textContent = 'Não tem uma conta?';
        toggleLink.textContent = 'Cadastre-se';
        toggleLink.href = '#signup';
    }
}

function showAlert(message, type = 'error') {
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    loginAlert.innerHTML = `<div class="alert ${alertClass}">${escapeHTML(message)}</div>`;
}

// Handler do formulário de E-mail (Login ou Cadastro)
async function handleEmailFormSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    setLoading(true);

    try {
        let authResponse;
        if (isSignUp) {
            // Modo Cadastro (Sign Up)
            // Usamos a API /api/signup que você criará
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            authResponse = await response.json();
            if (!response.ok) throw new Error(authResponse.error || authResponse.message);

            showAlert('Cadastro realizado! Por favor, verifique seu e-mail para confirmar a conta.', 'success');

        } else {
            // Modo Login
            // Usando o cliente Supabase JS diretamente
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });
            if (error) throw error;

            // Sucesso! Redireciona para o app principal
            window.location.href = 'app.html';
        }
    } catch (error) {
        console.error("Erro de autenticação:", error.message);
        showAlert(error.message || 'Ocorreu um erro.');
    } finally {
        setLoading(false);
    }
}

// Handler do Login com Google
async function handleGoogleLogin() {
    setLoading(true);
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
       options: {
            redirectTo: window.location.origin + '/app.html' 
        }
    });

    if (error) {
        showAlert(error.message);
        setLoading(false);
    }
    // Se não houver erro, o Supabase cuida do redirecionamento
}

function setLoading(isLoading) {
    emailSubmitBtn.disabled = isLoading;
    googleLoginBtn.disabled = isLoading;
    if (isLoading) {
        emailSubmitBtn.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0 auto;"></div>`;
    } else {
        updateUI(); // Restaura o texto original
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
