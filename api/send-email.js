// /api/send-email.js
import { Resend } from 'resend';

// Pega as chaves das Variáveis de Ambiente
const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

// --- AJUSTE DE SEGURANÇA ---
// A chave de serviço é necessária para buscar dados de forma segura no backend
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// --- FIM DO AJUSTE ---


// --- Configurações de Template ---
const APP_URL = process.env.APP_URL || 'https://seu-app.vercel.app';
// Certifique-se que o logo 'teste.png' esteja acessível publicamente nesta URL
const LOGO_URL = `${APP_URL}/icon.png`; 
const APP_NAME = "Controle de Baixas de Consumo";
const FOOTER_TEXT = `© ${new Date().getFullYear()} JP Tech Solutions. Todos os direitos reservados.`;

// =================================================================
// --- TEMPLATE HTML/TEXTO PROFISSIONAL ---
// (Esta seção não foi alterada)
// =================================================================

/**
 * Gera o HTML final e o Texto Puro para o e-mail.
 * @param {string} subject - O Assunto do e-mail (usado no título do texto)
 * @param {string} preheader - Texto curto para preview do e-mail.
 * @param {string} htmlContent - O conteúdo principal em HTML.
 * @param {string} textContent - O conteúdo principal em Texto Puro.
 * @returns {{html: string, text: string}}
 */
function generateEmailTemplates(subject, preheader, htmlContent, textContent) {
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>${subject}</title>
    <style>
        body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; word-spacing: normal; background-color: #f4f7fa; }
        .container { width: 90%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden; }
        .header { background: #011627; padding: 30px; text-align: center; }
        .header img { max-width: 150px; height: auto; }
        .content { padding: 40px 30px; font-family: Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.6; }
        .content h1 { color: #023047; font-size: 24px; margin-top: 0; margin-bottom: 20px; }
        .content p { margin-bottom: 15px; }
        .content ul { margin-left: 20px; margin-bottom: 20px; padding-left: 0; }
        .content li { margin-bottom: 10px; }
        .button { display: inline-block; padding: 12px 25px; margin: 20px 0; background: linear-gradient(135deg, #00D4AA 0%, #0077B6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; }
        .footer { background-color: #f9fafb; padding: 30px; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #888; }
        .preheader { display: none; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; }
        .details-box { background-color: #f9fafb; border-left: 4px solid #00B4D8; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .details-box h3 { margin-top: 0; color: #023047; }
        .details-box strong { color: #023047; }
        .fotos-grid { display: block; margin-top: 15px; }
        .foto-link { display: inline-block; margin: 5px; padding: 5px; border: 1px solid #ddd; border-radius: 8px; text-decoration: none; }
        .foto-link img { max-width: 250px; height: auto; display: block; }
    </style>
</head>
<body style="margin: 0; padding: 0; -webkit-font-smoothing: antialiased; word-spacing: normal; background-color: #f4f7fa;">
    <span class="preheader" style="display: none; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${preheader}</span>
    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f4f7fa;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <div class="container" style="width: 90%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                    <div class="header" style="background: #011627; padding: 30px; text-align: center;">
                        <img src="${LOGO_URL}" alt="${APP_NAME} Logo" style="max-width: 150px; height: auto;">
                    </div>
                    <div class="content" style="padding: 40px 30px; font-family: Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.6;">
                        ${htmlContent}
                        <a href="${APP_URL}" class="button" style="display: inline-block; padding: 12px 25px; margin: 20px 0; background: linear-gradient(135deg, #00D4AA 0%, #0077B6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Acessar o Sistema</a>
                        <p style="margin-bottom: 15px;">Obrigado,<br>Equipe ${APP_NAME}</p>
                    </div>
                    <div class="footer" style="background-color: #f9fafb; padding: 30px; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #888;">
                        ${FOOTER_TEXT}
                    </div>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const text = `
${subject}
${"=".repeat(subject.length)}

${textContent}

Acesse o sistema em: ${APP_URL}

${FOOTER_TEXT}
    `;
    
    return { html, text };
}

// =================================================================
// --- FUNÇÕES HELPER (BUSCA E FORMATAÇÃO) ---
// =================================================================

/**
 * Função helper para buscar MÚLTIPLOS registros do Supabase.
 */
async function fetchSupabaseQuery(endpoint) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'apikey': SUPABASE_ANON_KEY, 
                // --- AJUSTE DE SEGURANÇA ---
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, // <-- USE SERVICE KEY
                // --- FIM DO AJUSTE ---
                'Accept': 'application/json' 
            },
        });
        if (!response.ok) throw new Error(`Supabase query failed: ${response.statusText}`);
        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar query do Supabase:', endpoint, error);
        return [];
    }
}

/**
 * Função helper para buscar UM ÚNICO registro do Supabase.
 */
async function fetchSupabaseRecord(endpoint) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}${separator}limit=1`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'apikey': SUPABASE_ANON_KEY, 
                // --- AJUSTE DE SEGURANÇA ---
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, // <-- USE SERVICE KEY
                // --- FIM DO AJUSTE ---
                'Accept': 'application/json', 
                'Prefer': 'return=representation' 
            },
        });
        if (!response.ok) throw new Error(`Supabase record failed: ${response.statusText}`);
        const data = await response.json();
        return (Array.isArray(data) && data.length > 0) ? data[0] : null;
    } catch (error) {
        console.error('Erro ao buscar record do Supabase:', endpoint, error);
        return null;
    }
}

/**
 * Helper para formatar uma lista de itens em HTML e TEXTO
 * (Esta função não foi alterada)
 */
function formatarListaItens(itens) {
    if (!itens || itens.length === 0) {
        return { 
            htmlList: '<p>Nenhum item encontrado.</p>', 
            textList: 'Nenhum item encontrado.',
            totalHtml: 'R$ 0,00',
            totalText: 'R$ 0,00'
        };
    }
    
    const totalPedido = itens.reduce((acc, item) => acc + (item.valor_total_solicitado || 0), 0);
    
    let htmlList = '<ul>';
    let textList = '';
    
    itens.forEach(item => {
        const produtoDesc = item.produtos ? `${item.produtos.codigo} - ${item.produtos.descricao}` : 'Produto desconhecido';
        const valorTotalItem = (item.valor_total_solicitado || 0).toFixed(2);
        
        htmlList += `
            <li style="margin-bottom: 10px;">
                <strong>${produtoDesc}</strong><br>
                <small>Qtd: ${item.quantidade_solicitada} | Valor: R$ ${valorTotalItem}</small>
            </li>
        `;
        textList += `* ${produtoDesc}\n  Qtd: ${item.quantidade_solicitada} | Valor: R$ ${valorTotalItem}\n`;
    });
    
    htmlList += '</ul>';
    
    return { 
        htmlList, 
        textList, 
        totalHtml: `R$ ${totalPedido.toFixed(2)}`,
        totalText: `R$ ${totalPedido.toFixed(2)}`
    };
}

// =================================================================
// --- HANDLER PRINCIPAL DA API ---
// (Esta seção não foi alterada)
// =================================================================

export default async (req, res) => {
    if (!EMAIL_FROM) {
        console.error('Erro Crítico: A variável de ambiente EMAIL_FROM não está definida no Vercel.');
        return res.status(500).json({ error: 'Configuração de e-mail do servidor está incompleta.' });
    }
    // --- NOVO CHECK DE SEGURANÇA ---
    if (!SUPABASE_SERVICE_KEY) {
        console.error('Erro Crítico: A variável de ambiente SUPABASE_SERVICE_KEY não está definida.');
        return res.status(500).json({ error: 'Configuração de segurança do servidor está incompleta.' });
    }
    // --- FIM DO CHECK ---

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const payload = req.body;
        console.log('Webhook recebido:', payload.type, 'Tabela:', payload.table, 'Record ID:', payload.record?.id);

        let subject = '';
        let preheader = '';
        let htmlContent = '';
        let textContent = '';
        let toEmails = [];

        // --- LÓGICA PARA A TABELA DE PEDIDOS (solicitacoes_baixa) ---
        if (payload.table === 'solicitacoes_baixa') {
            
            // Evento: Novo Pedido criado
            if (payload.type === 'INSERT') {
                const { id, solicitante_id, filial_id } = payload.record;
                
                // 1. Buscar envolvidos
                const solicitante = await fetchSupabaseRecord(`usuarios?id=eq.${solicitante_id}&select=nome,email`);
                const gestoresData = await fetchSupabaseQuery(`usuario_filiais?filial_id=eq.${filial_id}&select=usuarios(email,role)&usuarios.role=eq.gestor`);
                
                // 2. Buscar Itens
                const itens = await fetchSupabaseQuery(`solicitacao_itens?solicitacao_id=eq.${id}&select=quantidade_solicitada,valor_total_solicitado,produtos(codigo,descricao)`);
                const { htmlList, textList, totalHtml, totalText } = formatarListaItens(itens);

                const solicitanteNome = solicitante?.nome ?? 'Solicitante';
                
                // 3. Definir Destinatários (Gestores + Solicitante em cópia)
                if (gestoresData && gestoresData.length > 0) {
                    // *** CORREÇÃO APLICADA AQUI ***
                    toEmails = gestoresData.map(g => g.usuarios?.email).filter(Boolean);
                }
                if (solicitante?.email) toEmails.push(solicitante.email);

                if (toEmails.length > 0) {
                    subject = `Nova Solicitação de Baixa (#${id}) - Aguardando Aprovação`;
                    preheader = `Pedido #${id} de ${solicitanteNome} aguarda sua aprovação.`;
                    
                    htmlContent = `
                        <h1>Nova Solicitação (#${id})</h1>
                        <p>Olá Gestor,</p>
                        <p>Uma nova solicitação de baixa foi criada por <strong>${solicitanteNome}</strong> e aguarda sua aprovação.</p>
                        <div class="details-box" style="background-color: #f9fafb; border-left: 4px solid #00B4D8; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <h3>Itens do Pedido</h3>
                            ${htmlList}
                            <hr>
                            <p style="margin-bottom: 0;"><strong>Valor Total do Pedido: ${totalHtml}</strong></p>
                        </div>
                    `;
                    
                    textContent = `Olá Gestor,\n\nUma nova solicitação de baixa foi criada por ${solicitanteNome} e aguarda sua aprovação.\n\nItens do Pedido:\n${textList}\n\nValor Total do Pedido: ${totalText}`;
                }
            }
            
            // Evento: Pedido foi Aprovado ou Negado
            else if (payload.type === 'UPDATE') {
                const { id, status, solicitante_id, filial_id } = payload.record;
                const old_status = payload.old_record.status;

                if (status === old_status) {
                    return res.status(200).json({ message: 'Nenhuma mudança de status, e-mail não enviado.' });
                }

                // 1. Buscar Envolvidos
                const solicitante = await fetchSupabaseRecord(`usuarios?id=eq.${solicitante_id}&select=nome,email`);
                // Precisamos dos itens para pegar o nome do aprovador
                const itens = await fetchSupabaseQuery(`solicitacao_itens?solicitacao_id=eq.${id}&select=quantidade_solicitada,valor_total_solicitado,motivo_negacao,produtos(codigo,descricao),usuarios_aprovador:usuarios!solicitacao_itens_aprovador_id_fkey(nome,email)`);
                
                const solicitanteNome = solicitante?.nome ?? 'Solicitante';
                const aprovador = itens[0]?.usuarios_aprovador;
                const aprovadorNome = aprovador?.nome ?? 'Gestor';
                const { htmlList, textList, totalHtml, totalText } = formatarListaItens(itens);

                // 2. Definir Destinatários (Solicitante + Gestor)
                if (solicitante?.email) toEmails.push(solicitante.email);
                if (aprovador?.email) toEmails.push(aprovador.email);

                if (status === 'aprovada') {
                    // AJUSTE: Notificar a Prevenção
                    const prevencaoData = await fetchSupabaseQuery(`usuario_filiais?filial_id=eq.${filial_id}&select=usuarios(email,role)&usuarios.role=eq.prevencao`);
                    if (prevencaoData && prevencaoData.length > 0) {
                        // *** CORREÇÃO APLICADA AQUI ***
                        toEmails.push(...prevencaoData.map(p => p.usuarios?.email).filter(Boolean));
                    }
                    
                    subject = `Pedido Aprovado (#${id}) - Pronto para Execução`;
                    preheader = `O Pedido #${id} foi aprovado por ${aprovadorNome}.`;
                    
                    htmlContent = `
                        <h1>Pedido Aprovado (#${id})</h1>
                        <p>Olá,</p>
                        <p>O pedido #${id} (Solicitante: <strong>${solicitanteNome}</strong>) foi <strong>APROVADO</strong> por <strong>${aprovadorNome}</strong>.</p>
                        <p><strong>Para a Prevenção:</strong> Os itens abaixo estão liberados para execução no sistema.</p>
                        <div class="details-box" style="background-color: #f9fafb; border-left: 4px solid #00D4AA; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <h3>Itens Aprovados</h3>
                            ${htmlList}
                            <p style="margin-bottom: 0;"><strong>Valor Total: ${totalHtml}</strong></p>
                        </div>
                    `;
                    textContent = `Olá,\n\nO pedido #${id} (Solicitante: ${solicitanteNome}) foi APROVADO por ${aprovadorNome}.\n\nPara a Prevenção: Os itens abaixo estão liberados para execução no sistema.\n\nItens Aprovados:\n${textList}\n\nValor Total: ${totalText}`;
                } 
                else if (status === 'negada') {
                    const motivo = itens[0]?.motivo_negacao || 'N/A';
                    subject = `Pedido Negado (#${id})`;
                    preheader = `O Pedido #${id} foi negado por ${aprovadorNome}.`;
                    
                    htmlContent = `
                        <h1>Pedido Negado (#${id})</h1>
                        <p>Olá ${solicitanteNome},</p>
                        <p>Seu pedido #${id} foi <strong>NEGADO</strong> por <strong>${aprovadorNome}</strong>.</p>
                        <div class="details-box" style="background-color: #fff5f5; border-left: 4px solid #D62828; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <h3>Motivo da Negação</h3>
                            <p style="margin-bottom: 0;">${motivo}</p>
                        </div>
                        <h3>Itens do Pedido</h3>
                        ${htmlList}
                    `;
                    textContent = `Olá ${solicitanteNome},\n\nSeu pedido #${id} foi NEGADO por ${aprovadorNome}.\n\nMotivo da Negação:\n${motivo}\n\nItens do Pedido:\n${textList}`;
                }
            }
        }
        
        // --- LÓGICA PARA A TABELA DE ITENS (solicitacao_itens) ---
        else if (payload.table === 'solicitacao_itens') {
            
            if (payload.type === 'UPDATE') {
                const { id, status, solicitacao_id } = payload.record;
                const old_status = payload.old_record.status;

                if (status === old_status) {
                    return res.status(200).json({ message: 'Nenhuma mudança de status do item.' });
                }
                
                // 1. Buscar Envolvidos
                const pedido = await fetchSupabaseRecord(`solicitacoes_baixa?id=eq.${solicitacao_id}&select=usuarios(nome,email)`);
                const solicitante = pedido?.usuarios;
                
                const item = await fetchSupabaseRecord(
                    `solicitacao_itens?id=eq.${id}&select=*,produtos(codigo,descricao),usuarios_executor:usuarios!solicitacao_itens_executor_id_fkey(nome,email),usuarios_retirada:usuarios!solicitacao_itens_retirada_por_id_fkey(nome,email),usuarios_aprovador:usuarios!solicitacao_itens_aprovador_id_fkey(nome,email)`
                );
                
                if (!item) throw new Error(`Item #${id} não encontrado.`);
                
                const solicitanteNome = solicitante?.nome ?? 'Solicitante';
                const produtoDesc = item.produtos ? `${item.produtos.codigo} - ${item.produtos.descricao}` : 'Produto';

                // 2. Definir Destinatários (Solicitante + Gestor SEMPRE)
                if (solicitante?.email) toEmails.push(solicitante.email);
                if (item.usuarios_aprovador?.email) toEmails.push(item.usuarios_aprovador.email);

                // Evento: Item pronto para retirada
                if (status === 'aguardando_retirada') {
                    const executorNome = item.usuarios_executor?.nome ?? 'Executor';
                    
                    subject = `Item Pronto para Retirada (Pedido #${solicitacao_id}, Item #${id})`;
                    preheader = `O item ${produtoDesc} (Pedido #${solicitacao_id}) está pronto para retirada.`;
                    
                    htmlContent = `
                        <h1>Item Pronto para Retirada</h1>
                        <p>Olá ${solicitanteNome},</p>
                        <p>O item <strong>${produtoDesc}</strong> (do Pedido #${solicitacao_id}) foi <strong>EXECUTADO</strong> por ${executorNome} e está pronto para sua retirada.</p>
                        <p>Por favor, acesse o sistema para confirmar a retirada e anexar os comprovantes.</p>
                        <div class="details-box" style="background-color: #f9fafb; border-left: 4px solid #00B4D8; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <h3>Detalhes da Execução</h3>
                            <ul>
                                <li><strong>Produto:</strong> ${produtoDesc}</li>
                                <li><strong>Qtd. Executada:</strong> ${item.quantidade_executada}</li>
                                <li><strong>Valor Total Executado:</strong> R$ ${item.valor_total_executado.toFixed(2)}</li>
                                <li><strong>Justificativa:</strong> ${item.justificativa_execucao}</li>
                                <li><strong>CGO:</strong> ${item.codigo_movimentacao}</li>
                            </ul>
                        </div>
                    `;
                    textContent = `Olá ${solicitanteNome},\n\nO item "${produtoDesc}" (do Pedido #${solicitacao_id}) foi EXECUTADO por ${executorNome} e está pronto para sua retirada.\n\nPor favor, acesse o sistema para confirmar a retirada e anexar os comprovantes.\n\nDetalhes da Execução:\n* Produto: ${produtoDesc}\n* Qtd. Executada: ${item.quantidade_executada}\n* Valor Total Executado: R$ ${item.valor_total_executado.toFixed(2)}\n* Justificativa: ${item.justificativa_execucao}\n* CGO: ${item.codigo_movimentacao}`;
                } 
                
                // Evento: Item finalizado (Laudo do Item)
                else if (status === 'finalizada') {
                    // AJUSTE: Notificar TODOS
                    if (item.usuarios_executor?.email) toEmails.push(item.usuarios_executor.email);
                    if (item.usuarios_retirada?.email) toEmails.push(item.usuarios_retirada.email);

                    const executorNome = item.usuarios_executor?.nome ?? 'Executor';
                    const retiradaNome = item.usuarios_retirada?.nome ?? 'Operação';
                    
                    subject = `Baixa de Item Finalizada (Item #${id}) - Laudo`;
                    preheader = `A baixa do item ${produtoDesc} (Pedido #${solicitacao_id}) foi concluída.`;

                    // --- Anexos (Execução) ---
                    const anexos = await fetchSupabaseQuery(`anexos_baixa?solicitacao_id=eq.${solicitacao_id}`);
                    let anexosHtml = 'Nenhum.';
                    let anexosText = 'Nenhum.';
                    if (anexos && anexos.length > 0) {
                        anexosHtml = '<ul>' + anexos.map(a => `<li style="margin-bottom: 10px;"><a href="${a.url_arquivo}">${a.nome_arquivo || 'Ver Anexo'}</a></li>`).join('') + '</ul>';
                        anexosText = anexos.map(a => `* ${a.nome_arquivo || 'Ver Anexo'}: ${a.url_arquivo}`).join('\n');
                    }
                    
                    // --- Fotos (Retirada) ---
                    let fotosHtml = 'Nenhuma.';
                    let fotosText = 'Nenhuma.';
                    if (item.fotos_retirada_urls && item.fotos_retirada_urls.length > 0) {
                        fotosHtml = '<div class="fotos-grid" style="display: block; margin-top: 15px;">';
                        fotosText = '';
                        item.fotos_retirada_urls.forEach(url => {
                            if (/\.(jpe?g|png|gif|webp)$/i.test(url)) {
                                fotosHtml += `<a href="${url}" class="foto-link" style="display: inline-block; margin: 5px; padding: 5px; border: 1px solid #ddd; border-radius: 8px; text-decoration: none;"><img src="${url}" alt="Foto da Retirada" style="max-width: 250px; height: auto; display: block;" /></a>`;
                            } else {
                                fotosHtml += `<a href="${url}" class="button" style="display: inline-block; padding: 12px 25px; margin: 20px 0; background: linear-gradient(135deg, #00D4AA 0%, #0077B6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Ver Anexo (PDF)</a>`;
                            }
                            fotosText += `* Ver anexo: ${url}\n`;
                        });
                        fotosHtml += '</div>';
                    }

                    htmlContent = `
                        <h1>Laudo de Item Finalizado (#${id})</h1>
                        <p>A baixa para o item <strong>${produtoDesc}</strong> (Pedido #${solicitacao_id}) foi concluída com sucesso.</p>
                        
                        <div class="details-box" style="background-color: #f9fafb; border-left: 4px solid #00B4D8; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <h3>Detalhes da Execução (Prevenção)</h3>
                            <ul>
                                <li><strong>Executor:</strong> ${executorNome}</li>
                                <li><strong>Data:</strong> ${new Date(item.data_execucao).toLocaleString('pt-BR')}</li>
                                <li><strong>Qtd./Valor:</strong> ${item.quantidade_executada} un. / R$ ${item.valor_total_executado.toFixed(2)}</li>
                                <li><strong>Justificativa:</strong> ${item.justificativa_execucao}</li>
                                <li><strong>Anexos da Execução:</strong> ${anexosHtml}</li>
                            </ul>
                        </div>
                        
                        <div class="details-box" style="background-color: #f9fafb; border-left: 4px solid #00D4AA; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <h3>Detalhes da Retirada (Operação)</h3>
                            <ul>
                                <li><strong>Retirado por:</strong> ${retiradaNome}</li>
                                <li><strong>Data:</strong> ${new Date(item.data_retirada).toLocaleString('pt-BR')}</li>
                            </ul>
                            <strong>Anexos da Retirada:</strong>
                            ${fotosHtml}
                        </div>
                    `;
                    
                    textContent = `
Laudo de Item Finalizado (#${id})
A baixa para o item "${produtoDesc}" (Pedido #${solicitacao_id}) foi concluída com sucesso.

Detalhes da Execução (Prevenção)
--------------------------------
* Executor: ${executorNome}
* Data: ${new Date(item.data_execucao).toLocaleString('pt-BR')}
* Qtd./Valor: ${item.quantidade_executada} un. / R$ ${item.valor_total_executado.toFixed(2)}
* Justificativa: ${item.justificativa_execucao}
* Anexos da Execução:\n${anexosText}

Detalhes da Retirada (Operação)
--------------------------------
* Retirado por: ${retiradaNome}
* Data: ${new Date(item.data_retirada).toLocaleString('pt-BR')}
* Anexos da Retirada:\n${fotosText}
                    `;
                }
            }
        }
        
        // --- ENVIO FINAL ---
        if (toEmails.length > 0 && subject && (htmlContent || textContent)) {
            const uniqueEmails = [...new Set(toEmails.filter(Boolean))]; 
            
            if (uniqueEmails.length > 0) {
                console.log(`Enviando e-mail [${subject}] de [${EMAIL_FROM}] para:`, uniqueEmails);

                // Gera o e-mail final usando o template
                const { html, text } = generateEmailTemplates(subject, preheader, htmlContent, textContent);
                
                await resend.emails.send({
                    from: EMAIL_FROM, 
                    to: uniqueEmails,
                    subject: subject,
                    html: html, // HTML Profissional
                    text: text,   // Texto Puro
                });
                return res.status(200).json({ message: 'E-mail enviado com sucesso.' });
            }
        }

        return res.status(200).json({ message: 'Nenhuma ação de e-mail acionada.' });

    } catch (error) {
        console.error('Erro na API send-email:', error);
        return res.status(500).json({ error: 'Falha ao processar o e-mail.', details: error.message });
    }
};
