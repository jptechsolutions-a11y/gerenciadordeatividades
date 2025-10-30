// /api/upload.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Validação inicial... (manter igual)
if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error('ERRO CRÍTICO [upload]: Variáveis de Ambiente SUPABASE_URL, SUPABASE_SERVICE_KEY ou SUPABASE_ANON_KEY estão ausentes/incorretas na Vercel.');
}

const supabaseAnon = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

// ****** MODIFICAÇÃO: Ajustar Nomes de Bucket ******
// É melhor ter buckets separados ou pastas bem definidas
const BUCKET_PROFILES = 'profile-pictures'; // Exemplo: bucket para fotos de perfil
const BUCKET_TASKS = 'task-attachments';   // Exemplo: bucket para anexos de tarefas
// ***********************************************

export default async (req, res) => {
    if (!supabase || !supabaseAnon) {
        return res.status(500).json({ error: 'Configuração interna do servidor incompleta.' });
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // --- Validação de Segurança JWT (manter igual) ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) { /* ... (código igual) ... */ return res.status(401).json({ error: 'Não autorizado. Token JWT ausente.' }); }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) { /* ... (código igual) ... */ return res.status(401).json({ error: 'Não autorizado. Token inválido ou expirado.' }); }
    console.log(`[upload] Autenticação bem-sucedida para user ID: ${user.id}`);
    // --- Fim da Validação ---

    // --- Lógica de Upload ---
    const fileName = req.query.fileName || `arquivo_${Date.now()}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const fileType = req.query.fileType || 'anexo_tarefa'; // Tipos: anexo_tarefa, profile_picture

    let bucketName = BUCKET_TASKS; // Padrão
    let filePath = '';
    const timestamp = Date.now();

    // ****** MODIFICAÇÃO: Definir pasta e bucket com base no tipo ******
    if (fileType === 'profile_picture') {
        bucketName = BUCKET_PROFILES;
        // Salva na pasta do usuário com nome único (timestamp) para evitar sobrescrita e cache
        filePath = `${user.id}/${timestamp}_${fileName}`;
    } else if (fileType === 'anexo_tarefa') {
        const taskId = req.query.taskId; // Precisa passar taskId na query para anexos
        if (!taskId) {
            return res.status(400).json({ error: 'ID da Tarefa não especificado para anexo.' });
        }
        bucketName = BUCKET_TASKS;
        filePath = `${taskId}/${timestamp}_${fileName}`;
    } else {
        return res.status(400).json({ error: 'Tipo de arquivo inválido.' });
    }
    // ***************************************************************


    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

    try {
        console.log(`[upload] Tentando POST para bucket: ${bucketName}, path: ${filePath}`);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': contentType,
                'x-upsert': 'false' // Não sobrescrever
            },
            body: req,
            //@ts-ignore
            duplex: 'half'
        });

        if (!response.ok) { /* ... (tratamento de erro igual) ... */ }

        console.log(`[upload] Upload para ${filePath} concluído.`);

        // Obter URL pública
        const { data: urlData, error: urlError } = supabase
            .storage
            .from(bucketName) // Usa o bucket correto
            .getPublicUrl(filePath);

        if (urlError || !urlData || !urlData.publicUrl) { /* ... (tratamento de erro igual) ... */ }

        console.log(`[upload] URL Pública obtida: ${urlData.publicUrl}`);
        return res.status(200).json({ publicUrl: urlData.publicUrl });

    } catch (error) {
        console.error('[upload] Erro geral:', error);
        return res.status(500).json({ error: 'Falha interna no servidor durante o upload', details: error.message });
    }
};

export const config = { api: { bodyParser: false } }; // Manter igual
