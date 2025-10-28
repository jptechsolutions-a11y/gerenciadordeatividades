// api/proxy.js

// As chaves são carregadas das Variáveis de Ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

export default async (req, res) => {
    console.log("=== PROXY REQUEST ===");
    console.log("Method:", req.method);
    console.log("Query params:", req.query);
    console.log("Headers:", req.headers);
    
    // --- VERIFICAÇÃO CRÍTICA DE VARIÁVEIS ---
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("ERRO CRÍTICO: Variáveis SUPABASE_URL ou SUPABASE_ANON_KEY ausentes");
        return res.status(500).json({ 
            error: 'Falha de Configuração do Servidor', 
            details: 'Variáveis de ambiente do Supabase não configuradas' 
        });
    }

    const { endpoint } = req.query;
    const { method, body } = req;
    
    // VERIFICAÇÃO INICIAL DE ENDPOINT
    if (!endpoint) {
        console.error("Endpoint não especificado");
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    // IMPORTANTE: Decodificar o endpoint
    const decodedEndpoint = decodeURIComponent(endpoint);
    console.log("Endpoint decodificado:", decodedEndpoint);

    // 1. MIDDLEWARE DE SEGURANÇA: EXTRAIR E VALIDAR O JWT
    const authHeader = req.headers.authorization;
    
    // Verifica se o cabeçalho de autorização está presente
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("Token JWT não encontrado no header");
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }

    // Extrai o token
    const userJwt = authHeader.split(' ')[1];
    console.log("Token JWT extraído (primeiros 20 chars):", userJwt.substring(0, 20) + "...");
    
    // 2. CONSTRUÇÃO DA URL FINAL
    // Se o endpoint já tem '?', não adiciona '/rest/v1/' pois já é um endpoint completo
    let fullSupabaseUrl;
    if (decodedEndpoint.includes('?')) {
        // Endpoint já está completo com query params
        fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${decodedEndpoint}`;
    } else {
        // Endpoint simples, precisa construir a query
        const searchParams = new URLSearchParams(req.url.split('?')[1]);
        searchParams.delete('endpoint'); // Remove o parâmetro 'endpoint' que é só para o proxy
        
        const queryString = searchParams.toString();
        fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${decodedEndpoint}${queryString ? '?' + queryString : ''}`;
    }
    
    console.log("URL final para Supabase:", fullSupabaseUrl);
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${userJwt}`, // Token do usuário para RLS
            'apiKey': SUPABASE_ANON_KEY, // Chave ANÔNIMA para API REST
            'Prefer': 'return=representation' // Retorna os dados após insert/update
        }
    };

    // Adiciona body se necessário
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
        options.body = JSON.stringify(body);
        console.log("Body sendo enviado:", options.body);
    }
    
    // 4. EXECUÇÃO E TRATAMENTO DE ERROS
    try {
        console.log("Fazendo requisição para Supabase...");
        const response = await fetch(fullSupabaseUrl, options);
        
        const responseBodyText = await response.text();
        console.log("Status da resposta:", response.status);
        console.log("Resposta (primeiros 200 chars):", responseBodyText.substring(0, 200));
        
        // Define o content-type da resposta
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        if (!response.ok) {
            console.error("Resposta não OK do Supabase:", response.status);
            let errorJson;
            try { 
                errorJson = JSON.parse(responseBodyText);
                console.error("Erro parseado:", errorJson);
            } catch (e) { 
                console.error("Não foi possível parsear erro como JSON");
                return res.status(response.status).send(responseBodyText || 'Erro desconhecido do Supabase');
            }
            return res.status(response.status).json(errorJson);
        }

        // Resposta bem-sucedida
        if (responseBodyText) {
            try {
                const jsonData = JSON.parse(responseBodyText);
                console.log("Dados retornados com sucesso, quantidade de registros:", Array.isArray(jsonData) ? jsonData.length : 1);
                res.status(response.status).json(jsonData);
            } catch (e) {
                console.error("Erro ao parsear resposta como JSON:", e);
                res.status(response.status).send(responseBodyText);
            }
        } else {
            console.log("Resposta vazia do Supabase");
            res.status(response.status).end();
        }

    } catch (error) {
        console.error('[Proxy] Erro crítico ao processar requisição:', error);
        res.status(500).json({ 
            error: 'Falha interna do proxy', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
