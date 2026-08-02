// ==========================================
// CONFIGURAÇÕES DO GOOGLE DEVELOPER CONSOLE
// ==========================================
const CLIENT_ID = '609261412025-53ncfn934c13nbecbdn2t8c9npvk7jsa.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets';

// Configure o worker do PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ==========================================
// BANCO DE GRADES E MATRIZES (PERSISTÊNCIA LOCAL)
// ==========================================
let bancoDeMatrizes = JSON.parse(localStorage.getItem('minhasMatrizes')) || [
    { 
        id: 'matriz_padrao_5cm', 
        nome: 'Adesivo 5cm (50mm) - 20 Unidades', 
        tipo: 'MATRIZ',
        linhas: 5, colunas: 4, tamMm: 50, gapX: 0, gapY: 1.75, margemX: 5, margemY: 16.5 
    },
    { 
        id: 'matriz_3cm_70unid', 
        nome: 'Adesivo 3cm (30mm) - 70 Unidades (Colmeia)', 
        tipo: 'MATRIZ',
        linhas: 11, colunas: 7, tamMm: 30, gapX: 0, gapY: -2.8, margemX: 0, margemY: 22.0 
    }
];

// Variáveis Globais do Sistema
let inputCodBarrasManual, mainContent, selectTamanho, inputPedido, inputZoom, zoomValor;
let textColorInput, textSizeInput, textValueInput, textFontSelect, textRotationInput;

let bancoDeArtes = [];
let googleAccessToken = null;
let tokenClient = null;
let planilhaBancoId = null; 
let dicionarioGabaritos = {}; 
let demandasDeTrabalho = []; 

let itemSelecionado = null;
let arrastando = false;
let offsetStartX = 0, offsetStartY = 0;
let imagemAtivaId = null;

// Grupos e Pastas de Artes
let gruposDeArtes = JSON.parse(localStorage.getItem('mila_grupos_artes')) || [
    { id: 'grupo-geral', nome: 'Todas as Artes (Geral)', artes: [] }
];

function salvarGruposNoStorage() {
    localStorage.setItem('mila_grupos_artes', JSON.stringify(gruposDeArtes));
}

window.criarNovoGrupo = function() {
    const nomeGrupo = prompt("Digite o nome da nova pasta de artes:", "Nova Pasta");
    if (!nomeGrupo || nomeGrupo.trim() === "") return;

    const novoId = 'grupo-' + Date.now();
    gruposDeArtes.push({ id: novoId, nome: nomeGrupo.trim(), artes: [] });
    salvarGruposNoStorage();
    renderizarCatalogoComGrupos();
};

window.renomearGrupo = function(grupoId) {
    if (grupoId === 'grupo-geral') return alert("A pasta Geral não pode ser renomeada.");
    const grupo = gruposDeArtes.find(g => g.id === grupoId);
    if (!grupo) return;

    const novoNome = prompt(`Renomear "${grupo.nome}" para:`, grupo.nome);
    if (!novoNome || novoNome.trim() === "") return;

    grupo.nome = novoNome.trim();
    salvarGruposNoStorage(); 
    renderizarCatalogoComGrupos();
};

window.excluirGrupo = function(grupoId) {
    if (grupoId === 'grupo-geral') return alert("A pasta Geral não pode ser excluída.");
    const grupo = gruposDeArtes.find(g => g.id === grupoId);
    if (!grupo) return;

    if (confirm(`Tem certeza que deseja excluir a pasta "${grupo.nome}"?`)) {
        gruposDeArtes = gruposDeArtes.filter(g => g.id !== grupoId);
        salvarGruposNoStorage();
        renderizarCatalogoComGrupos();
    }
};

// ==========================================
// GERENCIADOR DE MATRIZES E UPLOAD SVG/PDF
// ==========================================
function carregarSelectMatrizes() {
    const select = document.getElementById('selectGradeDin');
    if (!select) return;

    select.innerHTML = '';
    bancoDeMatrizes.forEach(matriz => {
        const opt = document.createElement('option');
        opt.value = matriz.id;
        let icone = '📐 ';
        if (matriz.tipo === 'PDF') icone = '📄 ';
        if (matriz.tipo === 'SVG') icone = '🎨 ';

        opt.textContent = icone + matriz.nome;
        select.appendChild(opt);
    });
}

function abrirMenuNovaGrade() {
    const form = document.getElementById('formNovaGrade');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function salvarNovaGradeMatriz() {
    const novaMatriz = {
        id: 'matriz_' + Date.now(),
        nome: document.getElementById('ng_nome').value || 'Matriz Personalizada',
        tipo: 'MATRIZ',
        tamMm: parseFloat(document.getElementById('ng_tam').value) || 30,
        linhas: parseInt(document.getElementById('ng_linhas').value) || 1,
        colunas: parseInt(document.getElementById('ng_cols').value) || 1,
        gapX: parseFloat(document.getElementById('ng_gapX').value) || 0,
        gapY: parseFloat(document.getElementById('ng_gapY').value) || 0,
        margemX: parseFloat(document.getElementById('ng_margX').value) || 5,
        margemY: parseFloat(document.getElementById('ng_margY').value) || 15
    };

    bancoDeMatrizes.push(novaMatriz);
    localStorage.setItem('minhasMatrizes', JSON.stringify(bancoDeMatrizes));
    carregarSelectMatrizes();
    
    if (document.getElementById('formNovaGrade')) document.getElementById('formNovaGrade').style.display = 'none';
    document.getElementById('selectGradeDin').value = novaMatriz.id;
    
    adicionarDemandaMatriz();
}

function excluirGradeSelecionada() {
    const select = document.getElementById('selectGradeDin');
    if (!select) return;

    const idParaRemover = select.value;
    const item = bancoDeMatrizes.find(m => m.id === idParaRemover);
    if (!item) return;

    if (confirm(`Excluir a grade "${item.nome}"?`)) {
        bancoDeMatrizes = bancoDeMatrizes.filter(m => m.id !== idParaRemover);
        localStorage.setItem('minhasMatrizes', JSON.stringify(bancoDeMatrizes));
        carregarSelectMatrizes();

        if (bancoDeMatrizes.length > 0) {
            select.value = bancoDeMatrizes[0].id;
            adicionarDemandaMatriz();
        } else {
            demandasDeTrabalho = [];
            renderizarSistema();
        }
    }
}

function alternarExibicaoMatriz() {
    adicionarDemandaMatriz();
}

function adicionarDemandaMatriz() {
    const elSelect = document.getElementById('selectGradeDin');
    if (!elSelect) return;

    const idMatriz = elSelect.value;
    const matriz = bancoDeMatrizes.find(m => m.id === idMatriz);
    if (!matriz) return;

    const idArte = window.imagemSelecionadaId || (bancoDeArtes[0] ? bancoDeArtes[0].id : null);

    demandasDeTrabalho = [{
        id_arte: idArte,
        id_matriz: idMatriz,
        matrizObjeto: matriz
    }];

    if (matriz.tipo === 'SVG') {
        window.gradeSVGAtiva = matriz;
        renderizarSistemaSVGVetorial();
    } else if (matriz.tipo === 'PDF') {
        window.gradePDFAtiva = matriz;
        renderizarSistemaPDFVetorial();
    } else {
        renderizarSistema();
    }
}

// ==========================================
// PROCESSADORES DE UPLOAD (SVG & PDF)
// ==========================================
function processarUploadGradeSVG(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const conteudoSVG = e.target.result;
        const parser = new DOMParser();
        const docSVG = parser.parseFromString(conteudoSVG, "image/svg+xml");
        const svgEl = docSVG.querySelector('svg');

        if (!svgEl) return alert("Arquivo SVG inválido!");

        let larguraFolha = 210, alturaFolha = 297;
        if (svgEl.getAttribute('viewBox')) {
            const vb = svgEl.getAttribute('viewBox').split(/[\s,]+/).map(Number);
            larguraFolha = vb[2] || 210;
            alturaFolha = vb[3] || 297;
        }

        const slotsExtraidos = extrairSlotsDoSVG(docSVG, larguraFolha, alturaFolha);
        if (slotsExtraidos.length === 0) return alert("Aviso: Nenhum círculo vetorial foi identificado neste SVG.");

        // 🚀 O PULO DO GATO: Converte o SVG para Data URL Base64 para persistir permanentemente no localStorage
        const base64Fundo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(conteudoSVG);

        const novaGradeSVG = {
            id: 'svg_grade_' + Date.now(),
            nome: file.name.replace('.svg', ''),
            tipo: 'SVG',
            imagemFundo: base64Fundo, // Salva o base64 e não o blob temporário!
            slots: slotsExtraidos
        };

        bancoDeMatrizes.push(novaGradeSVG);
        localStorage.setItem('minhasMatrizes', JSON.stringify(bancoDeMatrizes));

        carregarSelectMatrizes();
        document.getElementById('selectGradeDin').value = novaGradeSVG.id;
        
        alert(`Grade SVG "${novaGradeSVG.nome}" salva com sucesso! O QR Code e as marcas agora estão fixas.`);
        adicionarDemandaMatriz();
    };

    reader.readAsText(file);
}

function extrairSlotsDoSVG(docSVG, larguraFolha, alturaFolha) {
    const slots = [];
    const svgEl = docSVG.querySelector('svg');
    if (!svgEl) return [];

    let vbW = 21000, vbH = 29700;
    if (svgEl.getAttribute('viewBox')) {
        const vb = svgEl.getAttribute('viewBox').split(/[\s,]+/).map(Number);
        vbW = vb[2] || 21000;
        vbH = vb[3] || 29700;
    }

    const fatorX = 210 / vbW;
    const fatorY = 297 / vbH;

    let camadaAlvo = docSVG.querySelector('g[inkscape\\:label*="Camada"], g#layer2, g[id*="Camada"]') || svgEl;
    const elementos = Array.from(camadaAlvo.querySelectorAll('circle, path'));

    elementos.forEach(el => {
        const paiMarca = el.closest('g[id*="mark"], g[id*="Mark"], g[id*="QR"]');
        if (paiMarca) return;

        let posX = null, posY = null, diametro = null;

        if (el.tagName.toLowerCase() === 'circle') {
            const cx = parseFloat(el.getAttribute('cx') || 0);
            const cy = parseFloat(el.getAttribute('cy') || 0);
            const r = parseFloat(el.getAttribute('r') || 0);

            if (r > 0) {
                diametro = (r * 2) * fatorX;
                posX = (cx - r) * fatorX;
                posY = (cy - r) * fatorY;
            }
        } 
        else if (el.tagName.toLowerCase() === 'path') {
            const dAttr = el.getAttribute('d') || '';
            const matchArco = dAttr.match(/A\s*([\d.]+)\s*,\s*([\d.]+)/i);
            
            if (matchArco) {
                const raioUnits = parseFloat(matchArco[1]);
                diametro = (raioUnits * 2) * fatorX;

                try {
                    if (typeof el.getBBox === 'function') {
                        const bb = el.getBBox();
                        if (bb && bb.width > 0) {
                            posX = bb.x * fatorX;
                            posY = bb.y * fatorY;
                        }
                    }
                } catch(e) {}

                if (posX === null) {
                    const coords = dAttr.match(/[-+]?[0-9]*\.?[0-9]+/g);
                    if (coords && coords.length >= 2) {
                        const x1 = parseFloat(coords[0]);
                        const y1 = parseFloat(coords[1]);
                        posX = (x1 - (raioUnits * 2)) * fatorX;
                        posY = (y1 - raioUnits) * fatorY;
                    }
                }
            }
        }

        if (diametro && diametro >= 15 && diametro <= 140 && posX !== null && posY !== null) {
            const jaExiste = slots.some(s => Math.abs(s.x - posX) < 3 && Math.abs(s.y - posY) < 3);
            if (!jaExiste) {
                slots.push({ x: posX, y: posY, diametro: diametro });
            }
        }
    });

    slots.sort((a, b) => {
        if (Math.abs(a.y - b.y) > (a.diametro * 0.35)) return a.y - b.y;
        return a.x - b.x;
    });

    return slots;
}

function processarUploadGradePDF(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') return alert("Selecione um arquivo PDF válido!");

    const reader = new FileReader();
    reader.onload = function(e) {
        const typedarray = new Uint8Array(e.target.result);

        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
            pdf.getPage(1).then(async page => {
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const imagemFundoPDF = canvas.toDataURL('image/png');

                const opList = await page.getOperatorList();
                const slotsExtraidos = extrairCirculosDoPDF(opList, page.view);

                const novoPDF = {
                    id: 'pdf_grade_' + Date.now(),
                    nome: file.name.replace('.pdf', ''),
                    tipo: 'PDF',
                    imagemFundo: imagemFundoPDF,
                    slots: slotsExtraidos
                };

                bancoDeMatrizes.push(novoPDF);
                localStorage.setItem('minhasMatrizes', JSON.stringify(bancoDeMatrizes));

                carregarSelectMatrizes();
                document.getElementById('selectGradeDin').value = novoPDF.id;
                
                alert(`Grade PDF "${novoPDF.nome}" adicionada com sucesso!`);
                adicionarDemandaMatriz();
            });
        });
    };

    reader.readAsArrayBuffer(file);
}

function extrairCirculosDoPDF(opList, view) {
    const fnArray = opList.fnArray;
    const argsArray = opList.argsArray;
    const slots = [];

    const pdfWidth = view[2];
    const pdfHeight = view[3];
    const fatorX = 210 / pdfWidth;
    const fatorY = 297 / pdfHeight;

    for (let i = 0; i < fnArray.length; i++) {
        if (fnArray[i] === pdfjsLib.OPS.constructPath) {
            const pathData = argsArray[i];
            const args = pathData[1];

            if (args && args.length >= 8) {
                let minX = Infinity, maxX = -Infinity;
                let minY = Infinity, maxY = -Infinity;

                for (let j = 0; j < args.length; j += 2) {
                    const x = args[j] * fatorX;
                    const y = (pdfHeight - args[j+1]) * fatorY;

                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }

                const largura = maxX - minX;
                const altura = maxY - minY;

                if (largura > 10 && largura < 100 && Math.abs(largura - altura) < 2) {
                    const centroX = minX;
                    const centroY = minY;

                    const jaExiste = slots.some(s => Math.abs(s.x - centroX) < 2 && Math.abs(s.y - centroY) < 2);
                    if (!jaExiste) {
                        slots.push({ x: centroX, y: centroY, diametro: largura });
                    }
                }
            }
        }
    }

    slots.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 5) return a.y - b.y;
        return a.x - b.x;
    });

    return slots;
}

// ==========================================
// RENDERIZAÇÃO GRADE SVG VETORIAL
// ==========================================
// ==========================================
// RENDERIZAÇÃO GRADE SVG VETORIAL (MANTÉM O SVG INTEIRO)
// ==========================================
function renderizarSistemaSVGVetorial() {
    const elMain = mainContent || document.getElementById('mainContent');
    if (!elMain || !window.gradeSVGAtiva) return;

    elMain.innerHTML = '';
    const grade = window.gradeSVGAtiva;
    const demandaArte = demandasDeTrabalho.length > 0 ? demandasDeTrabalho[0] : null;
    const arteOriginal = demandaArte ? bancoDeArtes.find(img => img.id === demandaArte.id_arte) : null;

    const txtLista = document.getElementById('txtListaAlunos');
    const textoRaw = txtLista ? txtLista.value.trim() : '';

    let listaAlunos = processarListaTexto(textoRaw);
    if (listaAlunos.length === 0) {
        listaAlunos = [{ nome: "Felipe Dias", serie: "Teste", escola: "Teste" }];
    }

    // 🚀 GERA 1 FOLHA COMPLETA PARA CADA ALUNO DA LISTA MANTENDO O SVG ORIGINAL
    listaAlunos.forEach(alunoDados => {
        const pageScaler = document.createElement('div');
        pageScaler.className = 'page-scaler';

        const printArea = document.createElement('div');
        printArea.className = 'print-area';
        printArea.style.width = '210mm';
        printArea.style.height = '297mm';
        printArea.style.position = 'relative';
        printArea.style.backgroundColor = 'transparent'; // Deixa transparente para exibir o SVG base com suas marcas e QR originais

        // Fundo com o SVG COMPLETO original (trazendo marcas de corte e QR code nativos do arquivo)
        const imgFundo = document.createElement('img');
        imgFundo.src = grade.imagemFundo;
        imgFundo.style.position = 'absolute';
        imgFundo.style.top = '0';
        imgFundo.style.left = '0';
        imgFundo.style.width = '100%';
        imgFundo.style.height = '100%';
        imgFundo.style.zIndex = '1';
        printArea.appendChild(imgFundo);

        // Injeta os adesivos personalizados por cima dos slots mapeados
        if (arteOriginal) {
            grade.slots.forEach(slot => {
                const sticker = criarAdesivoComGabarito(arteOriginal, slot.diametro, slot.diametro, alunoDados);
                sticker.style.position = 'absolute';
                sticker.style.left = `${slot.x}mm`;
                sticker.style.top = `${slot.y}mm`;
                sticker.style.zIndex = '5'; // Fica acima do fundo SVG preenchendo os círculos

                printArea.appendChild(sticker);
            });
        }

        pageScaler.appendChild(printArea);
        elMain.appendChild(pageScaler);
    });

    atualizarZoomVisual();
}

function renderizarSistemaPDFVetorial() {
    const elMain = mainContent || document.getElementById('mainContent');
    if (!elMain || !window.gradePDFAtiva) return;

    elMain.innerHTML = '';
    const grade = window.gradePDFAtiva;
    const demandaArte = demandasDeTrabalho.length > 0 ? demandasDeTrabalho[0] : null;
    const arteOriginal = demandaArte ? bancoDeArtes.find(img => img.id === demandaArte.id_arte) : null;

    const pageScaler = document.createElement('div');
    pageScaler.className = 'page-scaler';

    const printArea = document.createElement('div');
    printArea.className = 'print-area';
    printArea.style.width = '210mm';
    printArea.style.height = '297mm';
    printArea.style.position = 'relative';
    printArea.style.backgroundColor = '#ffffff';

    const imgFundo = document.createElement('img');
    imgFundo.src = grade.imagemFundo;
    imgFundo.style.position = 'absolute';
    imgFundo.style.top = '0';
    imgFundo.style.left = '0';
    imgFundo.style.width = '100%';
    imgFundo.style.height = '100%';
    imgFundo.style.zIndex = '1';
    printArea.appendChild(imgFundo);

    if (arteOriginal) {
        const srcImagemSegura = arteOriginal.blobUrl || (arteOriginal.id ? `https://drive.google.com/thumbnail?id=${arteOriginal.id}&sz=w500` : arteOriginal.url);

        grade.slots.forEach((slot) => {
            const sticker = document.createElement('div');
            sticker.style.position = 'absolute';
            sticker.style.left = `${slot.x}mm`;
            sticker.style.top = `${slot.y}mm`;
            sticker.style.width = `${slot.diametro}mm`;
            sticker.style.height = `${slot.diametro}mm`;
            sticker.style.borderRadius = '50%';
            sticker.style.overflow = 'hidden';
            sticker.style.zIndex = '5';

            const imgEl = document.createElement('img');
            imgEl.src = srcImagemSegura;
            imgEl.style.width = '100%';
            imgEl.style.height = '100%';
            imgEl.style.objectFit = 'cover';
            imgEl.style.pointerEvents = 'none';

            sticker.appendChild(imgEl);
            printArea.appendChild(sticker);
        });
    }

    injetarQRCodesModeloOficial(printArea);
    pageScaler.appendChild(printArea);
    elMain.appendChild(pageScaler);
    atualizarZoomVisual();
}

// ==========================================
// INTEGRADOR DE BANCO DE DADOS (GOOGLE SHEETS)
// ==========================================
async function inicializarBancoSheets() {
    if (!googleAccessToken) return;

    const query = "name = 'Mila_Autoprint_Banco' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        const dados = await response.json();

        if (dados.files && dados.files.length > 0) {
            planilhaBancoId = dados.files[0].id;
            await carregarGabaritosDoBanco();
        } else {
            await criarNovoBancoSheets();
        }
    } catch (erro) {
        console.error("Erro ao inicializar Sheets:", erro);
    }
}

async function criarNovoBancoSheets() {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets';
    const payload = {
        properties: { title: 'Mila_Autoprint_Banco' },
        sheets: [{ properties: { title: 'Gabaritos' } }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const created = await response.json();
        planilhaBancoId = created.spreadsheetId;
    } catch (e) {}
}

async function carregarGabaritosDoBanco() {
    if (!planilhaBancoId) return;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A2:C`;

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        const dados = await response.json();
        dicionarioGabaritos = {}; 

        if (dados.values) {
            dados.values.forEach(linha => {
                try { dicionarioGabaritos[linha[0]] = JSON.parse(linha[2]); } catch (e) {}
            });
        }
    } catch (e) {}
}

async function salvarGabaritoNoSheets(idArte, nomeArte, layoutArray) {
    if (!planilhaBancoId) return;

    const urlLeitura = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A:A`;
    try {
        const res = await fetch(urlLeitura, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        const dados = await res.json();
        
        let idx = -1;
        if (dados.values) idx = dados.values.findIndex(r => r[0] === idArte);

        const payload = { values: [[idArte, nomeArte, JSON.stringify(layoutArray)]] };

        if (idx !== -1) {
            const linha = idx + 1;
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A${linha}:C${linha}?valueInputOption=USER_ENTERED`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${planilhaBancoId}/values/Gabaritos!A:C:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        dicionarioGabaritos[idArte] = layoutArray;
        const arte = bancoDeArtes.find(a => a.id === idArte);
        if (arte) arte.layout = layoutArray;
    } catch (e) {}
}

async function listarArtesDoGoogleDrive() {
    if (!googleAccessToken) return;
    await inicializarBancoSheets();

    const query = "mimeType contains 'image/' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        const dados = await response.json();

        if (dados.files && dados.files.length > 0) {
            bancoDeArtes = [];
            dados.files.forEach(arquivo => {
                const urlDrive = `https://lh3.googleusercontent.com/d/${arquivo.id}`;
                const nomeLimpo = arquivo.name.replace(/\.[^/.]+$/, ""); 
                const layoutSalvo = dicionarioGabaritos[arquivo.id] || [];

                bancoDeArtes.push({
                    id: arquivo.id, 
                    nome: nomeLimpo,
                    url: urlDrive,
                    layout: layoutSalvo
                });
            });

            renderizarCatalogoComGrupos(); 
            renderizarSistema();
        }
    } catch (e) {}
}

// ==========================================
// RENDERIZAÇÃO MATRIZ MANUAL (PADRÃO)
// ==========================================
function renderizarSistema() {
    const elMain = mainContent || document.getElementById('mainContent');
    if (!elMain) return;
    elMain.innerHTML = ''; 

    if (demandasDeTrabalho.length === 0) {
        elMain.innerHTML = `<p id="previewPlaceholder" style="color: #7f8c8d; font-style: italic;">Selecione a arte no catálogo para visualizar a folha.</p>`;
        atualizarZoomVisual();
        return;
    }

    const demanda = demandasDeTrabalho[0];
    const arteOriginal = bancoDeArtes.find(img => img.id === demanda.id_arte);

    const txtLista = document.getElementById('txtListaAlunos');
    const textoRaw = txtLista ? txtLista.value.trim() : '';

    let listaAlunos = processarListaTexto(textoRaw);
    if (listaAlunos.length === 0) {
        listaAlunos = [{ nome: "Nome Exemplo", serie: "2º Ano", escola: "Escola ABC" }];
    }

    const idMatriz = demanda.id_matriz || 'matriz_padrao_5cm';
    const matrizAtiva = bancoDeMatrizes.find(m => m.id === idMatriz) || bancoDeMatrizes[0];
    const { linhas, colunas, tamMm, gapX, gapY, margemX, margemY } = matrizAtiva;

    // 🚀 LOOP POR ALUNO: Gera 1 folha inteira para CADA aluno da lista!
    listaAlunos.forEach(alunoDados => {
        const pageScaler = document.createElement('div');
        pageScaler.className = 'page-scaler';

        const printArea = document.createElement('div');
        printArea.className = 'print-area';
        printArea.style.width = '210mm';
        printArea.style.height = '297mm';
        printArea.style.position = 'relative';
        printArea.style.backgroundColor = '#ffffff';

        ['top:7mm; left:7mm', 'top:7mm; right:7mm', 'bottom:7mm; left:7mm', 'bottom:7mm; right:7mm'].forEach(pos => {
            const pt = document.createElement('div');
            pt.setAttribute('style', `position:absolute; width:5mm; height:5mm; background:#000; border-radius:50%; z-index:100; ${pos}`);
            printArea.appendChild(pt);
        });

        if (arteOriginal) {
            for (let r = 0; r < linhas; r++) {
                for (let c = 0; c < colunas; c++) {
                    const xMm = margemX + (c * (tamMm + gapX));
                    const yMm = margemY + (r * (tamMm + gapY));

                    const sticker = criarAdesivoComGabarito(arteOriginal, tamMm, tamMm, alunoDados);
                    sticker.style.position = 'absolute';
                    sticker.style.left = `${xMm}mm`;
                    sticker.style.top = `${yMm}mm`;

                    printArea.appendChild(sticker);
                }
            }
        }

        injetarQRCodesModeloOficial(printArea, alunoDados.pedido);
        pageScaler.appendChild(printArea);
        elMain.appendChild(pageScaler);
    });

    atualizarZoomVisual();
}

// ==========================================
// AUXILIAR DE PROCESSAMENTO DA LISTA DE TEXTO
// ==========================================
function processarListaTexto(textoRaw) {
    let listaAlunos = [];
    if (!textoRaw) return listaAlunos;

    const linhas = textoRaw.split(/[;\n]/);
    linhas.forEach(linha => {
        if (!linha.trim()) return;
        const partes = linha.split(/[,;-]/).map(s => s.trim());
        
        if (partes.length >= 3 && !isNaN(partes[0])) {
            listaAlunos.push({
                pedido: partes[0],
                nome: partes[1],
                serie: partes[2] || '',
                escola: partes[3] || ''
            });
        } else {
            listaAlunos.push({
                pedido: document.getElementById('inputPedido').value || '',
                nome: partes[0] || '',
                serie: partes[1] || '',
                escola: partes[2] || ''
            });
        }
    });

    return listaAlunos;
}



function criarAdesivoComGabarito(arte, larguraMm, alturaMm, dadosAluno) {
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = `${larguraMm}mm`;
    container.style.height = `${alturaMm}mm`;
    container.style.borderRadius = '50%';
    container.style.overflow = 'hidden';

    // Imagem do Personagem/Arte
    const bg = document.createElement('img');
    bg.src = arte.blobUrl || arte.url;
    bg.style.width = '100%';
    bg.style.height = '100%';
    bg.style.objectFit = 'cover';
    bg.style.position = 'absolute';
    bg.style.top = '0';
    bg.style.left = '0';
    bg.style.zIndex = '1';
    container.appendChild(bg);

    // Injeta as camadas de texto sobre o adesivo
    if (arte.layout && Array.isArray(arte.layout)) {
        arte.layout.forEach(p => {
            if (p.tipo === 'txt') {
                const txt = document.createElement('div');
                txt.style.position = 'absolute';
                txt.style.left = `${p.x}%`;
                txt.style.top = `${p.y}%`;
                txt.style.transform = `rotate(${p.rotacao || 0}deg)`;
                txt.style.color = p.cor || '#ffffff';
                txt.style.fontFamily = p.fonte || 'Arial';
                txt.style.fontWeight = 'bold';
                txt.style.zIndex = '10'; // Garante que o texto fique ACIMA da imagem
                txt.style.whiteSpace = 'nowrap';

                // Converte a proporção do tamanho da fonte no editor para milímetros reais
                const tamMmTxt = alturaMm * (parseFloat(p.tamanho || 14) / 450);
                txt.style.fontSize = `${tamMmTxt}mm`;
                txt.style.lineHeight = '1';

                const idNorm = (p.id || '').toLowerCase();
                let textoFinal = p.texto || p.label;

                if (idNorm.includes('nome')) textoFinal = dadosAluno.nome || textoFinal;
                else if (idNorm.includes('serie') || idNorm.includes('idade')) textoFinal = dadosAluno.serie || textoFinal;
                else if (idNorm.includes('escola') || idNorm.includes('obs')) textoFinal = dadosAluno.escola || textoFinal;

                txt.innerText = textoFinal;
                container.appendChild(txt);
            }
        });
    }

    return container;
}
function injetarQRCodesModeloOficial(printArea) {
    const elPedido = document.getElementById('inputPedido');
    const valorPedido = elPedido ? elPedido.value.trim() : '';

    const elCodManual = document.getElementById('inputCodBarrasManual');
    const valorCodManual = elCodManual ? elCodManual.value.trim() : '';

    const rodape = document.createElement('div');
    rodape.setAttribute('style', 'position:absolute; bottom:5mm; left:30mm; right:30mm; display:flex; justify-content:center; align-items:center; gap:3mm; z-index:100;');

    const qrRodape = document.createElement('div');
    qrRodape.style.width = '7mm';
    qrRodape.style.height = '7mm';

    const blocoCod = document.createElement('div');
    if (valorCodManual) {
        blocoCod.innerHTML = `
            <div style="font-family: 'Libre Barcode 39', sans-serif; font-size: 12px; color: #000;">*${valorCodManual}*</div>
            <div style="font-size: 5px; font-weight: bold; text-align:center;">${valorCodManual}</div>
        `;
    }

    rodape.appendChild(qrRodape);
    rodape.appendChild(blocoCod);
    printArea.appendChild(rodape);

    if (typeof QRCode !== 'undefined' && valorPedido) {
        new QRCode(qrRodape, { text: valorPedido, width: 25, height: 25 });
    }
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

// ==========================================
// EDITOR INTERATIVO DE GABARITO (MODAL)
// ==========================================
// ==========================================
// EDITOR INTERATIVO DE GABARITO (CORRIGIDO)
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
    canvas.innerHTML = `<img src="${arte.url}" style="width:100%; height:100%; object-fit:contain; position:absolute; top:0; left:0; pointer-events:none; z-index:1;">`;

    if (!arte.layout) arte.layout = [];
    
    arte.layout.forEach(p => {
        renderizarItemNoModalCanvas(p);
    });

    if (modal) modal.style.display = 'flex';
}

function adicionarCampoGabarito(tipoId, labelTexto) {
    if (!imagemAtivaId) return;
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (!arte) return;

    const novo = {
        id: tipoId,
        tipo: tipoId.split('-')[0],
        label: labelTexto,
        texto: labelTexto,
        x: 35, y: 35,
        cor: '#ffffff',
        tamanho: 14,
        fonte: 'Arial',
        rotacao: 0
    };

    arte.layout.push(novo);
    renderizarItemNoModalCanvas(novo);
}

function renderizarItemNoModalCanvas(param) {
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    if (!canvas) return;

    const el = document.createElement('div');
    el.className = 'draggable-text';
    el.innerText = param.texto || param.label;

    el.style.color = param.cor || '#ffffff';
    el.style.fontSize = `${param.tamanho || 14}px`;
    el.style.fontFamily = param.fonte || 'Arial';
    el.style.zIndex = '100'; 

    const posX = (param.x / 100) * canvas.clientWidth;
    const posY = (param.y / 100) * canvas.clientHeight;

    el.style.left = `${posX}px`;
    el.style.top = `${posY}px`;

    // Inicia o arraste calculando a posição correta relativa ao elemento
    el.onmousedown = (e) => {
        e.stopPropagation();
        selecionarItem(param, el);
        arrastando = true;
        
        offsetStartX = e.clientX - el.offsetLeft;
        offsetStartY = e.clientY - el.offsetTop;
    };

    canvas.appendChild(el);
}

function selecionarItem(param, el) {
    document.querySelectorAll('.draggable-text').forEach(x => x.classList.remove('selected-item'));
    itemSelecionado = { dados: param, elHtml: el };
    el.classList.add('selected-item');

    document.getElementById('painelPropriedades').style.display = 'flex';
    document.getElementById('lblItemSelecionado').innerText = `Item: ${param.label || param.texto}`;

    if (textValueInput) textValueInput.value = param.texto;
    if (textColorInput) textColorInput.value = param.cor;
    if (textSizeInput) textSizeInput.value = param.tamanho;
    if (textFontSelect) textFontSelect.value = param.fonte || 'Arial';
    if (textRotationInput) textRotationInput.value = param.rotacao || 0;
}

function excluirTextoSelecionado() {
    if (!itemSelecionado || !imagemAtivaId) return;
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (!arte) return;

    arte.layout = arte.layout.filter(p => p.id !== itemSelecionado.dados.id);
    if (itemSelecionado.elHtml) itemSelecionado.elHtml.remove();
    itemSelecionado = null;
    document.getElementById('painelPropriedades').style.display = 'none';
}

async function fecharModal() {
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (arte) await salvarGabaritoNoSheets(arte.id, arte.nome, arte.layout);

    const modal = document.getElementById('editModal');
    if (modal) modal.style.display = 'none';
    renderizarCatalogoComGrupos();
    renderizarSistema();
}

// ==========================================
// RENDERIZAÇÃO DO CATÁLOGO DE PASTAS (SIDEBAR)
// ==========================================
function renderizarCatalogoComGrupos(termoFiltro = "") {
    const grid = document.getElementById('imageGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (gruposDeArtes[0].artes.length === 0 && bancoDeArtes.length > 0) {
        gruposDeArtes[0].artes = [...bancoDeArtes];
        salvarGruposNoStorage();
    }

    gruposDeArtes.forEach(grupo => {
        const artesFiltradas = grupo.artes.filter(img => (img.nome || "").toLowerCase().includes(termoFiltro));
        if (termoFiltro && artesFiltradas.length === 0) return;

        const grupoBox = document.createElement('div');
        grupoBox.style.background = '#ffffff';
        grupoBox.style.border = '1px solid #ddd';
        grupoBox.style.borderRadius = '6px';
        grupoBox.style.padding = '8px';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '6px';

        const titulo = document.createElement('span');
        titulo.innerText = `📂 ${grupo.nome} (${artesFiltradas.length})`;
        titulo.style.fontWeight = 'bold';
        titulo.style.fontSize = '12px';

        const acoesBox = document.createElement('div');
        acoesBox.style.display = 'flex';
        acoesBox.style.gap = '4px';

        // ✏️ Botão Renomear Pasta
        if (grupo.id !== 'grupo-geral') {
            const btnRenomear = document.createElement('button');
            btnRenomear.innerText = '✏️ Renomear';
            btnRenomear.style.background = '#2980b9';
            btnRenomear.style.color = 'white';
            btnRenomear.style.border = 'none';
            btnRenomear.style.padding = '3px 6px';
            btnRenomear.style.borderRadius = '3px';
            btnRenomear.style.fontSize = '10px';
            btnRenomear.style.cursor = 'pointer';
            btnRenomear.onclick = () => renomearGrupo(grupo.id);
            acoesBox.appendChild(btnRenomear);
        }

        const btnGerenciar = document.createElement('button');
        btnGerenciar.innerText = '⚙️ Config';
        btnGerenciar.style.background = '#34495e';
        btnGerenciar.style.color = 'white';
        btnGerenciar.style.border = 'none';
        btnGerenciar.style.padding = '3px 6px';
        btnGerenciar.style.borderRadius = '3px';
        btnGerenciar.style.fontSize = '10px';
        btnGerenciar.style.cursor = 'pointer';
        btnGerenciar.onclick = () => abrirGerenciadorGrupo(grupo.id);

        acoesBox.appendChild(btnGerenciar);
        header.appendChild(titulo);
        header.appendChild(acoesBox);
        grupoBox.appendChild(header);

        const containerMiniaturas = document.createElement('div');
        containerMiniaturas.style.display = 'flex';
        containerMiniaturas.style.gap = '6px';
        containerMiniaturas.style.overflowX = 'auto';

        artesFiltradas.forEach(img => {
            const imgWrapper = document.createElement('div');
            imgWrapper.style.minWidth = '65px';
            imgWrapper.style.width = '65px';
            imgWrapper.style.height = '65px';
            imgWrapper.style.border = img.id === window.imagemSelecionadaId ? '2px solid #0056b3' : '1px solid #ccc';
            imgWrapper.style.borderRadius = '4px';
            imgWrapper.style.overflow = 'hidden';
            imgWrapper.style.cursor = 'pointer';

            const thumb = document.createElement('img');
            thumb.src = img.url;
            thumb.style.width = '100%';
            thumb.style.height = '100%';
            thumb.style.objectFit = 'cover';

            thumb.onclick = () => {
                window.imagemSelecionadaId = img.id;
                adicionarDemandaMatriz();
                renderizarCatalogoComGrupos();
            };

            thumb.ondblclick = () => abrirModalEdicao(img.id);

            imgWrapper.appendChild(thumb);
            containerMiniaturas.appendChild(imgWrapper);
        });

        grupoBox.appendChild(containerMiniaturas);
        grid.appendChild(grupoBox);
    });
}

// ==========================================
// MODAL DE ADICIONAR E REMOVER DAS PASTAS
// ==========================================
let grupoAtivoId = null;

function abrirGerenciadorGrupo(grupoId) {
    grupoAtivoId = grupoId;
    const grupo = gruposDeArtes.find(g => g.id === grupoId);
    if (!grupo) return;

    document.getElementById('tituloModalGrupo').innerText = `Gerenciar Pasta: ${grupo.nome}`;
    document.getElementById('modalGerenciadorGrupo').style.display = 'flex';
    renderizarImagensNoModal();
}

function fecharModalGerenciadorGrupo() {
    document.getElementById('modalGerenciadorGrupo').style.display = 'none';
    renderizarCatalogoComGrupos();
}

function filtrarImagensNoModalGrupo() {
    renderizarImagensNoModal();
}

function renderizarImagensNoModal() {
    const grid = document.getElementById('gridImagensModalGrupo');
    if (!grid) return;
    grid.innerHTML = '';

    const grupoAtual = gruposDeArtes.find(g => g.id === grupoAtivoId);
    const termo = (document.getElementById('buscaNomeModalGrupo').value || '').toLowerCase();
    const apenasDoGrupo = document.getElementById('chkMostrarApenasGrupo').checked;

    let filtradas = bancoDeArtes.filter(a => (a.nome || '').toLowerCase().includes(termo));
    if (apenasDoGrupo) filtradas = filtradas.filter(a => grupoAtual.artes.some(g => g.id === a.id));

    filtradas.forEach(img => {
        const jaEsta = grupoAtual.artes.some(a => a.id === img.id);

        const card = document.createElement('div');
        card.style.background = 'white';
        card.style.border = jaEsta ? '2px solid #2ecc71' : '1px solid #ccc';
        card.style.borderRadius = '6px';
        card.style.padding = '8px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';

        const thumb = document.createElement('img');
        thumb.src = img.url;
        thumb.style.width = '100px';
        thumb.style.height = '100px';
        thumb.style.objectFit = 'contain';

        const label = document.createElement('span');
        label.innerText = img.nome;
        label.style.fontSize = '11px';
        label.style.margin = '5px 0';

        const btn = document.createElement('button');
        btn.innerText = jaEsta ? '✓ Incluído' : '➕ Incluir';
        btn.style.width = '100%';
        btn.style.padding = '5px';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.background = jaEsta ? '#2ecc71' : '#3498db';
        btn.style.color = 'white';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';

        btn.onclick = () => {
            if (jaEsta) {
                grupoAtual.artes = grupoAtual.artes.filter(a => a.id !== img.id);
            } else {
                grupoAtual.artes.push(img);
            }
            salvarGruposNoStorage();
            renderizarImagensNoModal();
        };

        card.appendChild(thumb);
        card.appendChild(label);
        card.appendChild(btn);
        grid.appendChild(card);
    });
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    inputCodBarrasManual = document.getElementById('inputCodBarrasManual');
    mainContent = document.getElementById('mainContent');
    selectTamanho = document.getElementById('selectTamanho');
    inputPedido = document.getElementById('inputPedido');
    inputZoom = document.getElementById('inputZoom');
    zoomValor = document.getElementById('zoomValor');

    textColorInput = document.getElementById('editTextoCor');
    textSizeInput = document.getElementById('editTextoTamanho');
    textValueInput = document.getElementById('editTextoValor');
    textFontSelect = document.getElementById('editTextoFonte');
    textRotationInput = document.getElementById('editTextoRotacao');

    if (inputZoom) inputZoom.addEventListener('input', atualizarZoomVisual);
    if (selectTamanho) selectTamanho.addEventListener('change', renderizarSistema);
    if (inputPedido) inputPedido.addEventListener('input', renderizarSistema);
    if (inputCodBarrasManual) inputCodBarrasManual.addEventListener('input', renderizarSistema);

    const txtLista = document.getElementById('txtListaAlunos');
    if (txtLista) {
        txtLista.addEventListener('input', () => {
            const matrizAtual = bancoDeMatrizes.find(m => m.id === document.getElementById('selectGradeDin').value);
            if (matrizAtual && matrizAtual.tipo === 'SVG') {
                renderizarSistemaSVGVetorial();
            } else if (matrizAtual && matrizAtual.tipo === 'PDF') {
                renderizarSistemaPDFVetorial();
            } else {
                renderizarSistema();
            }
        });
    }

    carregarSelectMatrizes();

    if (typeof google !== 'undefined') window.inicializarGoogleAuth();
});

window.inicializarGoogleAuth = function() {
    if (typeof google === 'undefined') return;

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                googleAccessToken = tokenResponse.access_token;
                localStorage.setItem('mila_drive_sessao', JSON.stringify({
                    token: googleAccessToken,
                    expiraEm: Date.now() + (tokenResponse.expires_in * 1000)
                }));
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
            await listarArtesDoGoogleDrive();
        }
    } catch (e) {}
}

window.conectarGoogleDrive = function() {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
    else if (typeof google !== 'undefined') {
        window.inicializarGoogleAuth();
        if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
    }
};

window.executarImpressaoLote = function() {
    const zoomOriginal = inputZoom ? inputZoom.value : "100";
    if (inputZoom) {
        inputZoom.value = "100";
        atualizarZoomVisual();
    }
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            if (inputZoom) {
                inputZoom.value = zoomOriginal;
                atualizarZoomVisual();
            }
        }, 500);
    }, 150);
};

// ==========================================
// CONTROLE DE ABAS SUPERIORES (ESTILO TUTU)
// ==========================================
window.mudarAba = function(abaId, elementoBtn) {
    document.querySelectorAll('.tutu-tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const abaAlvo = document.getElementById(`aba-${abaId}`);
    if (abaAlvo) {
        abaAlvo.style.display = 'flex';
    }
    if (elementoBtn) {
        elementoBtn.classList.add('active');
    }
};
// ==========================================
// CORREÇÃO DO ARRASTE NO EDITOR DE GABARITO
// ==========================================

function renderizarItemNoModalCanvas(param) {
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    if (!canvas) return;

    const el = document.createElement('div');
    el.className = 'draggable-text';
    el.innerText = param.texto || param.label;

    el.style.color = param.cor || '#ffffff';
    el.style.fontSize = `${param.tamanho || 14}px`;
    el.style.fontFamily = param.fonte || 'Arial';
    
    // Converte porcentagem para pixels do canvas (450x450)
    const posX = (param.x / 100) * 450;
    const posY = (param.y / 100) * 450;
    
    el.style.left = `${posX}px`;
    el.style.top = `${posY}px`;
    el.style.transform = `rotate(${param.rotacao || 0}deg)`;

    el.onmousedown = (e) => {
        e.stopPropagation();
        selecionarItem(param, el);
        arrastando = true;
        
        const rect = canvas.getBoundingClientRect();
        offsetStartX = (e.clientX - rect.left) - el.offsetLeft;
        offsetStartY = (e.clientY - rect.top) - el.offsetTop;
    };

    canvas.appendChild(el);
}

// 🖱️ GERENCIADOR GLOBAL ÚNICO PARA O ARRASTE FLUIDO
document.addEventListener('mousemove', (e) => {
    if (!arrastando || !itemSelecionado || !itemSelecionado.elHtml) return;
    
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    if (!canvas) return;

    let cX = e.clientX - offsetStartX;
    let cY = e.clientY - offsetStartY;

    // Limites para o texto não escapar para fora da área de edição de 450x450
    cX = Math.max(0, Math.min(cX, canvas.clientWidth - itemSelecionado.elHtml.offsetWidth));
    cY = Math.max(0, Math.min(cY, canvas.clientHeight - itemSelecionado.elHtml.offsetHeight));

    itemSelecionado.elHtml.style.left = `${cX}px`;
    itemSelecionado.elHtml.style.top = `${cY}px`;

    // Salva a posição em porcentagem (%) para o sistema replicar perfeitamente em massa
    itemSelecionado.dados.x = (cX / canvas.clientWidth) * 100;
    itemSelecionado.dados.y = (cY / canvas.clientHeight) * 100;
});

document.addEventListener('mouseup', () => {
    arrastando = false;
});

// Movimento global fluido do mouse para o arraste do texto
document.addEventListener('mousemove', (e) => {
    if (!arrastando || !itemSelecionado || !itemSelecionado.elHtml) return;
    
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Calcula a nova posição considerando onde o usuário clicou dentro do elemento
    let cX = (e.clientX - rect.left) - offsetStartX;
    let cY = (e.clientY - rect.top) - offsetStartY;

    // Limites para o texto não sair de dentro do preview de 450x450
    cX = Math.max(0, Math.min(cX, canvas.clientWidth - itemSelecionado.elHtml.offsetWidth));
    cY = Math.max(0, Math.min(cY, canvas.clientHeight - itemSelecionado.elHtml.offsetHeight));

    itemSelecionado.elHtml.style.left = `${cX}px`;
    itemSelecionado.elHtml.style.top = `${cY}px`;

    // Atualiza os dados percentuais no objeto da arte
    itemSelecionado.dados.x = (cX / canvas.clientWidth) * 100;
    itemSelecionado.dados.y = (cY / canvas.clientHeight) * 100;
});

document.addEventListener('mouseup', () => {
    arrastando = false;
});
