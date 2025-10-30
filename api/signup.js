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
