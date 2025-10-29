// /api/invite.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Carrega as chaves das Variáveis de Ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

// Cliente Admin do Supabase
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
// Cliente Resend
const resend = new Resend(resendApiKey);

export default async (req, res) => {
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
            const { data: existingUser, error: findError } = await supabaseAdmin.from('usuarios').select('id').eq('email', email).single();
            if (findError || !existingUser) {
                 throw new Error(`Usuário ${email} já existe no Auth, mas não no perfil.`);
            }
            userIdToAssociate = existingUser.id;
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
            throw new Error(`Erro ao associar usuário ao time: ${assocError.message}`);
        }
        
        // (Opcional) Enviar um e-mail personalizado (além do convite do Supabase)
        await resend.emails.send({
            from: emailFrom,
            to: email,
            subject: `Você foi convidado para o time ${org_name} no JProjects!`,
            html: `<p>Olá!</p><p>Você foi convidado por ${user.email} para se juntar ao time <strong>${org_name}</strong> no JProjects.</p><p>Acesse o JProjects para começar.</p>`
        });


        res.status(200).json({ message: 'Convite enviado e usuário associado ao time.' });

    } catch (error) {
        console.error('Erro na API /api/invite:', error);
        res.status(500).json({ error: 'Falha ao processar o convite.', details: error.message });
    }
};
