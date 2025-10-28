// /api/request-access.js
import { Resend } from 'resend';

// --- CARREGA CHAVES DAS VARIÁVEIS DE AMBIENTE (SEGURO) ---
// Estas linhas leem os valores seguros configurados no painel da Vercel.
// As chaves NUNCA ficam escritas diretamente aqui no código.
const resendApiKey = process.env.RESEND_API_KEY; // <-- Lê a chave secreta Resend da Vercel
const adminEmail = process.env.ADMIN_EMAIL;     // <-- Lê o e-mail do Admin da Vercel
const emailFrom = process.env.EMAIL_FROM;       // <-- Lê o e-mail Remetente da Vercel
// --- FIM DO CARREGAMENTO SEGURO ---

// Validação inicial (no momento em que a API carrega no servidor)
if (!resendApiKey || !adminEmail || !emailFrom) {
    // Este log aparece nos logs da Vercel se alguma variável faltar
    console.error('ERRO CRÍTICO [request-access]: Variáveis de Ambiente RESEND_API_KEY, ADMIN_EMAIL ou EMAIL_FROM estão ausentes/incorretas na Vercel.');
}

// Inicializa o cliente Resend (APENAS se a chave API foi carregada com sucesso)
// A chave secreta (resendApiKey) é passada aqui, mas ela veio do process.env
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export default async (req, res) => {
    // 1. Verifica se tudo foi carregado corretamente das Variáveis de Ambiente
    if (!resend || !adminEmail || !emailFrom) {
        // Retorna um erro genérico para o cliente, mas o log no servidor (acima) tem o detalhe.
        return res.status(500).json({ error: 'Configuração interna do servidor para envio de e-mail incompleta.' });
    }

    // 2. Permite apenas método POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']); // Informa ao cliente qual método é permitido
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const { nome, email, motivo } = req.body;

        // 3. Validação rigorosa dos inputs recebidos do formulário
        if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 100) {
            return res.status(400).json({ error: 'Nome inválido ou ausente (máx 100 caracteres).' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Validação básica de formato de e-mail
        if (!email || typeof email !== 'string' || !emailRegex.test(email) || email.length > 100) {
            return res.status(400).json({ error: 'E-mail inválido ou ausente (máx 100 caracteres).' });
        }
        if (!motivo || typeof motivo !== 'string' || motivo.trim().length === 0 || motivo.length > 500) {
            return res.status(400).json({ error: 'Motivo/Justificativa inválido ou ausente (máx 500 caracteres).' });
        }

        // 4. Sanitiza os inputs para segurança extra antes de usar no e-mail
        // (Recomendado ter uma função `escapeHTML` aqui ou usar uma biblioteca)
        const escapeHTML = (str) => {
             if (str === null || str === undefined) return '';
             return String(str)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
        };
        const safeNome = escapeHTML(nome.trim());
        const safeEmail = escapeHTML(email.trim());
        const safeMotivo = escapeHTML(motivo.trim()).replace(/\n/g, '<br>'); // Preserva quebras de linha

        console.log(`[request-access] Recebida solicitação de ${safeNome} (${safeEmail})`);

        // 5. Monta o conteúdo do e-mail para o administrador (com dados sanitizados)
        const subject = `Nova Solicitação de Acesso - Controle de Baixas`;
        const emailBodyHtml = `
            <h1>Nova Solicitação de Acesso</h1>
            <p>Um novo usuário solicitou acesso ao sistema Controle de Baixas:</p>
            <ul>
                <li><strong>Nome:</strong> ${safeNome}</li>
                <li><strong>E-mail:</strong> ${safeEmail}</li>
                <li><strong>Motivo/Justificativa:</strong></li>
            </ul>
            <p style="padding: 10px; border-left: 3px solid #ccc; background-color: #f9f9f9;">${safeMotivo}</p>
            <hr>
            <p><strong>Ação Necessária:</strong> Para conceder acesso, crie uma conta para este usuário no painel de Autenticação do Supabase e, em seguida, edite o perfil dele no sistema ("Gerenciar Usuários") para atribuir o grupo (Role) e as filiais corretas.</p>
        `;
        const emailBodyText = `
            Nova Solicitação de Acesso - Controle de Baixas\n
            Nome: ${safeNome}\n
            E-mail: ${safeEmail}\n
            Motivo/Justificativa:\n${motivo.trim()}\n\n
            Ação Necessária: Crie a conta no Supabase Auth e edite o perfil no sistema.
        `;

        // 6. Envia o e-mail usando Resend
        // O cliente 'resend' foi inicializado usando a chave da variável de ambiente
        const { data, error } = await resend.emails.send({
            from: emailFrom, // Usa a variável de ambiente EMAIL_FROM
            to: adminEmail, // Usa a variável de ambiente ADMIN_EMAIL
            subject: subject,
            html: emailBodyHtml,
            text: emailBodyText,
            reply_to: safeEmail // Opcional: Facilita a resposta direta ao solicitante
        });

        // 7. Tratamento de Erro do Resend
        if (error) {
            console.error(`[request-access] Erro ao enviar e-mail via Resend para ${adminEmail}:`, error);
            const errorMessage = error.message || 'Falha ao enviar e-mail de notificação.';
            // Retorna o erro específico do Resend aqui, pois não revela dados sensíveis
            return res.status(500).json({ error: errorMessage });
        }

        console.log(`[request-access] E-mail de notificação enviado para ${adminEmail}. ID retornado pelo Resend: ${data?.id}`);

        // 8. Resposta de Sucesso para o cliente
        return res.status(200).json({ message: 'Solicitação de acesso enviada com sucesso!' });

    } catch (error) {
        // Erro inesperado no servidor (ex: erro de código, falha de rede não tratada)
        console.error('[request-access] Erro interno do servidor:', error);
        const safeErrorMessage = (typeof error?.message === 'string') ? error.message : 'Erro interno do servidor.';
        return res.status(500).json({ error: 'Erro interno do servidor ao processar a solicitação.', details: safeErrorMessage });
    }
};
