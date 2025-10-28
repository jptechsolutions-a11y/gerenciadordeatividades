// /api/login.js
import { createClient } from '@supabase/supabase-js';

// Pega as credenciais das Variáveis de Ambiente
const supabaseUrl = process.env.SUPABASE_URL;
// IMPORTANTE: Aqui usamos a CHAVE ANÓNIMA, pois é a chave correta para LOGIN.
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; 

const supabase = createClient(supabaseUrl, supabaseAnonKey); 

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
        }
        
        // --- FUNÇÃO DE LOGIN SEGURA DO SUPABASE ---
        // Esta função envia o e-mail/senha para o Supabase Auth,
        // que verifica o hash da senha de forma segura.
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Erro de Autenticação Supabase:', error.message);
            // Retorna um erro genérico para não expor detalhes de segurança
            return res.status(401).json({ error: 'Falha na autenticação. Usuário ou senha incorretos.' });
        }
        
        // Retorna o objeto de sessão e usuário que o front-end espera
        return res.status(200).json({ user: data.user, session: data.session });

    } catch (error) {
        console.error('Erro no endpoint /api/login:', error);
        return res.status(500).json({ error: 'Erro interno do servidor durante o login.' });
    }
};
