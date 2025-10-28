// /api/forgot-password.js
import { createClient } from '@supabase/supabase-js';

// --- CARREGA CHAVES DAS VARIÁVEIS DE AMBIENTE (SEGURO) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // <-- Chave Secreta via process.env
// IMPORTANTE: Defina a URL BASE da sua aplicação na Vercel (sem / ao final)
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'URL_DA_SUA_APP_AQUI'; // <-- Use a URL correta do seu site
// --- FIM DO CARREGAMENTO SEGURO ---

// Validação inicial das variáveis
if (!supabaseUrl || !supabaseServiceKey || siteUrl === 'URL_DA_SUA_APP_AQUI') {
    console.error('ERRO CRÍTICO [forgot-password]: Variáveis SUPABASE_URL, SUPABASE_SERVICE_KEY ou APP_URL/NEXT_PUBLIC_SITE_URL ausentes/incorretas.');
}

// Cria o cliente ADMIN do Supabase (APENAS se as chaves existirem)
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
}) : null;

export default async (req, res) => {
    // 1. Verifica se o cliente Admin foi inicializado
    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Configuração interna do servidor incompleta.' });
    }
    // 2. Verifica se a URL do site está configurada (necessária para generateLink)
    if (siteUrl === 'URL_DA_SUA_APP_AQUI') {
        console.error("ERRO CRÍTICO [forgot-password]: A variável de ambiente APP_URL ou NEXT_PUBLIC_SITE_URL precisa ser definida com a URL base da sua aplicação.");
         return res.status(500).json({ error: 'Configuração interna do servidor incompleta (URL do site).' });
    }


    // 3. Permite apenas método POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const { email } = req.body;

        // 4. Validação básica do input
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'E-mail inválido fornecido.' });
        }

        console.log(`[forgot-password] Recebida solicitação para o e-mail: ${email}`);

        // 5. *** CORREÇÃO: Usa generateLink para criar o link de recuperação ***
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery', // Tipo de link: recuperação de senha
            email: email,
            options: {
                redirectTo: `${siteUrl}` // Para onde redirecionar APÓS o reset ser concluído no link do e-mail. Ajuste se precisar de uma página específica.
            }
        });

        // 6. Tratamento de Erro do Supabase
        if (error) {
            console.error(`[forgot-password] Erro do Supabase ao tentar gerar link para ${email}:`, error.message);
            // IMPORTANTE: Resposta genérica por segurança.
        } else {
             // O 'data' contém informações sobre o link gerado e o usuário, mas NÃO o enviamos ao cliente.
             // O Supabase Auth cuidará de enviar o e-mail automaticamente se o template estiver ativo.
             console.log(`[forgot-password] Supabase processou generateLink para ${email}. Link enviado se template ativo.`);
        }

        // 7. Resposta Genérica de Sucesso (Por Segurança)
        return res.status(200).json({ message: 'Se o e-mail estiver cadastrado, um link de recuperação foi enviado.' });

    } catch (error) {
        // Erro inesperado no servidor
        console.error('[forgot-password] Erro interno do servidor:', error);
        return res.status(500).json({ error: 'Erro interno do servidor ao processar a solicitação.' });
    }
};
