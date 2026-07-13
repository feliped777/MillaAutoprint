let bancoDeArtes = [];

// Elementos UI conectados com o HTML atual
let fileLoader, imageGrid, mainContent, selectTamanhoAdesivo, selectTamanho, inputPedido, inputCopias, inputZoom, zoomValor;

// Inputs do painel de propriedades do Modal
let textColorInput, textSizeInput, textValueInput, textFontSelect, textRotationInput;

let itemSelecionado = null;
let arrastando = false;
let offsetStartX = 0;
let offsetStartY = 0;
let imagemAtivaId = null;

// Matemática estrutural baseada estritamente em milímetros
function calcularLayout(mmAdesivo) {
    const tipoFolha = selectTamanho.value;
    const folhaLargura = tipoFolha === 'A4' ? 210 : 148;
    const folhaAltura = tipoFolha === 'A4' ? 297 : 210;

    // Configurações padrão de margem
    let margemEsquerdaDireita = 15;
    let margemSuperiorInferior = 15;
    let qrTamanhoMm = 12; // QR Code fixado em 12mm

    // Ajuste específico para 9cm (90mm)
    if (mmAdesivo === 90) {
        margemEsquerdaDireita = 10; 
    }

    // Ajuste específico para 4cm (40mm)
    if (mmAdesivo === 40) {
        margemSuperiorInferior = 12;
        qrTamanhoMm = 10; // QR Code compacto para etiquetas pequenas
    }

    const gapMm = 3;

    const larguraUtil = folhaLargura - (margemEsquerdaDireita * 2);
    const alturaUtil = folhaAltura - (margemSuperiorInferior * 2);

    // Colunas e linhas máximas que cabem no papel
    const cols = Math.floor((larguraUtil + gapMm) / (mmAdesivo + gapMm));
    const rowsMaximas = Math.floor((alturaUtil + gapMm) / (mmAdesivo + gapMm));

    // Espaço dinâmico do QR Code no canto inferior direito
    const areaDisponivelSemQR = alturaUtil - qrTamanhoMm - gapMm;
    const rowsAcimaDoQR = Math.floor((areaDisponivelSemQR + gapMm) / (mmAdesivo + gapMm));
    
    const restoLarguraEsquerdaQR = larguraUtil - qrTamanhoMm - gapMm;
    const colsAoLadoDoQR = Math.floor((restoLarguraEsquerdaQR + gapMm) / (mmAdesivo + gapMm));
    const rowsNaFaixaDoQR = rowsMaximas - rowsAcimaDoQR;

    // Ativa o layout híbrido com corte se couberem elementos ao lado do QR Code
    const temSecaoInferior = colsAoLadoDoQR > 0 && rowsNaFaixaDoQR > 0 && (mmAdesivo <= 50);
    let totalPorFolha = cols * rowsAcimaDoQR;
    
    if (temSecaoInferior) {
        totalPorFolha += (colsAoLadoDoQR * rowsNaFaixaDoQR);
    } else {
        totalPorFolha = cols * rowsMaximas; 
    }

    return {
        folhaLargura, folhaAltura, cols, rowsAcimaDoQR,
        colsAoLadoDoQR, rowsNaFaixaDoQR, totalPorFolha,
        mmAdesivo, gapMm, qrTamanhoMm, temSecaoInferior, rowsMaximas
    };
}

function renderizarSistema() {
    const numeroPedido = inputPedido ? inputPedido.value.trim() : '';
    const mmSelecionado = parseInt(selectTamanhoAdesivo.value) || 50;
    const layout = calcularLayout(mmSelecionado);
    
    imageGrid.innerHTML = '';
    mainContent.innerHTML = '';

    if (bancoDeArtes.length === 0) return;

    bancoDeArtes.forEach((img) => {
        // Renderizador das miniaturas laterais
        const containerThumb = document.createElement('div');
        containerThumb.className = 'thumb-container';
        
        const imgEl = document.createElement('img');
        imgEl.src = img.url;
        imgEl.className = 'thumb';
        imgEl.onclick = () => abrirModalEdicao(img.id);
        containerThumb.appendChild(imgEl);
        
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-delete';
        btnDel.innerHTML = '&times;';
        btnDel.onclick = (e) => { e.stopPropagation(); excluirImagem(img.id); };
        containerThumb.appendChild(btnDel);
        imageGrid.appendChild(containerThumb);

        // Processador de Multi-páginas
        const totalAdesivosPedidos = parseInt(inputCopias.value) || 1;
        let poolAdesivosCriados = 0;

        while (poolAdesivosCriados < totalAdesivosPedidos) {
            const pageScaler = document.createElement('div');
            pageScaler.className = 'page-scaler';

            const printAreaNode = document.createElement('div');
            printAreaNode.className = `print-area`;
            printAreaNode.style.width = `${layout.folhaLargura}mm`;
            printAreaNode.style.height = `${layout.folhaAltura}mm`;
            printAreaNode.onclick = () => abrirModalEdicao(img.id);

            let adesivosRestantes = totalAdesivosPedidos - poolAdesivosCriados;

            if (layout.temSecaoInferior) {
                // Layout Híbrido com Área reservada para QR Code no canto inferior direito
                const gridSuperior = document.createElement('div');
                gridSuperior.className = 'grid-superior';
                gridSuperior.style.gridTemplateColumns = `repeat(${layout.cols}, ${layout.mmAdesivo}mm)`;
                gridSuperior.style.gap = `${layout.gapMm}mm`;

                const adesivosSuperior = Math.min(layout.cols * layout.rowsAcimaDoQR, adesivosRestantes);
                for (let i = 0; i < adesivosSuperior; i++) {
                    gridSuperior.appendChild(criarAdesivoElemento(img, layout.mmAdesivo));
                }
                poolAdesivosCriados += adesivosSuperior;
                adesivosRestantes -= adesivosSuperior;

                const gridInferior = document.createElement('div');
                gridInferior.className = 'grid-inferior';
                gridInferior.style.gap = `${layout.gapMm}mm`;
                gridInferior.style.marginTop = `${layout.gapMm}mm`;

                const containerEsquerda = document.createElement('div');
                containerEsquerda.className = 'grid-inferior-imagens';
                containerEsquerda.style.gridTemplateColumns = `repeat(${layout.colsAoLadoDoQR}, ${layout.mmAdesivo}mm)`;
                containerEsquerda.style.gap = `${layout.gapMm}mm`;

                const adesivosInferior = Math.min(layout.colsAoLadoDoQR * layout.rowsNaFaixaDoQR, adesivosRestantes);
                for (let i = 0; i < adesivosInferior; i++) {
                    containerEsquerda.appendChild(criarAdesivoElemento(img, layout.mmAdesivo));
                }
                poolAdesivosCriados += adesivosInferior;

                gridInferior.appendChild(containerEsquerda);

                const containerQR = document.createElement('div');
                containerQR.className = 'qr-area-container';
                containerQR.style.width = `${layout.qrTamanhoMm}mm`;
                containerQR.style.height = `${layout.qrTamanhoMm}mm`;
                
                gridInferior.appendChild(containerQR);
                printAreaNode.appendChild(gridSuperior);
                printAreaNode.appendChild(gridInferior);

                if (numeroPedido !== '') {
                    gerarQRCodeSincrono(containerQR, numeroPedido, layout.qrTamanhoMm);
                }

            } else {
                // Layout Grade Padrão sem cortes dinâmicos
                const gridPrincipal = document.createElement('div');
                gridPrincipal.className = 'grid-superior';
                gridPrincipal.style.gridTemplateColumns = `repeat(${layout.cols}, ${layout.mmAdesivo}mm)`;
                gridPrincipal.style.gap = `${layout.gapMm}mm`;

                const totaisAqui = Math.min(layout.cols * layout.rowsMaximas, adesivosRestantes);
                for (let i = 0; i < totaisAqui; i++) {
                    gridPrincipal.appendChild(criarAdesivoElemento(img, layout.mmAdesivo));
                }
                poolAdesivosCriados += totaisAqui;
                printAreaNode.appendChild(gridPrincipal);

                if (numeroPedido !== '') {
                    const containerQRFixo = document.createElement('div');
                    containerQRFixo.className = 'qr-area-container-fixo';
                    containerQRFixo.style.width = `${layout.qrTamanhoMm}mm`;
                    containerQRFixo.style.height = `${layout.qrTamanhoMm}mm`;
                    printAreaNode.appendChild(containerQRFixo);
                    gerarQRCodeSincrono(containerQRFixo, numeroPedido, layout.qrTamanhoMm);
                }
            }

            pageScaler.appendChild(printAreaNode);
            mainContent.appendChild(pageScaler);
        }
    });

    atualizarZoomVisual();
}

function criarAdesivoElemento(img, mmDimensao) {
    const sticker = document.createElement('div');
    sticker.className = 'sticker-container';
    sticker.style.width = `${mmDimensao}mm`;
    sticker.style.height = `${mmDimensao}mm`;

    const bg = document.createElement('img');
    bg.className = 'art-background';
    bg.src = img.urlEditada || img.url; 
    sticker.appendChild(bg);

    return sticker;
}

function gerarQRCodeSincrono(container, texto, tamanhoMm) {
    container.innerHTML = '';
    const pxSize = Math.round(tamanhoMm * 3.77); 
    new QRCode(container, {
        text: texto,
        width: pxSize * 0.8,
        height: pxSize * 0.8,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });
}

function atualizarZoomVisual() {
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

function executarImpressao() {
    window.print();
}

// Editor Avançado (Drag and Drop Computado)
function abrirModalEdicao(idImagem) {
    imagemAtivaId = idImagem;
    const arte = bancoDeArtes.find(img => img.id === idImagem);
    if (!arte) return;

    const modal = document.getElementById('editModal');
    const canvas = document.getElementById('canvasEdicaoAdesivo');
    
    canvas.style.width = '450px';
    canvas.style.height = '450px';
    canvas.innerHTML = `<img id="imgFundoModal" src="${arte.url}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; z-index:1;">`;
    
    arte.layout.forEach(p => {
        if (!p.texto || p.texto.trim() === '') return;

        const elText = document.createElement('div');
        elText.className = 'draggable-text';
        elText.id = `drag-${p.id}`;
        elText.innerText = p.texto;
        elText.style.color = p.cor;
        elText.style.fontSize = `${p.tamanho}px`;
        elText.style.fontFamily = p.fonte;
        elText.style.left = `${p.x}%`;
        elText.style.top = `${p.y}%`;
        elText.style.transform = `rotate(${p.rotacao || 0}deg)`;
        
        elText.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            selecionarItem(p, elText);
            arrastando = true;
            
            const rect = canvas.getBoundingClientRect();
            offsetStartX = (e.clientX - rect.left) - elText.offsetLeft;
            offsetStartY = (e.clientY - rect.top) - elText.offsetTop;
        });
        
        canvas.appendChild(elText);
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
    
    window.onmouseup = () => { arrastando = false; };
    modal.style.display = 'flex';
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
    if (!itemSelecionado) return;
    itemSelecionado.dados.texto = '';
    document.getElementById('painelPropriedades').style.display = 'none';
    itemSelecionado = null;
    abrirModalEdicao(imagemAtivaId);
}

function adicionarParametroLivre() {
    const inputNomeCampo = document.getElementById('novoParametroNome');
    const nomeVal = inputNomeCampo.value.trim();
    if (nomeVal === '' || !imagemAtivaId) return;
    
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (!arte) return;

    arte.layout.push({
        id: `custom-${Date.now()}`,
        label: nomeVal,
        texto: nomeVal,
        x: 20, y: 20, cor: '#ffffff', tamanho: 12, fonte: 'Arial', rotacao: 0
    });
    
    inputNomeCampo.value = '';
    abrirModalEdicao(imagemAtivaId);
}

function fecharModal() {
    const arte = bancoDeArtes.find(img => img.id === imagemAtivaId);
    if (!arte) {
        document.getElementById('editModal').style.display = 'none';
        return;
    }

    const canvasInvisivel = document.createElement('canvas');
    canvasInvisivel.width = 1000;
    canvasInvisivel.height = 1000;
    const ctx = canvasInvisivel.getContext('2d');

    const imagemFundo = new Image();
    imagemFundo.crossOrigin = "anonymous";
    imagemFundo.src = arte.url;

    imagemFundo.onload = function() {
        const imgLargura = imagemFundo.width;
        const imgAltura = imagemFundo.height;
        const canvasDimensao = 1000; 
        
        let cx, cy, cw, ch;

        if (imgLargura > imgAltura) {
            cw = imgAltura;
            ch = imgAltura;
            cx = (imgLargura - imgAltura) / 2;
            cy = 0;
        } else {
            cw = imgLargura;
            ch = imgLargura;
            cx = 0;
            cy = (imgAltura - imgLargura) / 2;
        }

        ctx.drawImage(imagemFundo, cx, cy, cw, ch, 0, 0, canvasDimensao, canvasDimensao);

        arte.layout.forEach(p => {
            if (!p.texto || p.texto.trim() === '') return;

            ctx.save();
            
            const posX = (p.x / 100) * canvasDimensao;
            const posY = (p.y / 100) * canvasDimensao;
            const tamanhoRealFonte = Math.round(p.tamanho * (canvasDimensao / 450));
            
            ctx.font = `bold ${tamanhoRealFonte}px ${p.fonte || 'Arial'}`;
            ctx.fillStyle = p.cor;
            ctx.textAlign = "left"; 
            ctx.textBaseline = "top"; 

            ctx.translate(posX, posY);
            
            if (p.rotacao) {
                ctx.rotate((p.rotacao * Math.PI) / 180);
            }

            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 4;
            ctx.lineWidth = Math.max(2, Math.round(tamanhoRealFonte * 0.12));
            ctx.strokeStyle = "rgba(0,0,0,0.8)";
            ctx.strokeText(p.texto, 0, 0);

            ctx.fillText(p.texto, 0, 0);
            ctx.restore();
        });

        arte.urlEditada = canvasInvisivel.toDataURL('image/png');

        document.getElementById('editModal').style.display = 'none';
        itemSelecionado = null;
        imagemAtivaId = null;
        renderizarSistema();
    };
}

// Inicialização segura com suporte ao monitoramento do número do pedido
document.addEventListener('DOMContentLoaded', () => {
    fileLoader = document.getElementById('fileLoader');
    imageGrid = document.getElementById('imageGrid');
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

    fileLoader.addEventListener('change', function(e) {
        const arquivos = e.target.files;
        if (arquivos.length === 0) return;

        for (let i = 0; i < arquivos.length; i++) {
            const arquivo = arquivos[i];
            const urlTemporaria = URL.createObjectURL(arquivo);
            const nomeSemExtensao = arquivo.name.replace(/\.[^/.]+$/, "");
            const idUnico = Date.now() + i;

            bancoDeArtes.push({
                id: idUnico,
                name: nomeSemExtensao,
                url: urlTemporaria,
                layout: [] 
            });
        }

        fileLoader.value = '';
        renderizarSistema();
    });

    inputZoom.addEventListener('input', atualizarZoomVisual);
    [selectTamanho, selectTamanhoAdesivo, inputPedido, inputCopias].forEach(el => {
        if (el) el.addEventListener('change', renderizarSistema);
    });
    
    if (inputPedido) inputPedido.addEventListener('input', renderizarSistema);
    if (inputCopias) inputCopias.addEventListener('input', renderizarSistema);

    textValueInput.addEventListener('input', (e) => {
        if (!itemSelecionado) return;
        itemSelecionado.dados.texto = e.target.value;
        itemSelecionado.elHtml.innerText = e.target.value;
    });

    textColorInput.addEventListener('input', (e) => {
        if (!itemSelecionado) return;
        itemSelecionado.dados.cor = e.target.value;
        itemSelecionado.elHtml.style.color = e.target.value;
    });

    textSizeInput.addEventListener('input', (e) => {
        if (!itemSelecionado) return;
        itemSelecionado.dados.tamanho = parseInt(e.target.value) || 12;
        itemSelecionado.elHtml.style.fontSize = `${itemSelecionado.dados.tamanho * 1.2}px`;
    });

    textFontSelect.addEventListener('change', (e) => {
        if (!itemSelecionado) return;
        itemSelecionado.dados.fonte = e.target.value;
        itemSelecionado.elHtml.style.fontFamily = e.target.value;
    });

    textRotationInput.addEventListener('input', (e) => {
        if (!itemSelecionado) return;
        itemSelecionado.dados.rotacao = parseInt(e.target.value) || 0;
        itemSelecionado.elHtml.style.transform = `rotate(${itemSelecionado.dados.rotacao}deg)`;
    });
});
