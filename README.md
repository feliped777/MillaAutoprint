# 🖨️ Mila Autoprint | Sistema de Personalização e Impressão Lote

O **Mila Autoprint** é um gerenciador de impressão automatizado desenvolvido para otimizar o fluxo de trabalho de papelaria personalizada e produção de brindes. O sistema permite carregar múltiplas artes simultaneamente, personalizar dados dinâmicos sobrepondo textos em tempo real, organizar os adesivos em folhas (A4/A5) com cálculos milimétricos inteligentes e gerar folhas prontas para impressão com QR Codes de controle integrados.

---

## ✨ Funcionalidades Principais

* **Carregamento e Busca em Lote:** Upload simultâneo de múltiplas artes com visualização em grade responsiva e filtro de busca em tempo real.
* **Editor Visual Drag-and-Drop:** Interface modal intuitiva para arrastar e reposicionar elementos de texto (Nome, Idade, Série, Escola) diretamente sobre a arte.
* **Estilização Dinâmica:** Controle total sobre fontes, tamanhos, cores e rotação angular de cada campo de texto de forma individualizada.
* **Renderização HD via Canvas:** Fusão inteligente dos textos manipulados sobre a imagem original de fundo em alta definição ($1000 \times 1000\text{ px}$), simulando perfeitamente o comportamento `object-fit: cover` para evitar distorções no produto final.
* **Layouts Híbridos com QR Code:** Distribuição milimétrica dos adesivos baseada nas dimensões físicas configuradas (4cm, 5cm, 7cm ou 9cm). O sistema calcula automaticamente o espaço restante na folha para embutir um QR Code com o número do pedido no canto inferior direito, otimizando o aproveitamento do papel.
* **Otimização para Impressão:** CSS `@media print` cirúrgico que oculta barras de controle, remove margens do navegador e força quebras de página nativas para gerar um PDF ou impressão direta perfeitamente limpos.

---

## 🚀 Tecnologias Utilizadas

* **HTML5:** Estrutura semântica da aplicação e painéis de controle.
* **CSS3:** Layout moderno utilizando CSS Grid, Flexbox, variáveis nativas (`:root`) e estilização avançada para mídia física (`@media print`).
* **JavaScript (Vanilla):** Lógica de estados, manipulação assíncrona do DOM, gerenciamento de eventos de arrastar (Drag-and-Drop) e operações matemáticas com a API de `Canvas 2D`.
* **QRCode.js:** Biblioteca externa leve para geração instantânea e síncrona de códigos QR no padrão de renderização industrial.

---

## 🎨 Como Usar

1. Carregue as artes desejadas através do botão **"Carregar Imagens da Pasta"**.
2. Preencha os dados padrão do cliente (Nome, Idade, Escola, etc.) na barra lateral.
3. Defina as configurações da folha (A4 ou A5) e o tamanho real do adesivo em centímetros.
4. Clique em qualquer miniatura ou folha para abrir o modal de ajustes finos, onde você pode arrastar os textos para as posições exatas.
5. Clique em **"Aplicar em Lote"** para propagar a personalização para todas as cópias daquela folha.
6. Use o botão **"Imprimir Arte"** para abrir o diálogo de impressão do sistema operacional (salve como PDF ou envie direto para a impressora).
