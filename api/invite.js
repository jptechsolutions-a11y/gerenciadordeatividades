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

        // 3. Lógica de Convite (Exemplo)
        // Você pode apenas enviar um convite de "Magic Link"
        // Ou, se o usuário já existir, apenas associá-lo ao time.

        // A. Tenta criar o usuário (ignora se já existe)
        const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { role: role } // Dados extras
        });
        
        let userIdToAssociate = newUser?.user?.id;

        if (inviteError && inviteError.message.includes('User already registered')) {
            // Usuário já existe, vamos apenas buscar o ID dele
            // MODIFICADO: Busca o ID do auth.users, pois pode não existir em 'usuarios' ainda
            const { data: existingAuthUser, error: findAuthError } = await supabaseAdmin.auth.admin.getUserByEmail(email);
            
            if (findAuthError || !existingAuthUser?.user) {
                 throw new Error(`Usuário ${email} já existe no Auth, mas não foi possível buscar os dados (getUserByEmail).`);
            }
            
            // Tenta buscar na tabela 'usuarios'
            const { data: existingProfile, error: findProfileError } = await supabaseAdmin.from('usuarios').select('id').eq('email', email).single();
            
            if (existingProfile) {
                userIdToAssociate = existingProfile.id;
            } else {
                // Se não tem perfil em 'usuarios', usa o ID do Auth.
                // ATENÇÃO: Isso pode falhar se 'usuario_orgs' tiver FK para 'usuarios.id'
                // A melhor solução é garantir que 'initializeApp' no front-end crie o perfil.
                // Por agora, vamos usar o ID do Auth e assumir que a FK (se houver) é para 'auth.users.id'
                // ou que 'usuarios.id' e 'auth.users.id' são os mesmos (o que não é garantido).
                
                // Vamos priorizar a busca na tabela 'usuarios' como estava, mas usar o ID do auth.users se não achar.
                console.warn(`[invite] Usuário ${email} existe no Auth mas não na tabela 'usuarios'. Usando ID do Auth: ${existingAuthUser.user.id}`);
                // Se sua tabela 'usuarios' usa um UUID próprio, e 'usuario_orgs' aponta para ele,
                // você precisará garantir que o perfil seja criado ANTES do convite.
                
                // Vamos manter a lógica original, mas com melhor log de erro:
                if (findProfileError || !existingProfile) {
                    console.error(`[invite] Falha: ${email} existe no Auth mas não tem perfil na tabela 'usuarios'.`, findProfileError);
                    throw new Error(`O usuário ${email} já está cadastrado, mas precisa fazer login pelo menos uma vez para completar seu perfil antes de ser convidado.`);
                }
                userIdToAssociate = existingProfile.id;
            }

        } else if (inviteError) {
            // Outro erro no convite
            throw inviteError;
        }
        
        // B. Associa o usuário (novo ou existente) à Organização (Time)
        const { error: assocError } = await supabaseAdmin.from('usuario_orgs').insert({
            usuario_id: userIdToAssociate,
            org_id: org_id,
            role: role // Salva a função no time
        });

        if (assocError) {
            // Verifica se o erro é de duplicidade
            if (assocError.code === '23505') { // Código de violação de constraint unique
                 console.warn(`[invite] Usuário ${email} (ID: ${userIdToAssociate}) já está no time (ID: ${org_id}).`);
                 // Não lança erro, considera sucesso parcial
            } else {
                throw new Error(`Erro ao associar usuário ao time: ${assocError.message}`);
            }
        }
        
        // (Opcional) Enviar um e-mail personalizado (além do convite do Supabase)
        // Só envia o e-mail personalizado se o usuário foi recém-convidado (não se já existia)
        if (newUser?.user) {
            await resend.emails.send({
                from: emailFrom,
                to: email,
                subject: `Você foi convidado para o time ${org_name} no JProjects!`,
                html: `<p>Olá!</p><p>Você foi convidado por ${user.email} para se juntar ao time <strong>${org_name}</strong> no JProjects.</p><p>Acesse o JProjects para começar.</p>`
            });
        }


        res.status(200).json({ message: 'Convite enviado e usuário associado ao time.' });

    } catch (error) {
        console.error('Erro na API /api/invite:', error);
        res.status(500).json({ error: 'Falha ao processar o convite.', details: error.message });
    }
};
