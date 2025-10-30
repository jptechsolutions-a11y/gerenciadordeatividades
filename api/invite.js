// /api/invite.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Carrega as chaves das Variáveis de Ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

// --- Validação Segura das Variáveis de Ambiente ---
let supabaseAdmin;
let resend;
let initError = null;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey || !emailFrom) {
    console.error('ERRO CRÍTICO [invite]: Variáveis de Ambiente (SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, EMAIL_FROM) estão ausentes na Vercel.');
    initError = 'Configuração interna do servidor para convites incompleta.';
} else {
    try {
        // Cliente Admin do Supabase
        supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        // Cliente Resend
        resend = new Resend(resendApiKey);
    } catch (e) {
        console.error('ERRO CRÍTICO [invite]: Falha ao inicializar clientes (Resend/Supabase):', e.message);
        initError = 'Falha ao inicializar serviços de backend.';
    }
}
// --- Fim da Validação ---

export default async (req, res) => {
    // 1. Verifica se a inicialização falhou
    if (initError || !supabaseAdmin || !resend) {
        return res.status(500).json({ error: initError || 'Serviço de convite indisponível.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        // 1. Validar o token do usuário que está convidando (Auth)
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Token inválido' });
        }
        
        // 2. Pegar dados do convite
        const { email, role, org_id, org_name } = req.body;
        if (!email || !role || !org_id) {
            return res.status(400).json({ error: 'Dados do convite incompletos.' });
        }

        // 3. Lógica de Convite
        const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { role: role } // Dados extras
        });
        
        let userIdToAssociate = newUser?.user?.id;
        let userAlreadyExisted = false;

        // --- CORREÇÃO PRINCIPAL AQUI ---
        // Verifica o erro de "usuário já existe" de forma mais robusta
        if (inviteError && inviteError.message && inviteError.message.toLowerCase().includes('user already registered')) {
            console.log(`[invite] Usuário ${email} já existe no Auth. Buscando perfil...`);
            userAlreadyExisted = true;
            
            // Usuário já existe, vamos buscar o ID dele na nossa tabela 'usuarios'
            const { data: existingProfile, error: findProfileError } = await supabaseAdmin.from('usuarios').select('id').eq('email', email).single();
            
            if (findProfileError || !existingProfile) {
                 // Se ele existe no Auth mas não na nossa tabela 'usuarios', ele precisa logar primeiro.
                 console.error(`[invite] Falha: ${email} existe no Auth mas não tem perfil na tabela 'usuarios'.`, findProfileError);
                 // Retorna um erro amigável para o front-end
                 return res.status(400).json({ 
                     error: 'Falha ao associar usuário.', 
                     details: `O usuário ${email} já está cadastrado, mas precisa fazer login no sistema pelo menos uma vez para completar seu perfil antes de ser convidado.` 
                 });
            }
            
            userIdToAssociate = existingProfile.id;
            console.log(`[invite] Perfil encontrado. ID do usuário: ${userIdToAssociate}`);

        } else if (inviteError) {
            // Outro erro no convite (ex: e-mail inválido)
            console.error('[invite] Erro ao tentar convidar (inviteUserByEmail):', inviteError.message);
            throw inviteError;
        }
        // --- FIM DA CORREÇÃO ---
        
        // B. Associa o usuário (novo ou existente) à Organização (Time)
        if (!userIdToAssociate) {
            console.error('[invite] Erro fatal: userIdToAssociate está nulo após a lógica de convite.');
            throw new Error('Não foi possível obter o ID do usuário para associar ao time.');
        }

        const { error: assocError } = await supabaseAdmin.from('usuario_orgs').insert({
            usuario_id: userIdToAssociate,
            org_id: org_id,
            role: role // Salva a função no time
        });

        if (assocError) {
            // Verifica se o erro é de duplicidade (usuário já está no time)
            if (assocError.code === '23505') { // Código de violação de constraint unique
                 console.warn(`[invite] Usuário (ID: ${userIdToAssociate}) já está no time (ID: ${org_id}).`);
                 // Não lança erro, considera sucesso parcial
            } else {
                // Outro erro de banco de dados
                console.error('[invite] Erro ao inserir em usuario_orgs:', assocError.message);
                throw new Error(`Erro ao associar usuário ao time: ${assocError.message}`);
            }
        }
        
        // C. (Opcional) Enviar um e-mail personalizado
        // Só envia se o usuário foi recém-convidado (não se já existia)
        if (!userAlreadyExisted && newUser?.user) {
            console.log(`[invite] Enviando e-mail de boas-vindas para ${email}`);
            await resend.emails.send({
                from: emailFrom,
                to: email,
                subject: `Você foi convidado para o time ${org_name} no JProjects!`,
                html: `<p>Olá!</p><p>Você foi convidado por ${user.email} para se juntar ao time <strong>${org_name}</strong> no JProjects.</p><p>Acesse o JProjects para começar.</p>`
            });
        }


        res.status(200).json({ message: 'Convite enviado e usuário associado ao time.' });

    } catch (error) {
        console.error('Erro na API /api/invite (catch principal):', error);
        // Garante que a mensagem de erro detalhada seja enviada
        res.status(500).json({ error: 'Falha ao processar o convite.', details: error.message });
    }
};

