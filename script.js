// ==========================================
// CONFIGURAÇÕES DO GOOGLE DEVELOPER CONSOLE
// ==========================================
const CLIENT_ID = '609261412025-53ncfn934c13nbecbdn2t8c9npvk7jsa.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets';

// Variáveis globais do sistema
let inputCodBarrasManual;
let bancoDeArtes = [];
let googleAccessToken = null;
let tokenClient = null;
let planilhaBancoId = null; 
let dicionarioGabaritos = {}; 
let imagensSelecionadasIds = []; // Guarda qual arte o usuário clicou para trabalhar
let demandasDeTrabalho = [];      // Lista estruturada: { id_arte, tamanhoMm, quantidade }

// Elementos UI conectados com o HTML
let fileLoader, imageGrid, mainContent, selectTamanhoAdesivo, selectTamanho, inputPedido, inputCopias, inputZoom, zoomValor;
let textColorInput, textSizeInput, textValueInput, textFontSelect, textRotationInput;

let itemSelecionado = null;
let arrastando = false;
let offsetStartX = 0;
let offsetStartY = 0;
let imagemAtivaId = null;
// Carrega os grupos salvos no navegador ou inicia com o padrão
let gruposDeArtes = JSON.parse(localStorage.getItem('mila_grupos_artes')) || [
    { id: 'grupo-geral', nome: 'Todas as Artes (Geral)', artes: [] }
];

// Função auxiliar para salvar o estado atual dos grupos no navegador
function salvarGruposNoStorage() {
    localStorage.setItem('mila_grupos_artes', JSON.stringify(gruposDeArtes));
}

// Atualize sua função de criar grupo para salvar no storage
window.criarNovoGrupo = function() {
    const nomeGrupo = prompt("Digite o nome para o novo grupo de imagens:", "Novo Grupo");
    if (!nomeGrupo || nomeGrupo.trim() === "") return;

    const novoId = 'grupo-' + Date.now();
    gruposDeArtes.push({
        id: novoId,
        nome: nomeGrupo.trim(),
        artes: []
    });

    salvarGruposNoStorage(); // Grava no navegador
    renderizarCatalogoComGrupos();
};

// Função global para renomear um grupo existente
window.renomearGrupo = function(grupoId) {
    if (grupoId === 'grupo-geral') {
        alert("O grupo geral não pode ser renomeado.");
        return;
    }
    const grupo = gruposDeArtes.find(g => g.id === grupoId);
    if (!grupo) return;

    const novoNome = prompt(`Renomear o grupo "${grupo.nome}" para:`, grupo.nome);
    if (!novoNome || novoNome.trim() === "") return;

    grupo.nome = novoNome.trim();
    salvarGruposNoStorage(); 
    renderizarCatalogoComGrupos()
};

// Função global para excluir um grupo existente
window.excluirGrupo = function(grupoId) {
    if (grupoId === 'grupo-geral') {
        alert("O grupo geral é padrão do sistema e não pode ser excluído.");
        return;
    }

    const grupo = gruposDeArtes.find(g => g.id === grupoId);
    if (!grupo) return;

    // Pede uma confirmação para não apagar sem querer
    const confirmar = confirm(`Tem certeza que deseja excluir o grupo "${grupo.nome}"?\nAs imagens voltarão a ficar visíveis no grupo Geral.`);
    if (!confirmar) return;

    // Se o grupo tinha artes, devolve elas para o grupo geral para não sumirem do sistema
    if (grupo.artes && grupo.artes.length > 0) {
        grupo.artes.forEach(arte => {
            // Só joga de volta se ela já não estiver lá por algum motivo
            const jaEstaNoGeral = gruposDeArtes[0].artes.some(a => a.id === arte.id);
            if (!jaEstaNoGeral) {
                gruposDeArtes[0].artes.push(arte);
            }
        });
    }

    // Filtra o array removendo o grupo deletado
    gruposDeArtes = gruposDeArtes.filter(g => g.id !== grupoId);

    // Grava a nova lista no navegador e atualiza a barra lateral
    salvarGruposNoStorage();
    renderizarCatalogoComGrupos();
};

// ==========================================
// BANCO DE DADOS (GOOGLE SHEETS)
// ==========================================

// 1. Procura o banco ou cria um novo se não achar
async function inicializarBancoSheets() {
    if (!googleAccessToken) return;

    const query = "name = 'Mila_Autoprint_Banco' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        const dados = await response.json();

        if (dados.files && dados.files.length > 0) {
            planilhaBancoId = dados.files[0].id;
            console.log("Banco de dados Sheets encontrado! ID:", planilhaBancoId);
            await carregarGabaritosDoBanco();
        } else {
            console.log("Banco de dados não encontrado. Criando nova planilha no Drive...");
            await criarNovoBancoSheets();
        }
    } catch (erro) {
        console.error("Erro ao inicializar banco no Sheets:", erro);
    }
}

// 2. Cria a planilha física no Drive do usuário com as colunas estruturadas
async function criarNovoBancoSheets() {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets';
    const payload = {
        properties: { title: 'Mila_Autoprint_Banco' },
        sheets: [{
            properties: { title: 'Gabaritos' },
            data: [{
                startRow: 0,
                startColumn: 0,
                rowData: [{
                    values: [
                        { userEnteredValue: { stringValue: 'id_arte' } },
                        { userEnteredValue: { stringValue: 'nome_arte' } },
                        { userEnteredValue: { stringValue: 'coordenadas_json' } }
                    ]
                }]
            }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const planilhaCriada = await response.json();
        planilhaBancoId = planilhaCriada.spreadsheetId;
        console.log("Novo banco Sheets criado com sucesso! ID:", planilhaBancoId);
    } catch (erro) {
        console.error("Erro ao criar planilha de banco:", erro);
    }
}

// 3. Puxa todas as linhas da planilha para a memória do sistema
async function carregarGabaritosDoBanco() {
    if (!planilhaBancoId) return;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A2:C`;

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        const dados = await response.json();

        dicionarioGabaritos = {}; 

        if (dados.values && dados.values.length > 0) {
            dados.values.forEach(linha => {
                const idArte = linha[0];
                const coordenadasString = linha[2];
                
                try {
                    dicionarioGabaritos[idArte] = JSON.parse(coordenadasString);
                } catch (e) {
                    console.error("Erro ao processar JSON da linha da planilha:", e);
                }
            });
            console.log("Gabaritos sincronizados em memória:", dicionarioGabaritos);
        }
    } catch (erro) {
        console.error("Erro ao ler linhas do Sheets:", erro);
    }
}

async function listarArtesDoGoogleDrive() {
    if (!googleAccessToken) {
        console.warn("Acesso ao Google não autorizado ainda.");
        return;
    }

    await inicializarBancoSheets();

    const query = "mimeType contains 'image/' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        const dados = await response.json();

        if (dados.files && dados.files.length > 0) {
            bancoDeArtes = [];
            let carregamentos = [];

            dados.files.forEach(arquivo => {
                const urlImagemDrive = `https://lh3.googleusercontent.com/d/${arquivo.id}`;
                const nomeLimpo = arquivo.name.replace(/\.[^/.]+$/, ""); 
                const layoutSalvo = dicionarioGabaritos[arquivo.id] ? dicionarioGabaritos[arquivo.id] : [];

                // Cria uma promessa para medir as dimensões reais da imagem
                const promessaDimensao = new Promise((resolve) => {
                    const tempImg = new Image();
                    tempImg.src = urlImagemDrive;
                    tempImg.onload = () => {
                        // Calcula a proporção de aspecto (Largura / Altura)
                        const proporcao = tempImg.naturalWidth / tempImg.naturalHeight;
                        resolve({ proporcao });
                    };
                    tempImg.onerror = () => {
                        resolve({ proporcao: 1 }); // Fallback caso dê erro
                    };
                });

                carregamentos.push(promessaDimensao.then(dim => {
                    bancoDeArtes.push({
                        id: arquivo.id, 
                        nome: nomeLimpo,
                        url: urlImagemDrive,
                        layout: layoutSalvo,
                        proporcao: dim.proporcao // Guarda a proporção exata da arte!
                    });
                }));
            });

            // Aguarda todas as proporções de imagem serem carregadas
            await Promise.all(carregamentos);

            // ALTERADO: Agora renderiza primeiro a estrutura de grupos, depois calcula o sistema
            console.log("Catálogo do Drive carregado com proporções reais:", bancoDeArtes);
            renderizarCatalogoComGrupos(); 
            renderizarSistema();
        } else {
            console.log("Nenhuma imagem encontrada na raiz do Google Drive.");
        }
    } catch (erro) {
        console.error("Erro ao listar arquivos do Drive:", erro);
    }
}

async function salvarGabaritoNoSheets(idArte, nomeArte, layoutArray) {
    if (!planilhaBancoId) {
        console.warn("ID da planilha de banco não encontrado. Não foi possível salvar.");
        return;
    }

    // 1. Primeiro lemos as linhas existentes para saber se o ID já está cadastrado
    const urlLeitura = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A:A`;
    
    try {
        const responseLeitura = await fetch(urlLeitura, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        const dadosLeitura = await responseLeitura.json();
        
        let linhaEncontrada = -1;
        if (dadosLeitura.values) {
            // Procura o ID da arte na coluna A (lembrando que o Sheets começa em 1)
            linhaEncontrada = dadosLeitura.values.findIndex(row => row[0] === idArte);
        }

        const payload = {
            values: [
                [idArte, nomeArte, JSON.stringify(layoutArray)]
            ]
        };

        if (linhaEncontrada !== -1) {
            // CASO JÁ EXISTA: Sobrescreve a linha exata (Ex: Gabaritos!A5:C5)
            const numeroLinhaSheets = linhaEncontrada + 1; 
            const urlUpdate = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A${numeroLinhaSheets}:C${numeroLinhaSheets}?valueInputOption=USER_ENTERED`;
            
            await fetch(urlUpdate, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            console.log(`Gabarito da arte "${nomeArte}" atualizado com sucesso na linha ${numeroLinhaSheets}!`);
        } else {
            // CASO SEJA NOVA: Adiciona uma nova linha no final da planilha
            const urlAppend = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A:C:append?valueInputOption=USER_ENTERED`;
            
            await fetch(urlAppend, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            console.log(`Novo gabarito da arte "${nomeArte}" gravado com sucesso no Sheets!`);
        }

        // Atualiza em memória o dicionário local para renderizar imediatamente na tela
        dicionarioGabaritos[idArte] = layoutArray;
        
        // Update local do layout da arte
        const arteNoBanco = bancoDeArtes.find(img => img.id === idArte);
        if (arteNoBanco) arteNoBanco.layout = layoutArray;

    } catch (erro) {
        console.error("Erro ao gerenciar salvamento no Sheets:", erro);
    }
}

// ==========================================
// FUNÇÕES DE IMPOSIÇÃO E CALIBRAÇÃO DE LAYOUT
// ==========================================

// Calcula o layout do papel baseado estritamente em milímetros
function calcularLayout() {
    const elTamanho = document.getElementById('selectTamanho');
    const tamanhoFolha = elTamanho ? elTamanho.value : 'A4'; 
    
    let folhaLargura = 210;
    let folhaAltura = 297;
    
    if (tamanhoFolha === 'A3') {
        folhaLargura = 297;
        folhaAltura = 420;
    }
    
    // ====== CALIBRAÇÃO EXATA DO SOFTWARE DE CORTE ======
    // Bolinhas de registro físicas continuam a exatos 7mm da borda para o sensor ler.
    const margemRegistroPlotter = 7;
    
    // Diminuímos ligeiramente a margem de segurança de cálculo lateral para 13mm.
    // Isso dá exatamente 184mm de área útil. Dois adesivos de 90mm (180mm) + gap (2mm) cabem perfeitamente lado a lado!
    const margemEsquerdaDireita = 13; 
    const margemSuperior = 15; 
    
    // Na base inferior, mantemos a folga segura para o QR Code de 8mm[cite: 3]
    const margemInferior = 18; 
    
    const larguraUtil = folhaLargura - (margemEsquerdaDireita * 2);
    const alturaUtil = folhaAltura - margemSuperior - margemInferior;
    
    const gapMm = 2; // Espaçamento entre cada adesivo
    
    return {
        folhaLargura,
        folhaAltura,
        margemEsquerdaDireita,
        margemSuperiorInferior: margemSuperior,
        larguraUtil,
        alturaUtil,
        gapMm,
        margemRegistroPlotter
    };
}

function renderizarSistema() {
    const elementoLista = document.getElementById('txtListaAlunos');
    const textoLista = elementoLista ? elementoLista.value.trim() : '';
    
    const elBusca = document.getElementById('searchInput') || document.getElementById('inputBusca');
    const filtro = elBusca ? elBusca.value.toLowerCase() : '';
    
    const elPedido = inputPedido || document.getElementById('inputPedido');
    const numeroPedido = elPedido ? elPedido.value.trim() : '';
    
   // const elGrid = imageGrid || document.getElementById('imageGrid') || document.querySelector('.image-grid');
    const elMain = mainContent || document.getElementById('mainContent') || document.querySelector('.main-content');
    
    //if (elGrid) elGrid.innerHTML = '';
    if (elMain) elMain.innerHTML = '';

    // Divide os alunos por ponto e vírgula de forma ultra-segura
    let listaAlunos = [];
    if (textoLista) {
        // Remove quebras de linha substituindo por espaços normais para juntar o texto quebrado pelo 'Enter'
        const textoCorrido = textoLista.replace(/\r?\n|\r/g, " ");
        
        // Agora dividimos os alunos estritamente pelo ponto e vírgula ';'
        listaAlunos = textoCorrido
            .split(';')
            .map(item => item.trim())
            .filter(item => item !== "");
    }
    
   

    if (demandasDeTrabalho.length === 0) {
        if (elMain) {
            elMain.innerHTML = `
                <div style="text-align: center; margin-top: 100px; color: #888;">
                    <h3>Fila de Produção Vazia</h3>
                    <p>Selecione as artes na barra lateral, defina o tamanho, a quantidade e clique em "Adicionar à Produção".</p>
                </div>
            `;
        }
        atualizarZoomVisual();
        return;
    }

    // 3. DESDOBRA OS ADESIVOS MULTIPLICANDO AS CÓPIAS PARA CADA ALUNO DA LISTA
    let filaAdesivosParaImprimir = [];

    demandasDeTrabalho.forEach(demanda => {
        const arteOriginal = bancoDeArtes.find(img => img.id === demanda.id_arte);
        if (!arteOriginal) return;

        const prop = arteOriginal.proporcao || 1;

        let larguraReal, alturaReal;
        if (prop >= 1) {
            larguraReal = demanda.tamanhoMm;
            alturaReal = demanda.tamanhoMm / prop;
        } else {
            alturaReal = demanda.tamanhoMm;
            larguraReal = demanda.tamanhoMm * prop;
        }

        // Se o usuário colou alunos na lista, geramos a quantidade de cópias solicitada para CADA aluno!
        if (listaAlunos.length > 0) {
            listaAlunos.forEach(alunoTexto => {
                for (let i = 0; i < demanda.quantidade; i++) {
                    filaAdesivosParaImprimir.push({
                        arte: arteOriginal,
                        larguraMm: larguraReal,
                        alturaMm: alturaReal,
                        dadosAluno: alunoTexto
                    });
                }
            });
        } else {
            // Se a lista de alunos estiver vazia, gera cópias com os textos padrões do Gabarito para preview!
            for (let i = 0; i < demanda.quantidade; i++) {
                filaAdesivosParaImprimir.push({
                    arte: arteOriginal,
                    larguraMm: larguraReal,
                    alturaMm: alturaReal,
                    dadosAluno: "Nome do Aluno - Série - Escola"
                });
            }
        }
    });

    // Ordena do maior para o menor com base na área física para garantir o melhor aproveitamento de espaço
    filaAdesivosParaImprimir.sort((a, b) => (b.larguraMm * b.alturaMm) - (a.larguraMm * a.alturaMm));

    // === ALGORITMO DE ENCAIXE 2D BIDIMENSIONAL INTELEGENTE ===
    const layout = calcularLayout();
    let paginasGeradas = [];

    // Avisa o CSS de impressão qual é o formato de papel atual
    document.body.classList.remove('print-A4', 'print-A3');
    document.body.classList.add(`print-${layout.folhaLargura === 297 ? 'A3' : 'A4'}`);

    while (filaAdesivosParaImprimir.length > 0) {
        let paginaAtual = { elementos: [] };
        
        // Controlamos os espaços ocupados na folha para não sobrepor nada
        let espacosOcupados = []; 

        let indexAdesivo = 0;
        while (indexAdesivo < filaAdesivosParaImprimir.length) {
            const adesivo = filaAdesivosParaImprimir[indexAdesivo];
            const larguraItem = adesivo.larguraMm;
            const alturaItem = adesivo.alturaMm;
            let posicionado = false;

            // Varre a folha milímetro por milímetro de cima para baixo, da esquerda para a direita
            for (let y = layout.margemSuperiorInferior; y <= layout.alturaUtil + layout.margemSuperiorInferior - alturaItem; y += 1) {
                for (let x = layout.margemEsquerdaDireita; x <= layout.larguraUtil + layout.margemEsquerdaDireita - larguraItem; x += 1) {
                    
                    // Testa se o item cabe nesta coordenada sem colidir com nenhum outro já posicionado
                    let colidiu = false;
                    for (let o of espacosOcupados) {
                        if (
                            x < o.x2 + layout.gapMm && 
                            x + larguraItem + layout.gapMm > o.x1 &&
                            y < o.y2 + layout.gapMm && 
                            y + alturaItem + layout.gapMm > o.y1
                        ) {
                            colidiu = true;
                            break;
                        }
                    }

                    // Se não colidir, posiciona o adesivo imediatamente nesta lacuna!
                    if (!colidiu) {
                        const novoElemento = {
                            x: x,
                            y: y,
                            width: larguraItem,
                            height: alturaItem,
                            adesivo: adesivo
                        };

                        paginaAtual.elementos.push(novoElemento);
                        
                        // Registra o retângulo físico que este adesivo ocupou
                        espacosOcupados.push({
                            x1: x,
                            y1: y,
                            x2: x + larguraItem,
                            y2: y + alturaItem
                        });

                        filaAdesivosParaImprimir.splice(indexAdesivo, 1); // Remove da fila de pendentes
                        posicionado = true;
                        break;
                    }
                }
                if (posicionado) break;
            }

            // Se o adesivo não coube em nenhum espacinho desta página, passa para o próximo da fila para tentar encaixar
            if (!posicionado) {
                indexAdesivo++;
            }
        }

        paginasGeradas.push(paginaAtual);
    }

    // 3. RENDERIZAÇÃO FÍSICA DAS FOLHAS
    paginasGeradas.forEach((pagina, idxPagina) => {
        const pageScaler = document.createElement('div');
        pageScaler.className = 'page-scaler';

        const printArea = document.createElement('div');
        printArea.className = 'print-area';
        printArea.style.width = `${layout.folhaLargura}mm`;
        printArea.style.height = `${layout.folhaAltura}mm`;
        printArea.style.position = 'relative';
        printArea.style.backgroundColor = '#ffffff';
        printArea.style.boxShadow = '0 0 10px rgba(0,0,0,0.15)';

        // ====== MARCAS DE REGISTRO EM CÍRCULO (PLOTTER DE CORTE) ======
        // Ajustado dinamicamente para o offset de 7mm configurado na plotter!
        const offsetMm = `${layout.margemRegistroPlotter}mm`;
        const posicoesPontos = [
            { top: offsetMm, left: offsetMm },     // Superior Esquerdo
            { top: offsetMm, right: offsetMm },    // Superior Direito
            { bottom: offsetMm, left: offsetMm },  // Inferior Esquerdo
            { bottom: offsetMm, right: offsetMm }  // Inferior Direito
        ];

        posicoesPontos.forEach(pos => {
            const ponto = document.createElement('div');
            ponto.className = 'marca-registro-plotter';
            ponto.style.position = 'absolute';
            ponto.style.width = '5mm';  // Diâmetro ideal para o sensor da plotter ler
            ponto.style.height = '5mm';
            ponto.style.backgroundColor = '#000000';
            ponto.style.borderRadius = '50%'; // Força círculo perfeito
            ponto.style.zIndex = '10';
            
            if (pos.top) ponto.style.top = pos.top;
            if (pos.bottom) ponto.style.bottom = pos.bottom;
            if (pos.left) ponto.style.left = pos.left;
            if (pos.right) ponto.style.right = pos.right;

            printArea.appendChild(ponto);
        });

        pagina.elementos.forEach(el => {
            const sticker = criarAdesivoElementoLote(
                el.adesivo.arte, 
                el.width, 
                el.height, 
                el.adesivo.dadosAluno, 
                numeroPedido
            );
            sticker.style.position = 'absolute';
            sticker.style.left = `${el.x}mm`;
            sticker.style.top = `${el.y}mm`;
            
            printArea.appendChild(sticker);
        });

        // ====== INJEÇÃO DO RODAPÉ CENTRALIZADO E COMPACTO (EXATAMENTE COMO O MODELO) ======
        const rodapeCentralizado = document.createElement('div');
        rodapeCentralizado.style.position = 'absolute';
        
        // Calibrado com o offset do QR Code a 8mm de distância do fundo da folha!
        rodapeCentralizado.style.bottom = '8mm';
        rodapeCentralizado.style.left = '30mm';  // Afastado dos pontos dos cantos
        rodapeCentralizado.style.right = '30mm';
        rodapeCentralizado.style.display = 'flex';
        rodapeCentralizado.style.flexDirection = 'column';
        rodapeCentralizado.style.alignItems = 'center';
        rodapeCentralizado.style.justifyContent = 'center';
        rodapeCentralizado.style.gap = '0.5mm';
        rodapeCentralizado.style.zIndex = '10';

        // Pega os valores digitados na tela
        const elCodManual = document.getElementById('inputCodBarrasManual');
        const valorCodManual = elCodManual ? elCodManual.value.trim() : '';
        const valorPedido = numeroPedido || ''; // QR Code usa o número do pedido

        // Lado a lado de forma super compacta no meio físico
        const blocoConteudo = document.createElement('div');
        blocoConteudo.style.display = 'flex';
        blocoConteudo.style.alignItems = 'center';
        blocoConteudo.style.justifyContent = 'center';
        blocoConteudo.style.gap = '3mm'; // Espaçamento interno entre o QR e o Código de barras

        // QR Code Container - Ajustado para exatamente 8mm como configurado no software!
        const blocoQR = document.createElement('div');
        blocoQR.style.width = '8mm';
        blocoQR.style.height = '8mm';
        blocoQR.style.backgroundColor = '#ffffff';
        blocoQR.style.display = 'flex';
        blocoQR.style.alignItems = 'center';
        blocoQR.style.justifyContent = 'center';

        // Código de Barras Manual + Texto de Identificação (Direita)
        const blocoCodManual = document.createElement('div');
        blocoCodManual.style.display = 'flex';
        blocoCodManual.style.flexDirection = 'column';
        blocoCodManual.style.alignItems = 'center';
        blocoCodManual.style.justifyContent = 'center';

        if (valorCodManual) {
            blocoCodManual.innerHTML = `
                <div style="font-family: 'Libre Barcode 39', 'Code 128', sans-serif; font-size: 13px; line-height: 1; margin: 0; padding: 0; color: #000;">*${valorCodManual}*</div>
                <div style="font-size: 5.5px; font-weight: bold; font-family: monospace; line-height: 1; margin-top: 0.3mm;">${valorCodManual}</div>
            `;
        } else {
            blocoCodManual.innerHTML = `<div style="font-size: 5.5px; color: #aaa; font-family: monospace;">N/D</div>`;
        }

        // Montagem do Rodapé
        blocoConteudo.appendChild(blocoQR);
        blocoConteudo.appendChild(blocoCodManual);
        rodapeCentralizado.appendChild(blocoConteudo);
        printArea.appendChild(rodapeCentralizado);

        pageScaler.appendChild(printArea);
        if (elMain) elMain.appendChild(pageScaler);

        // Gera o QR Code com exatamente 8mm reais de leitura (28px de renderização física)
        if (typeof QRCode !== 'undefined' && valorPedido) {
            new QRCode(blocoQR, {
                text: valorPedido,
                width: 28,
                height: 28,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: 1
            });
        }
    });

    atualizarZoomVisual();
}

function atualizarZoomVisual() {
    if (!inputZoom || !zoomValor) return;
    const vol = inputZoom.value;
    zoomValor.innerText = `${vol}%`;
    const scale = vol / 100;
    
    document.querySelectorAll('.page-scaler').forEach(scaler => {
        const targetFolha = scaler.querySelector('.print-area');
        if (targetFolha) {
            scaler.style.width = `${targetFolha.offsetWidth * scale}px`;
            scaler.style.height = `${targetFolha.offsetHeight * scale}px`;
            targetFolha.style.transform = `scale(${scale})`;
        }
    });
}

function excluirImagem(id) {
    bancoDeArtes = bancoDeArtes.filter(img => img.id !== id);
    renderizarSistema();
}

// ==========================================
// MODAL DE EDIÇÃO DE GABARITO
// ==========================================

function abrirModalEdicao(idImagem) {
    imagemAtivaId = idImagem;
    const arte = bancoDeArtes.find(img => img.id === idImagem);
    if (!arte) return;

    const modal = document.getElementById('editModal');
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    
    if (!canvas) return; 

    canvas.style.width = '450px';
    canvas.style.height = '450px';
    canvas.innerHTML = `<img id="imgFundoModal" src="${arte.url}" style="width:100%; height:100%; object-fit:contain; position:absolute; top:0; left:0; z-index:1;">`;

    if (!arte.layout) {
        arte.layout = [];
    }

    arte.layout.forEach(p => {
        renderizarItemNoModalCanvas(p, arte);
    });
    
    canvas.onmousemove = (e) => {
        if (!arrastando || !itemSelecionado) return;
        const rect = canvas.getBoundingClientRect();
        let currentX = (e.clientX - rect.left) - offsetStartX;
        let currentY = (e.clientY - rect.top) - offsetStartY;
        
        currentX = Math.max(0, Math.min(currentX, canvas.clientWidth - itemSelecionado.elHtml.offsetWidth));
        currentY = Math.max(0, Math.min(currentY, canvas.clientHeight - itemSelecionado.elHtml.offsetHeight));
        
        itemSelecionado.elHtml.style.left = `${currentX}px`;
        itemSelecionado.elHtml.style.top = `${currentY}px`;
        
        itemSelecionado.dados.x = (currentX / canvas.clientWidth) * 100;
        itemSelecionado.dados.y = (currentY / canvas.clientHeight) * 100;
    };
    
    window.onmouseup = () => { 
        arrastando = false; 
    };
    
    if (modal) modal.style.display = 'flex';
}

function selecionarItem(paramDados, elementoHtml) {
    document.querySelectorAll('.draggable-text').forEach(el => el.classList.remove('selected-item'));
    itemSelecionado = { dados: paramDados, elHtml: elementoHtml };
    elementoHtml.classList.add('selected-item');
    
    document.getElementById('painelPropriedades').style.display = 'flex';
    document.getElementById('lblItemSelecionado').innerText = `Item: ${paramDados.label}`;
    
    textValueInput.value = paramDados.texto;
    textColorInput.value = paramDados.cor;
    textSizeInput.value = paramDados.tamanho;
    textFontSelect.value = paramDados.fonte || 'Arial';
    textRotationInput.value = paramDados.rotacao || 0;
}

function excluirTextoSelecionado() {
    if (!itemSelecionado || !imagemAtivaId) {
        alert("Selecione um parâmetro no painel ou clique sobre ele no adesivo para poder excluir.");
        return;
    }

    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (!arte) return;

    // 1. Remove o parâmetro do array do layout em memória
    arte.layout = arte.layout.filter(p => p.id !== itemSelecionado.dados.id);

    // 2. Remove o elemento visualmente do canvas do modal
    const elNoCanvas = document.getElementById(`drag-${itemSelecionado.dados.id}`);
    if (elNoCanvas) {
        elNoCanvas.remove();
    }

    // 3. Reseta o painel de propriedades e limpa a seleção
    itemSelecionado = null;
    document.getElementById('painelPropriedades').style.display = 'none';
    document.getElementById('lblItemSelecionado').innerText = 'Item: Nenhum';

    console.log("Parâmetro removido com sucesso do gabarito temporário.");
}

function adicionarCampoGabarito(tipoId, labelTexto) {
    if (!imagemAtivaId) return;
    
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (!arte) return;

    const jaExiste = arte.layout.some(p => p.id === tipoId);
    if (jaExiste) {
        alert(`O parâmetro "${labelTexto}" já foi adicionado ao gabarito desta arte.`);
        return;
    }

    const novoElemento = {
        id: tipoId,
        tipo: tipoId.split('-')[0], 
        label: labelTexto,
        texto: labelTexto, 
        x: 35, 
        y: 35,
        cor: '#ffffff',
        tamanho: 14,
        fonte: 'Arial',
        rotacao: 0
    };

    arte.layout.push(novoElemento);
    renderizarItemNoModalCanvas(novoElemento, arte);
}

function renderizarItemNoModalCanvas(param, arte) {
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    if (!canvas) return;
    
    const el = document.createElement('div');
    el.className = 'draggable-text';
    el.id = `drag-${param.id}`;
    el.innerText = param.tipo === 'faca' ? '' : param.label; // Facas não levam texto dentro
    
    if (param.tipo === 'txt') {
        el.style.color = param.cor;
        el.style.fontSize = `${param.tamanho}px`;
        el.style.fontFamily = param.fonte;
        el.style.backgroundColor = 'rgba(0,0,0,0.3)'; 
        el.style.padding = '2px 6px';
        el.style.borderRadius = '4px';
        el.style.position = 'absolute';
        el.style.left = `${(param.x / 100) * 450}px`;
        el.style.top = `${(param.y / 100) * 450}px`;
    } 
    
    // ✂️ LÓGICA DE ESTILIZAÇÃO DA FACA NO EDITOR
    else if (param.tipo === 'faca') {
        el.style.position = 'absolute';
        el.style.border = '2px dashed #FF00FF'; // Rosa Spot
        el.style.backgroundColor = 'rgba(255, 0, 255, 0.1)';
        
        // Inicializa tamanhos padrão se não existirem
        param.w = param.w || 60;
        param.h = param.h || 60;
        
        el.style.width = `${(param.w / 100) * 450}px`;
        el.style.height = `${(param.h / 100) * 450}px`;
        el.style.left = `${(param.x / 100) * 450}px`;
        el.style.top = `${(param.y / 100) * 450}px`;

        if (param.id.includes('circulo')) {
            el.style.borderRadius = '50%';
        }

        // Cria o puxador/âncora de redimensionamento no canto inferior direito
        const resizer = document.createElement('div');
        resizer.style.width = '10px';
        resizer.style.height = '10px';
        resizer.style.background = '#FF00FF';
        resizer.style.position = 'absolute';
        resizer.style.right = '-5px';
        resizer.style.bottom = '-5px';
        resizer.style.cursor = 'se-resize';
        resizer.style.zIndex = '100';
        resizer.style.borderRadius = '50%';

        // Evento de clique no puxador para redimensionar livremente
        resizer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const startWidth = el.offsetWidth;
            const startHeight = el.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            
            const doResize = (moveEvent) => {
                let newWidth = startWidth + (moveEvent.clientX - startX);
                let newHeight = startHeight + (moveEvent.clientY - startY);
                
                // Limites mínimos para não sumir com o componente
                newWidth = Math.max(20, newWidth);
                newHeight = Math.max(20, newHeight);

                // Se for faca quadrada, força a largura ser igual à altura
                if (param.id.includes('quadrado') || param.id.includes('circulo')) {
                    newHeight = newWidth; 
                }

                el.style.width = `${newWidth}px`;
                el.style.height = `${newHeight}px`;
                
                // Converte de volta para porcentagem (%) para salvar no gabarito
                param.w = (newWidth / 450) * 100;
                param.h = (newHeight / 450) * 100;
            };
            
            const stopResize = () => {
                window.removeEventListener('mousemove', doResize);
                window.removeEventListener('mouseup', stopResize);
            };
            
            window.addEventListener('mousemove', doResize);
            window.addEventListener('mouseup', stopResize);
        });
        
        el.appendChild(resizer);
    }
    
    el.style.transform = `rotate(${param.rotacao || 0}deg)`;
    el.style.cursor = 'move';
    el.style.zIndex = '10';

    // Evento de Mover (Arrastar posição)
    el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        selecionarItem(param, el); 
        arrastando = true;
        
        const rect = canvas.getBoundingClientRect();
        offsetStartX = (e.clientX - rect.left) - el.offsetLeft;
        offsetStartY = (e.clientY - rect.top) - el.offsetTop;
    });
    
    canvas.appendChild(el);
}

async function fecharModal() {
    const modal = document.getElementById('editModal');
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    
    if (arte) {
        console.log("Salvando novo gabarito no banco de dados Sheets...");
        const btnSalvar = document.querySelector('#editModal button[onclick*="fecharModal"]');
        if (btnSalvar) btnSalvar.innerText = "💾 Gravando...";

        await salvarGabaritoNoSheets(arte.id, arte.nome, arte.layout);
        
        if (btnSalvar) btnSalvar.innerText = "Salvar e Fechar";
    }

    if (modal) modal.style.display = 'none';
    
    itemSelecionado = null;
    imagemAtivaId = null;
    
    // 🎯 AJUSTE AQUI: Garante que as pastas e a folha atualizem juntas ao fechar o modal
    renderizarCatalogoComGrupos(); 
    renderizarSistema();
}

// ==========================================
// DESENHO INDIVIDUAL DO ADESIVO LOTE
// ==========================================

function criarAdesivoElementoLote(img, larguraMm, alturaMm, dadosAlunoString, numeroPedido) {
    const textoSeguro = (typeof dadosAlunoString === 'string') ? dadosAlunoString : "";

    const sticker = document.createElement('div');
    sticker.className = 'sticker-container';
    sticker.style.position = 'relative';
    sticker.style.width = `${larguraMm}mm`;
    sticker.style.height = `${alturaMm}mm`;
    sticker.style.overflow = 'hidden';

    // Imagem de fundo da arte base
    const bg = document.createElement('img');
    bg.className = 'art-background';
    bg.src = img.url; 
    bg.style.position = 'absolute';
    bg.style.top = '0';
    bg.style.left = '0';
    bg.style.width = '100%';
    bg.style.height = '100%';
    sticker.appendChild(bg);

    // Criamos o container SVG para injetar as linhas de corte vetoriais puras
    const svgCorte = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgCorte.setAttribute('style', 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 99;');
    svgCorte.setAttribute('viewBox', `0 0 ${larguraMm} ${alturaMm}`);

    let temFacaManual = false;

    // Tratamento de dados de texto do lote
    let partes = textoSeguro.split(/[-–/]/).map(p => p.trim());
    const dadosTratados = { 'nome': partes[0] || '', 'serie': partes[1] || '', 'escola': partes[2] || '' };

    if (img.layout && Array.isArray(img.layout)) {
        img.layout.forEach(p => {
            // ✂️ SE FOR FACA MANUAL CONFIGURADA
            if (p.tipo === 'faca') {
                temFacaManual = true;
                
                // Converte as posições e tamanhos relativos (%) em milímetros baseados na proporção da imagem
                const xMm = (p.x / 100) * larguraMm;
                const yMm = (p.y / 100) * alturaMm;
                const wMm = (p.w / 100) * larguraMm;
                const hMm = (p.h / 100) * alturaMm;

                if (p.id.includes('circulo')) {
                    // Desenha um círculo vetorial perfeito no SVG
                    const raio = wMm / 2;
                    const centroX = xMm + raio;
                    const centroY = yMm + raio;

                    const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    circ.setAttribute("cx", centroX);
                    circ.setAttribute("cy", centroY);
                    circ.setAttribute("r", raio);
                    circ.setAttribute("stroke", "#FF00FF"); // Rosa Spot de Faca
                    circ.setAttribute("stroke-width", "0.25mm");
                    circ.setAttribute("fill", "none");
                    svgCorte.appendChild(circ);
                } else {
                    // Desenha um retângulo vetorial perfeito no SVG
                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute("x", xMm);
                    rect.setAttribute("y", yMm);
                    rect.setAttribute("width", wMm);
                    rect.setAttribute("height", hMm);
                    rect.setAttribute("stroke", "#FF00FF");
                    rect.setAttribute("stroke-width", "0.25mm");
                    rect.setAttribute("fill", "none");
                    svgCorte.appendChild(rect);
                }
            }
            
            // 📝 SE FOR TEXTO DINÂMICO
            else if (p.tipo === 'txt') {
                const camada = document.createElement('div');
                camada.style.position = 'absolute';
                camada.style.left = `${p.x}%`;
                camada.style.top = `${p.y}%`;
                camada.style.transform = `rotate(${p.rotacao || 0}deg)`;
                camada.style.zIndex = '5';
                camada.style.whiteSpace = 'nowrap';
                
                const idNormalizado = (p.id || "").toLowerCase();
                const textoNormalizado = (p.label || p.texto || "").toLowerCase();
                let textoExibir = p.texto || p.label;

                if (idNormalizado.includes('nome') || textoNormalizado.includes('nome')) {
                    textoExibir = dadosTratados['nome'] || p.texto || p.label;
                } else if (idNormalizado.includes('serie') || idNormalizado.includes('série') || textoNormalizado.includes('serie') || textoNormalizado.includes('série')) {
                    textoExibir = dadosTratados['serie'] || p.texto || p.label;
                } else if (idNormalizado.includes('escola') || textoNormalizado.includes('escola')) {
                    textoExibir = dadosTratados['escola'] || p.texto || p.label;
                }

                camada.innerText = textoExibir;
                camada.style.color = p.cor || '#ffffff';
                camada.style.fontFamily = p.fonte || 'Arial';
                camada.style.fontWeight = 'bold';
                
                const tamanhoOriginalPx = parseFloat(p.tamanho) || 14;
                const proporcaoAltura = tamanhoOriginalPx / 450; 
                const tamanhoMmEfetivo = alturaMm * proporcaoAltura; 

                camada.style.fontSize = `${tamanhoMmEfetivo}mm`; 
                camada.style.lineHeight = '1';
                sticker.appendChild(camada);
            }
        });
    }

    // FALLBACK INTELIGENTE: Se o usuário não desenhou nenhuma faca manual no editor,
    // o sistema cria a faca automática nas bordas da imagem por padrão.
    if (!temFacaManual) {
        const nomeArteMinusculo = (img.nome || "").toLowerCase();
        
        // Mantém a sua regra inteligente de formato redondo automático
        const ehRedondo = (larguraMm === alturaMm) && 
                          !nomeArteMinusculo.includes('tri') && 
                          !nomeArteMinusculo.includes('quadrado');

        if (ehRedondo) {
            // Desenha o círculo vetorial cobrindo o adesivo de ponta a ponta
            const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circ.setAttribute("cx", (larguraMm / 2).toString());
            circ.setAttribute("cy", (alturaMm / 2).toString());
            circ.setAttribute("r", (larguraMm / 2).toString());
            circ.setAttribute("stroke", "#FF00FF");
            circ.setAttribute("stroke-width", "0.25mm");
            circ.setAttribute("fill", "none");
            svgCorte.appendChild(circ);
        } else {
            // Desenha o retângulo vetorial cobrindo as bordas físicas do adesivo
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", "0");
            rect.setAttribute("y", "0");
            rect.setAttribute("width", larguraMm.toString());
            rect.setAttribute("height", alturaMm.toString());
            rect.setAttribute("stroke", "#FF00FF");
            rect.setAttribute("stroke-width", "0.25mm");
            rect.setAttribute("fill", "none");
            svgCorte.appendChild(rect);
        }
    }

    sticker.appendChild(svgCorte);
    return sticker;
}

// ==========================================
// SISTEMA DE FILA DE IMPRESSÃO (DEMANDAS)
// ==========================================

window.adicionarDemandaLote = function() {
    if (!window.imagemSelecionadaId) {
        alert("Selecione uma arte na barra lateral antes de configurar o tamanho!");
        return;
    }

    const selectTamanhoAdesivoLocal = document.getElementById('selectTamanhoAdesivo');
    const inputCopiasLocal = document.getElementById('inputCopias');
    
    const tamanhoMm = parseInt(selectTamanhoAdesivoLocal.value);
    const quantidade = parseInt(inputCopiasLocal.value);
    
    if (isNaN(quantidade) || quantidade <= 0) {
        alert("Por favor, digite uma quantidade de cópias válida.");
        return;
    }

    const arte = bancoDeArtes.find(img => img.id === window.imagemSelecionadaId);
    if (!arte) return;

    // Procura se já existe exatamente essa mesma arte com esse mesmo tamanho na fila
    const demandaExistente = demandasDeTrabalho.find(d => d.id_arte === arte.id && d.tamanhoMm === tamanhoMm);

    if (demandaExistente) {
        demandaExistente.quantidade += quantidade;
    } else {
        demandasDeTrabalho.push({
            id_arte: arte.id,
            nome_arte: arte.nome,
            tamanhoMm: tamanhoMm,
            quantidade: quantity = quantidade
        });
    }

    console.log("Fila de produção updated:", demandasDeTrabalho);
    atualizarFilaVisual();
    renderizarSistema();
    renderizarCatalogoComGrupos(); 
};

window.removerDemanda = function(index) {
    demandasDeTrabalho.splice(index, 1);
    atualizarFilaVisual();
    renderizarSistema();
    renderizarCatalogoComGrupos();
};

function atualizarFilaVisual() {
    const container = document.getElementById('listaFilaImpressao');
    if (!container) return;

    if (demandasDeTrabalho.length === 0) {
        container.innerHTML = `<em style="color:#aaa;">Nenhum item na fila de produção.</em>`;
        return;
    }

    let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
    demandasDeTrabalho.forEach((demanda, index) => {
        html += `
            <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed #eee;">
                <span><strong>${demanda.quantidade}x</strong> - ${demanda.nome_arte} (${demanda.tamanhoMm / 10}cm)</span>
                <button onclick="removerDemanda(${index})" style="background: none; border: none; color: #dc3545; cursor: pointer; font-weight: bold; font-size: 14px;">&times;</button>
            </li>
        `;
    });
    html += '</ul>';
    container.innerHTML = html;
}

// ==========================================
// INICIALIZAÇÃO DO DOM E EVENTOS UI
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    inputCodBarrasManual = document.getElementById('inputCodBarrasManual');
    mainContent = document.getElementById('mainContent');
    selectTamanhoAdesivo = document.getElementById('selectTamanhoAdesivo');
    selectTamanho = document.getElementById('selectTamanho');
    inputPedido = document.getElementById('inputPedido');
    inputCopias = document.getElementById('inputCopias');
    inputZoom = document.getElementById('inputZoom');
    zoomValor = document.getElementById('zoomValor');

    textColorInput = document.getElementById('editTextoCor');
    textSizeInput = document.getElementById('editTextoTamanho');
    textValueInput = document.getElementById('editTextoValor');
    textFontSelect = document.getElementById('editTextoFonte');
    textRotationInput = document.getElementById('editTextoRotacao');

    if (inputZoom) {
        inputZoom.addEventListener('input', atualizarZoomVisual);
    }
    
    // 🎯 O PULO DO GATO: Monitora selects mudando apenas a folha de produção, sem tocar nas pastas da barra lateral!
    if (selectTamanho) {
        selectTamanho.addEventListener('change', renderizarSistema);
    }
    if (selectTamanhoAdesivo) {
        selectTamanhoAdesivo.addEventListener('change', renderizarSistema);
    }
    
    if (inputPedido) inputPedido.addEventListener('input', renderizarSistema);
    if (inputCopias) inputCopias.addEventListener('input', renderizarSistema);
    if (inputCodBarrasManual) inputCodBarrasManual.addEventListener('input', renderizarSistema);

    // Monitoramento do Modal de Gabarito
    if (textValueInput) {
        textValueInput.addEventListener('input', (e) => {
            if (!itemSelecionado) return;
            itemSelecionado.dados.texto = e.target.value; 
            if(itemSelecionado.elHtml) itemSelecionado.elHtml.innerText = e.target.value;
        });
    }
    if (textColorInput) {
        textColorInput.addEventListener('input', (e) => {
            if (!itemSelecionado) return;
            itemSelecionado.dados.cor = e.target.value; 
            if(itemSelecionado.elHtml) itemSelecionado.elHtml.style.color = e.target.value;
        });
    }
    if (textSizeInput) {
    textSizeInput.addEventListener('input', (e) => {
        if (!itemSelecionado) return;
        const valor = parseInt(e.target.value) || 10;
        
        if (itemSelecionado.dados.tipo === 'faca') {
            // Se for faca, o input controla o tamanho percentual dela na imagem
            itemSelecionado.dados.w = valor;
            itemSelecionado.dados.h = valor; // Mantém proporcional para círculos
            
            itemSelecionado.elHtml.style.width = `${(valor / 100) * 450}px`;
            itemSelecionado.elHtml.style.height = `${(valor / 100) * 450}px`;
        } else {
            // Código antigo para textos comuns
            itemSelecionado.dados.tamanho = valor;
            itemSelecionado.elHtml.style.fontSize = `${valor}px`;
        }
    });
}
    if (textFontSelect) {
        textFontSelect.addEventListener('change', (e) => {
            if (!itemSelecionado) return;
            itemSelecionado.dados.fonte = e.target.value;
            itemSelecionado.elHtml.style.fontFamily = e.target.value;
        });
    }
    if (textRotationInput) {
        textRotationInput.addEventListener('input', (e) => {
            if (!itemSelecionado) return;
            itemSelecionado.dados.rotacao = parseInt(e.target.value) || 0;
            itemSelecionado.elHtml.style.transform = `rotate(${itemSelecionado.dados.rotacao}deg)`;
        });
    }

    const txtListaAlunos = document.getElementById('txtListaAlunos');
    if (txtListaAlunos) {
        txtListaAlunos.addEventListener('input', renderizarSistema);
    }

    // 🔍 O campo de busca da barra lateral agora filtra os Grupos!
    const elBusca = document.getElementById('searchInput');
    if (elBusca) {
        elBusca.addEventListener('input', () => {
            const filtro = elBusca.value.toLowerCase();
            // Filtra as artes em memória temporariamente para os grupos exibirem apenas o match
            renderizarCatalogoComGrupos(filtro);
        });
    }

    if (typeof google !== 'undefined') {
        window.inicializarGoogleAuth();
    }
});

// ==========================================
// GOOGLE AUTH E SESSÕES
// ==========================================

window.inicializarGoogleAuth = function() {
    if (typeof google === 'undefined') {
        console.error("A biblioteca do Google gapi/gsi não foi detectada no HTML.");
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                googleAccessToken = tokenResponse.access_token;
                
                const dadosSessao = {
                    token: googleAccessToken,
                    expiraEm: Date.now() + (tokenResponse.expires_in * 1000)
                };
                localStorage.setItem('mila_drive_sessao', JSON.stringify(dadosSessao));
                
                console.log("Autenticado no Google com sucesso e sessão salva!");
                await listarArtesDoGoogleDrive();
            }
        },
    });

    verificarSessaoExistente();
};

async function verificarSessaoExistente() {
    const sessaoSalva = localStorage.getItem('mila_drive_sessao');
    if (!sessaoSalva) return;

    try {
        const dados = JSON.parse(sessaoSalva);
        
        if (dados.token && dados.expiraEm > (Date.now() + 30000)) {
            googleAccessToken = dados.token;
            console.log("Sessão recuperada automaticamente! Carregando arquivos...");
            
            const btnConectar = document.querySelector('.busca-container button') || document.querySelector('button[onclick*="conectarGoogleDrive"]');
            if (btnConectar) {
                btnConectar.innerHTML = "🔄 Conectado ao Google Drive";
                btnConectar.style.backgroundColor = "#28a745"; 
                btnConectar.style.color = "white";
            }

            await listarArtesDoGoogleDrive();
            renderizarCatalogoComGrupos(); // 👈 ADICIONADO AQUI TAMBÉM POR SEGURANÇA
        } else {
            console.log("Sessão anterior expirada. Necessário novo login.");
            localStorage.removeItem('mila_drive_sessao'); 
        }
    } catch (e) {
        console.error("Erro ao ler sessão salva:", e);
    }
}

window.conectarGoogleDrive = function() {
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else if (typeof google !== 'undefined') {
        console.log("Inicializando autenticação atrasada...");
        window.inicializarGoogleAuth();
        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    } else {
        alert("O sistema do Google não pôde ser carregado. Verifique sua conexão com a internet.");
    }
};

// ====== IMPRESSÃO INTELIGENTE SEM PERDA DE ESCALA (100%) ======
window.executarImpressaoLote = function() {
    const inputZoom = document.getElementById('inputZoom');
    
    // 1. Salva o zoom visual que você estava usando na tela
    const zoomOriginal = inputZoom ? inputZoom.value : "100";
    
    // 2. Reseta o zoom visual para 100% temporariamente para não diminuir o PDF
    if (inputZoom) {
        inputZoom.value = "100";
        atualizarZoomVisual();
    }
    
    // 3. Abre o gerenciador de impressão do navegador com um pequeno delay para renderizar a escala
    setTimeout(() => {
        window.print();
        
        // 4. Retorna o zoom visual original na tela após a abertura do painel
        setTimeout(() => {
            if (inputZoom) {
                inputZoom.value = zoomOriginal;
                atualizarZoomVisual();
            }
        }, 500);
    }, 150);
};

window.conectarGoogleDrive = function() {
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else if (typeof google !== 'undefined') {
        console.log("Inicializando autenticação atrasada...");
        window.inicializarGoogleAuth();
        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    } else {
        alert("O sistema do Google não pôde ser carregado. Verifique sua conexão com a internet.");
    }
};

function renderizarCatalogoComGrupos(termoFiltro = "") {
    const grid = document.getElementById('imageGrid');
    if (!grid) return;
    
    grid.innerHTML = '';

    if (gruposDeArtes[0].artes.length === 0 && bancoDeArtes.length > 0) {
        gruposDeArtes[0].artes = [...bancoDeArtes];
        salvarGruposNoStorage();
    }

    gruposDeArtes.forEach(grupo => {
        // Filtra as artes deste grupo com base na busca caso o usuário digite algo
        const artesFiltradas = grupo.artes.filter(img => 
            (img.nome || "").toLowerCase().includes(termoFiltro)
        );

        // Se o usuário buscou algo e este grupo não tem nenhuma imagem com esse nome, oculta o box
        if (termoFiltro !== "" && artesFiltradas.length === 0) return;

        const grupoBox = document.createElement('div');
        grupoBox.style.background = '#fcfcfc';
        grupoBox.style.border = '1px solid #dcdcdc';
        grupoBox.style.borderRadius = '6px';
        grupoBox.style.padding = '10px';
        grupoBox.style.marginBottom = '10px';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';
        header.style.borderBottom = '1px solid #e6e6e6';
        header.style.paddingBottom = '4px';

        const titulo = document.createElement('span');
        titulo.innerText = `📂 ${grupo.nome} (${artesFiltradas.length})`;
        titulo.style.fontWeight = 'bold';
        titulo.style.fontSize = '12px';
        titulo.style.cursor = 'pointer';
        titulo.ondblclick = () => renomearGrupo(grupo.id);
        header.appendChild(titulo);

        // Container para agrupar os botões de ação na direita do título
        const acoesBox = document.createElement('div');
        acoesBox.style.display = 'flex';
        acoesBox.style.gap = '4px';

        // 1. BOTÃO PARA ABRIR O MODAL GRANDE DE BUSCA E GERENCIAMENTO
        const btnGerenciar = document.createElement('button');
        btnGerenciar.innerText = '⚙️ Config';
        btnGerenciar.style.background = '#34495e';
        btnGerenciar.style.color = 'white';
        btnGerenciar.style.border = 'none';
        btnGerenciar.style.padding = '3px 7px';
        btnGerenciar.style.borderRadius = '3px';
        btnGerenciar.style.fontSize = '10px';
        btnGerenciar.style.cursor = 'pointer';
        btnGerenciar.onclick = () => abrirGerenciadorGrupo(grupo.id);
        acoesBox.appendChild(btnGerenciar);

        // 🔥 2. NOVO BOTÃO EXPLÍCITO DE RENOMEAR (Não aparece no grupo geral)
        if (grupo.id !== 'grupo-geral') {
            const btnEditarNome = document.createElement('button');
            btnEditarNome.innerText = '✏️';
            btnEditarNome.style.background = '#f1c40f'; // Amarelo/Dourado profissional
            btnEditarNome.style.color = 'black';
            btnEditarNome.style.border = 'none';
            btnEditarNome.style.padding = '3px 6px';
            btnEditarNome.style.borderRadius = '3px';
            btnEditarNome.style.fontSize = '9px';
            btnEditarNome.style.cursor = 'pointer';
            btnEditarNome.title = "Renomear este grupo";
            btnEditarNome.onclick = () => window.renomearGrupo(grupo.id);
            acoesBox.appendChild(btnEditarNome);
        }

        // 3. BOTÃO DE EXCLUIR GRUPO (Não aparece no grupo geral)
        if (grupo.id !== 'grupo-geral') {
            const btnExcluir = document.createElement('button');
            btnExcluir.innerText = '❌';
            btnExcluir.style.background = '#e74c3c';
            btnExcluir.style.color = 'white';
            btnExcluir.style.border = 'none';
            btnExcluir.style.padding = '3px 6px';
            btnExcluir.style.borderRadius = '3px';
            btnExcluir.style.fontSize = '9px';
            btnExcluir.style.cursor = 'pointer';
            btnExcluir.title = "Excluir esta pasta";
            btnExcluir.onclick = () => window.excluirGrupo(grupo.id);
            acoesBox.appendChild(btnExcluir);
        }

        header.appendChild(acoesBox);
        grupoBox.appendChild(header);

        const containerMiniaturas = document.createElement('div');
        containerMiniaturas.style.display = 'flex';
        containerMiniaturas.style.gap = '8px';
        containerMiniaturas.style.overflowX = 'auto';
        containerMiniaturas.style.padding = '4px 0';

        if (artesFiltradas.length === 0) {
            const em = document.createElement('em');
            em.innerText = 'Nenhuma arte...';
            em.style.color = '#bbb';
            em.style.fontSize = '11px';
            containerMiniaturas.appendChild(em);
        } else {
            artesFiltradas.forEach(img => {
                const imgWrapper = document.createElement('div');
                imgWrapper.style.position = 'relative';
                imgWrapper.style.minWidth = '75px';
                imgWrapper.style.width = '75px';
                imgWrapper.style.height = '75px';
                imgWrapper.style.border = img.id === window.imagemSelecionadaId ? '2px solid #0056b3' : '2px solid #ddd';
                imgWrapper.style.borderRadius = '4px';
                imgWrapper.style.overflow = 'hidden';
                imgWrapper.style.cursor = 'pointer';

                const thumb = document.createElement('img');
                // 🛑 FORÇA A URL DO CORPO DO DRIVE CONVERTIDA PARA NÃO QUEBRAR
                if (img.id) {
                    thumb.src = `https://lh3.googleusercontent.com/d/${img.id}=s220`;
                } else {
                    thumb.src = img.url;
                }
                thumb.style.width = '100%';
                thumb.style.height = '100%';
                thumb.style.objectFit = 'contain';
                
                // Clique simples: Seleciona a arte base ou abre se não tiver gabarito
                thumb.onclick = () => {
                    window.imagemSelecionadaId = img.id;
                    
                    const arteGlobal = bancoDeArtes.find(a => a.id === img.id);
                    const temGabarito = arteGlobal && arteGlobal.layout && arteGlobal.layout.length > 0;
                    
                    if (!temGabarito) {
                        console.log(`Arte "${img.nome}" sem gabarito. Abrindo editor...`);
                        setTimeout(() => { abrirModalEdicao(img.id); }, 300);
                    } else {
                        console.log(`Arte "${img.nome}" selecionada com sucesso!`);
                        renderizarSistema();
                        renderizarCatalogoComGrupos(termoFiltro);
                    }
                };

                // 🔥 ADICIONADO DE VOLTA: DUPLO CLIQUE FORÇA A ABERTURA DO EDITOR
                thumb.ondblclick = () => {
                    console.log(`Forçando reedição de gabarito para a arte: ${img.nome}`);
                    window.imagemSelecionadaId = img.id;
                    abrirModalEdicao(img.id);
                };

                imgWrapper.appendChild(thumb);
                containerMiniaturas.appendChild(imgWrapper);
            });
        }
        grupoBox.appendChild(containerMiniaturas);
        grid.appendChild(grupoBox);
    });
}

let grupoAtivoId = null; 
let termoBuscaModal = "";

window.abrirGerenciadorGrupo = function(grupoId) {
    const grupo = gruposDeArtes.find(g => g.id === grupoId);
    if (!grupo) return;

    grupoAtivoId = grupoId;
    termoBuscaModal = "";
    
    const modal = document.getElementById('modalGerenciadorGrupo');
    const inputBusca = document.getElementById('buscaNomeModalGrupo');
    const tituloModal = document.getElementById('tituloModalGrupo');
    const chkFiltro = document.getElementById('chkMostrarApenasGrupo');

    if (inputBusca) inputBusca.value = "";
    if (tituloModal) tituloModal.innerText = `Adicionar Imagens a: ${grupo.nome}`;
    
    // 🎯 CORREÇÃO: Força o checkbox a iniciar MARCADO por padrão!
    if (chkFiltro) chkFiltro.checked = true; 
    
    if (modal) {
        modal.style.setProperty('display', 'flex', 'important');
        renderizarImagensNoModal();
    }
};

window.fecharModalGerenciadorGrupo = function() {
    const modal = document.getElementById('modalGerenciadorGrupo');
    if (modal) {
        modal.style.display = 'none';
    }
    grupoAtivoId = null;
    renderizarCatalogoComGrupos(); // Recarrega o catálogo lateral atualizado
};

window.filtrarImagensNoModalGrupo = function() {
    const inputBusca = document.getElementById('buscaNomeModalGrupo');
    termoBuscaModal = inputBusca ? inputBusca.value.toLowerCase() : "";
    renderizarImagensNoModal();
};

function renderizarImagensNoModal() {
    const gridModal = document.getElementById('gridImagensModalGrupo');
    if (!gridModal) return;
    gridModal.innerHTML = '';

    const grupoAtual = gruposDeArtes.find(g => g.id === grupoAtivoId);
    if (!grupoAtual) return;

    const chkFiltro = document.getElementById('chkMostrarApenasGrupo');
    const apenasDoGrupo = chkFiltro ? chkFiltro.checked : false;

    // 1. Aplica o filtro por nome vindo da barra de busca
    let imagensFiltradas = bancoDeArtes.filter(img => 
        (img.nome || "").toLowerCase().includes(termoBuscaModal)
    );

    // 2. 🔥 NOVO FILTRO: Se ativado, remove tudo o que não pertence ao grupo ativo
    if (apenasDoGrupo) {
        imagensFiltradas = imagensFiltradas.filter(img => 
            grupoAtual.artes.some(a => a.id === img.id)
        );
    }

    if (imagensFiltradas.length === 0) {
        gridModal.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #7f8c8d; font-style: italic; margin-top: 30px;">Nenhuma imagem localizada neste filtro.</p>';
        return;
    }

    imagensFiltradas.forEach(img => {
        const jaEstaNoGrupo = grupoAtual.artes.some(a => a.id === img.id);

        const card = document.createElement('div');
        card.style.background = 'white';
        card.style.border = jaEstaNoGrupo ? '3px solid #2ecc71' : '1px solid #cbd5e1';
        card.style.borderRadius = '8px';
        card.style.padding = '10px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.position = 'relative';
        card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

        const previewContainer = document.createElement('div');
        previewContainer.style.width = '120px';
        previewContainer.style.height = '120px';
        previewContainer.style.marginBottom = '8px';

        const imgEl = document.createElement('img');
        imgEl.src = img.id ? `https://lh3.googleusercontent.com/d/${img.id}=s220` : img.url;
        imgEl.style.width = '100%';
        imgEl.style.height = '100%';
        imgEl.style.objectFit = 'contain';
        previewContainer.appendChild(imgEl);

        const label = document.createElement('span');
        label.innerText = img.nome || 'Sem Nome';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.textAlign = 'center';
        label.style.marginBottom = '8px';

        const btnAcao = document.createElement('button');
        btnAcao.innerText = jaEstaNoGrupo ? '✓ Incluído' : '➕ Adicionar';
        btnAcao.style.width = '100%';
        btnAcao.style.padding = '6px';
        btnAcao.style.border = 'none';
        btnAcao.style.borderRadius = '4px';
        btnAcao.style.fontWeight = 'bold';
        btnAcao.style.cursor = 'pointer';
        btnAcao.style.background = jaEstaNoGrupo ? '#2ecc71' : '#3498db';
        btnAcao.style.color = 'white';

        btnAcao.onclick = () => {
            if (jaEstaNoGrupo) {
                grupoAtual.artes = grupoAtual.artes.filter(a => a.id !== img.id);
            } else {
                grupoAtual.artes.push(img);
            }
            salvarGruposNoStorage(); 
            
            // Se o usuário estiver no modo "apenas do grupo" e remover a imagem, ela deve sumir da tela na hora
            renderizarImagensNoModal(); 
        };

        card.appendChild(previewContainer);
        card.appendChild(label);
        card.appendChild(btnAcao);
        gridModal.appendChild(card);
    });
}
