// /api/upload.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// --- VERIFICAÇÃO CRÍTICA ---
// Verifique se você criou estes buckets no seu Supabase Storage.
// O bucket 'profile-pictures' DEVE ser PÚBLICO.
const BUCKET_PROFILES = 'profile-pictures';
const BUCKET_TASKS = 'task-attachments';
// --------------------------

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error('ERRO CRÍTICO [upload]: Variáveis de Ambiente SUPABASE_URL, SUPABASE_SERVICE_KEY ou SUPABASE_ANON_KEY estão ausentes/incorretas na Vercel.');
}

const supabaseAnon = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

export default async (req, res) => {
    if (!supabase || !supabaseAnon) {
        return res.status(500).json({ error: 'Configuração interna do servidor incompleta.' });
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // --- Validação de Segurança JWT ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado. Token JWT ausente.' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Não autorizado. Token inválido ou expirado.' });
    }
    console.log(`[upload] Autenticação bem-sucedida para user ID: ${user.id}`);
    // --- Fim da Validação ---

    // --- Lógica de Upload ---
    const fileName = req.query.fileName || `arquivo_${Date.now()}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const fileType = req.query.fileType || 'anexo_tarefa'; // Tipos: anexo_tarefa, profile_picture

    let bucketName = BUCKET_TASKS; // Padrão
    let filePath = '';
    const timestamp = Date.now();

    // Define pasta e bucket com base no tipo
    if (fileType === 'profile_picture') {
        bucketName = BUCKET_PROFILES;
        // Salva na pasta do usuário com nome único (timestamp) para evitar sobrescrita e cache
        filePath = `${user.id}/${timestamp}_${fileName}`;
    } else if (fileType === 'anexo_tarefa') {
        const taskId = req.query.taskId;
        if (!taskId) {
            return res.status(400).json({ error: 'ID da Tarefa não especificado para anexo.' });
        }
        bucketName = BUCKET_TASKS;
        filePath = `${taskId}/${timestamp}_${fileName}`;
    } else {
        return res.status(400).json({ error: 'Tipo de arquivo inválido.' });
    }
    
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

    try {
        console.log(`[upload] Tentando POST para bucket: ${bucketName}, path: ${filePath}`);

        // Envia o arquivo usando a Service Key (seguro, feito no backend)
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

        if (!response.ok) {
            const errorBody = await response.text();
             console.error(`[upload] Erro ${response.status} do Supabase Storage:`, errorBody);
            return res.status(response.status).json({ error: 'Falha no upload do Supabase', details: errorBody });
        }

        console.log(`[upload] Upload para ${filePath} concluído.`);

        // --- Obter URL Pública ---
        // Isso SÓ FUNCIONA se o bucket (ex: 'profile-pictures') estiver marcado como PÚBLICO
        const { data: urlData, error: urlError } = supabase
            .storage
            .from(bucketName)
            .getPublicUrl(filePath);

        if (urlError || !urlData || !urlData.publicUrl) {
            console.error('[upload] Erro ao obter URL pública:', urlError?.message);
            throw new Error(`Arquivo salvo, mas falha ao obter URL pública. O bucket '${bucketName}' é público?`);
        }

        console.log(`[upload] URL Pública obtida: ${urlData.publicUrl}`);
        return res.status(200).json({ publicUrl: urlData.publicUrl });

    } catch (error) {
        console.error('[upload] Erro geral:', error);
        return res.status(500).json({ error: 'Falha interna no servidor durante o upload', details: error.message });
    }
};

export const config = { api: { bodyParser: false } };
