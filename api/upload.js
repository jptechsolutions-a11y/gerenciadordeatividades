// /api/upload.js
import { createClient } from '@supabase/supabase-js';

// --- CARREGA CHAVES DAS VARIÁVEIS DE AMBIENTE (SEGURO) ---
// Estas linhas leem os valores seguros configurados no painel da Vercel.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // <-- Chave Secreta via process.env
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;       // <-- Chave Pública (Anon) via process.env
// --- FIM DO CARREGAMENTO SEGURO ---

// Validação inicial (no momento em que a API carrega no servidor)
if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    // Este log aparece nos logs da Vercel se alguma variável faltar
    console.error('ERRO CRÍTICO [upload]: Variáveis de Ambiente SUPABASE_URL, SUPABASE_SERVICE_KEY ou SUPABASE_ANON_KEY estão ausentes/incorretas na Vercel.');
}

// Cliente anônimo APENAS para verificar o JWT do usuário (usa Anon Key)
// Só é criado se as chaves existirem
const supabaseAnon = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Cliente com Service Key para obter a URL pública (usa Service Key)
// Só é criado se as chaves existirem
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

const BUCKET_NAME = 'arquivos-baixas';

export default async (req, res) => {
    // 1. Verifica se os clientes Supabase foram inicializados corretamente
    // (Depende das variáveis de ambiente terem sido carregadas)
    if (!supabase || !supabaseAnon) {
         // Não exponha detalhes no erro retornado ao cliente
        return res.status(500).json({ error: 'Configuração interna do servidor incompleta.' });
    }

    // 2. Permite apenas método POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // --- INÍCIO DA VALIDAÇÃO DE SEGURANÇA ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("[upload] Tentativa de acesso sem Token JWT."); // Log aviso
        return res.status(401).json({ error: 'Não autorizado. Token JWT ausente.' }); // Retorna 401
    }

    const token = authHeader.split(' ')[1];

    // Verifica se o token é válido usando o cliente ANÔNIMO
    // Esta chamada PRECISA da SUPABASE_ANON_KEY configurada na Vercel
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
        console.error("[upload] Erro de autenticação:", authError?.message || 'Usuário não encontrado para o token fornecido.');
        // Retorna 401 Unauthorized se o token for inválido ou expirado
        return res.status(401).json({ error: 'Não autorizado. Token inválido ou expirado.' });
    }
    // Se chegou aqui, o usuário está autenticado. user.id contém o UUID do usuário.
    console.log(`[upload] Autenticação bem-sucedida para user ID: ${user.id}`);
    // --- FIM DA VALIDAÇÃO ---

    // --- Lógica de Upload (continua igual) ---
    const fileName = req.query.fileName || `arquivo_${Date.now()}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const solicitacaoId = req.query.solicitacaoId;
    const fileType = req.query.fileType || 'anexo'; // anexo, foto_retirada, nf_externa

    if (!solicitacaoId) {
         console.warn("[upload] Tentativa de upload sem solicitacaoId.");
         return res.status(400).json({ error: 'ID da solicitação/despesa não especificado.' });
    }

    // Define a pasta com base no tipo
    const folder = fileType === 'foto_retirada' ? 'fotos_retirada' : (fileType === 'nf_externa' ? 'nfs_externas' : 'anexos_baixa');
    const filePath = `${folder}/${solicitacaoId}/${Date.now()}_${fileName}`; // Caminho final no bucket

    // Usa fetch para fazer upload direto com a Service Key (mais robusto para streams)
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;

    try {
        console.log(`[upload] Tentando POST para: ${uploadUrl} (Content-Type: ${contentType})`);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`, // <-- CHAVE DE SERVIÇO para UPLOAD
                'Content-Type': contentType,
                'x-upsert': 'false' // Não sobrescrever se já existir (raro, mas seguro)
            },
            body: req, // Passa o stream da requisição (o arquivo) diretamente
            // @ts-ignore
            duplex: 'half' // Necessário para stream em algumas versões do Node/Fetch
        });

        if (!response.ok) {
            // Se o upload falhar, tenta ler a resposta de erro do Supabase Storage
            let errorBody;
            try {
                errorBody = await response.json();
            } catch (e) {
                errorBody = { message: await response.text() || 'Erro desconhecido do Storage' };
            }
            console.error(`[upload] Erro do Supabase Storage (${response.status}):`, errorBody);
            // Retorna um erro 500 genérico, mas loga o detalhe
            throw new Error(errorBody.message || `Falha no upload para o storage (Status ${response.status}).`);
        }

        console.log(`[upload] Upload para ${filePath} concluído com sucesso.`);

        // Se o upload deu certo, obtem a URL pública usando o cliente Supabase com Service Key
        const { data: urlData, error: urlError } = supabase // Usa o cliente com Service Key
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        if (urlError || !urlData || !urlData.publicUrl) {
             console.error('[upload] Erro ao obter URL pública para:', filePath, urlError);
             // O upload funcionou, mas não conseguimos a URL. Retornamos sucesso parcial?
             // Ou retornamos erro? Vamos retornar erro para consistência.
             throw new Error('Falha ao obter a URL pública do arquivo após upload.');
        }

        console.log(`[upload] URL Pública obtida: ${urlData.publicUrl}`);

        // Retorna sucesso com a URL pública
        return res.status(200).json({ publicUrl: urlData.publicUrl });

    } catch (error) {
        // Captura erros do fetch, do parse do erro, ou da obtenção da URL pública
        console.error('[upload] Erro geral durante o processo de upload:', error);
        // Retorna um erro 500 genérico para o cliente
        return res.status(500).json({ error: 'Falha interna no servidor durante o upload', details: error.message });
    }
};

// Configuração para Vercel NÃO fazer parse do corpo (NECESSÁRIA para stream)
export const config = {
    api: {
        bodyParser: false,
    },
};
