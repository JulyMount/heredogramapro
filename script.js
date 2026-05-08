const workspace = document.getElementById('workspace');
const svgLayer = document.getElementById('svg-layer');
const modeIndicator = document.getElementById('mode-indicator');
const geneticsPopup = document.getElementById('genetics-popup');
const autoTraitsContainer = document.getElementById('auto-traits-container');
const sexGenesContainer = document.getElementById('sex-genes-container');

const GRID_SIZE = 40; 

let nodes = {};
let marriages = [];
let childrenLinks = [];
let nodeIdCounter = 0;
let marriageIdCounter = 0;

let selectedNodeId = null;
let currentMode = 'idle'; 
let actionQueue = []; 
let targetNodeId = null;

let isDragging = false;
let dragTarget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

let tempAutoTraits = [];
let tempSexChromosomes = [];

let longPressTimer;
const contextMenu = document.getElementById('context-menu');
let contextNodeId = null; // Guarda em qual nó o menu foi aberto

// --- Tema e UI ---
function toggleTheme() {
    const body = document.body;
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
    } else {
        body.setAttribute('data-theme', 'dark');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-info-circle"></i>';
    toast.innerHTML = `${icon} ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function updateStatusMode(text, isAlert = false) {
    modeIndicator.innerHTML = text;
    if (isAlert) modeIndicator.classList.add('mode-alert');
    else modeIndicator.classList.remove('mode-alert');
}

// --- Modos de Ação ---
function setMode(mode) {
    document.querySelectorAll('.sidebar-card .btn').forEach(b => b.classList.remove('active'));
    actionQueue = [];
    closeGenetics();
    
    if (currentMode === mode) {
        currentMode = 'idle';
        updateStatusMode('<i class="fas fa-mouse-pointer"></i> Modo: Livre');
        return;
    }

    currentMode = mode;
    if (mode === 'marriage') {
        document.getElementById('btn-marriage').classList.add('active');
        updateStatusMode('<i class="fas fa-ring"></i> Modo Casamento', true);
        showToast("Clique no primeiro cônjuge.", "info");
    } else if (mode === 'child') {
        document.getElementById('btn-child').classList.add('active');
        updateStatusMode('<i class="fas fa-sitemap"></i> Modo Filho', true);
        showToast("Clique no Pai.", "info");
    } else if (mode === 'genetics') {
        document.getElementById('btn-genetics').classList.add('active');
        updateStatusMode('<i class="fas fa-microscope"></i> Modo Edição', true);
        showToast("Clique em um indivíduo para editar dados.", "info");
    }
}

function snap(val) { return Math.round(val / GRID_SIZE) * GRID_SIZE; }

// --- Criação de Nós ---
function addNode(type) {
    const id = 'node_' + nodeIdCounter++;
    const node = document.createElement('div');
    node.id = id;
    node.className = `node ${type}`;
    node.style.left = snap(160) + 'px';
    node.style.top = snap(80) + 'px';
    
    node.addEventListener('mousedown', startDrag);
    node.addEventListener('touchstart', startDrag, {passive: false});
    node.addEventListener('click', (e) => handleNodeClick(e, id));
    
    workspace.appendChild(node);
    
    let initialSex = [];
    if (type === 'male') initialSex = [{base: 'X', allele: ''}, {base: 'Y', allele: ''}];
    else if (type === 'female') initialSex = [{base: 'X', allele: ''}, {base: 'X', allele: ''}];

    nodes[id] = { 
        id, type, element: node, 
        name: '', showName: false,
        desc: '', showDesc: false,
        autosomal: [], 
        sexChromosomes: initialSex,
        showSex: false 
    };
    
    renderLabelsOnNode(id);
    selectNode(id);
    if(currentMode !== 'genetics') setMode('idle');
}

function handleNodeClick(e, id) {
    e.stopPropagation();
    if (currentMode === 'idle') { selectNode(id); return; }
    if (currentMode === 'genetics') {
        targetNodeId = id;
        selectNode(id);
        showGeneticsPopup(id);
        return;
    }
    
    if (currentMode === 'marriage') {
        if (!actionQueue.includes(id)) actionQueue.push(id);
        if (actionQueue.length === 1) {
            showToast("Agora clique no segundo cônjuge.", "info");
        } else if (actionQueue.length === 2) {
            marriages.push({ id: 'm_' + marriageIdCounter++, p1: actionQueue[0], p2: actionQueue[1] });
            drawConnections();
            setMode('idle'); 
            showToast("Casamento criado!", "success");
        }
    }
    
    if (currentMode === 'child') {
        if (!actionQueue.includes(id)) actionQueue.push(id);
        if (actionQueue.length === 1) {
            showToast("Agora clique na Mãe (segundo cônjuge).", "info");
        } else if (actionQueue.length === 2) {
            showToast("Por fim, clique no Filho.", "info");
        } else if (actionQueue.length === 3) {
            const m = marriages.find(m => (m.p1 === actionQueue[0] && m.p2 === actionQueue[1]) || (m.p1 === actionQueue[1] && m.p2 === actionQueue[0]));
            if (m) { 
                childrenLinks.push({ marriageId: m.id, childId: actionQueue[2] }); 
                drawConnections(); 
                showToast("Filho adicionado com sucesso!", "success");
            } else {
                showToast("Estes indivíduos não possuem um casamento prévio!", "error");
            }
            setMode('idle');
        }
    }
}

// --- Pop-up de Genética (Atualizado para posição fixa via CSS) ---
function showGeneticsPopup(id) {
    const node = nodes[id];

    document.getElementById('name-input').value = node.name;
    document.getElementById('name-cb').checked = node.showName;
    document.getElementById('desc-input').value = node.desc;
    document.getElementById('desc-cb').checked = node.showDesc;

    tempAutoTraits = [...node.autosomal];
    renderAutoTraitsInPopup();

    tempSexChromosomes = JSON.parse(JSON.stringify(node.sexChromosomes));
    renderSexChromosomesInPopup();

    const sexSection = document.getElementById('sex-section');
    const sexCbLabel = document.getElementById('sex-cb-label');
    const sexTitle = document.getElementById('sex-title');
    
    if (node.type === 'unknown') {
        sexSection.style.display = 'none';
        sexCbLabel.style.display = 'none';
        sexTitle.style.display = 'none';
    } else {
        sexSection.style.display = 'block';
        sexCbLabel.style.display = 'flex';
        sexTitle.style.display = 'flex';
        document.getElementById('sex-cb').checked = node.showSex;
    }

    geneticsPopup.classList.remove('hidden');
}

function closeGenetics() {
    geneticsPopup.classList.add('hidden');
    targetNodeId = null;
}

// --- Lógica Sexual Dinâmica ---
function addSexChromosomeField(base) {
    tempSexChromosomes.push({ base: base, allele: '' });
    renderSexChromosomesInPopup();
}

function removeSexChromosome(index) {
    tempSexChromosomes.splice(index, 1);
    renderSexChromosomesInPopup();
}

function renderSexChromosomesInPopup() {
    sexGenesContainer.innerHTML = '';
    tempSexChromosomes.forEach((chrom, index) => {
        const div = document.createElement('div');
        div.className = 'sex-trait-row';
        div.innerHTML = `
            <span>${chrom.base}</span>
            <sup><input type="text" value="${chrom.allele}" placeholder="alelo" onchange="tempSexChromosomes[${index}].allele = this.value"></sup>
            <button class="btn-circle btn-remove-circle" onclick="removeSexChromosome(${index})"><i class="fas fa-times"></i></button>
        `;
        sexGenesContainer.appendChild(div);
    });
}

// --- Lógica Autossômica ---
function addAutosomalField() {
    const type = document.getElementById('auto-type-select').value;
    let traitId = Date.now();
    let html = '';
    if (type === 'rec') html = `<input type="text" id="t_${traitId}" placeholder="a" style="width:40px;" oninput="this.value=this.value.toLowerCase().slice(0,1)">`;
    else if (type === 'dom') html = `<input type="text" id="t_${traitId}_let" placeholder="A" style="width:30px;" oninput="this.value=this.value.toUpperCase().slice(0,1)"> <select id="t_${traitId}_zig"><option value="homo">Homo</option><option value="hetero">Hetero</option></select>`;
    else if (type === 'codom') html = `B: <input type="text" id="t_${traitId}_base" placeholder="I" style="width:30px;"> A1: <input type="text" id="t_${traitId}_al1" placeholder="A" style="width:30px;"> A2: <input type="text" id="t_${traitId}_al2" placeholder="B" style="width:30px;">`;

    const div = document.createElement('div');
    div.className = 'auto-trait-row';
    div.dataset.type = type; div.dataset.tid = traitId;
    div.innerHTML = `<div style="flex:1; display:flex; align-items:center; gap:5px;">${html}</div><button class="btn-circle btn-remove-circle" onclick="removeAutoTraitInPopup(this)"><i class="fas fa-times"></i></button>`;
    autoTraitsContainer.appendChild(div);
}

function renderAutoTraitsInPopup() {
    autoTraitsContainer.innerHTML = '';
    tempAutoTraits.forEach((trait, index) => {
        const div = document.createElement('div');
        div.className = 'auto-trait-row';
        let visualTrait = trait.replace(/\^([^\s]+)/g, "<sup>$1</sup>");
        div.innerHTML = `<span style="flex:1; color: var(--danger);">${visualTrait}</span><button class="btn-circle btn-remove-circle" onclick="removeSavedAutoTrait(${index})"><i class="fas fa-times"></i></button>`;
        autoTraitsContainer.appendChild(div);
    });
}
function removeAutoTraitInPopup(btn) { btn.parentElement.remove(); }
function removeSavedAutoTrait(index) { tempAutoTraits.splice(index, 1); renderAutoTraitsInPopup(); }

// --- Salvar Dados ---
function saveGenetics() {
    if (!targetNodeId) return;
    const node = nodes[targetNodeId];

    node.name = document.getElementById('name-input').value.trim();
    node.showName = document.getElementById('name-cb').checked;
    node.desc = document.getElementById('desc-input').value.trim();
    node.showDesc = document.getElementById('desc-cb').checked;

    const newRows = autoTraitsContainer.querySelectorAll('.auto-trait-row[data-type]');
    newRows.forEach(row => {
        const t = row.dataset.type; const tid = row.dataset.tid;
        let res = "";
        if (t === 'rec') res = (document.getElementById(`t_${tid}`).value || 'a').repeat(2);
        else if (t === 'dom') {
            const l = document.getElementById(`t_${tid}_let`).value || 'A';
            res = document.getElementById(`t_${tid}_zig`).value === 'homo' ? l+l : l+l.toLowerCase();
        } else if (t === 'codom') {
            const b = document.getElementById(`t_${tid}_base`).value || 'I';
            const a1 = document.getElementById(`t_${tid}_al1`).value;
            const a2 = document.getElementById(`t_${tid}_al2`).value;
            res = `${a1?b+'^'+a1:b} ${a2?b+'^'+a2:b}`;
        }
        if(res) tempAutoTraits.push(res);
    });
    node.autosomal = [...tempAutoTraits];

    node.sexChromosomes = [...tempSexChromosomes];
    if (node.type !== 'unknown') node.showSex = document.getElementById('sex-cb').checked;

    renderLabelsOnNode(targetNodeId);
    closeGenetics();
}

function renderLabelsOnNode(id) {
    const node = nodes[id];
    const el = node.element;
    el.querySelectorAll('.label-container').forEach(e => e.remove());

    if (node.autosomal.length > 0) {
        const top = document.createElement('div'); top.className = 'label-container label-top';
        top.innerHTML = node.autosomal.map(t => t.replace(/\^([^\s]+)/g, "<sup>$1</sup>")).join(', ');
        el.appendChild(top);
    }

    if (node.type !== 'unknown' || node.name) {
        const bot = document.createElement('div'); bot.className = 'label-container label-bottom';
        const hasAlleles = node.sexChromosomes.some(c => c.allele !== '');
        if (node.sexChromosomes.length > 0 && (hasAlleles || node.showSex)) {
            let sexHtml = node.sexChromosomes.map(c => `<span style="color:var(--primary);">${c.base}</span>${c.allele ? '<sup>'+c.allele+'</sup>' : ''}`).join('');
            bot.innerHTML += `<div style="margin-bottom:2px;">${sexHtml}</div>`;
        }
        if (node.name) {
            let nc = node.showName ? "" : "hover-only";
            bot.innerHTML += `<div class="${nc}" style="font-weight:bold;">${node.name}</div>`;
        }
        el.appendChild(bot);
    }

    if (node.desc) {
        const r = document.createElement('div');
        r.className = node.showDesc ? "label-container label-right" : "label-container label-right hover-only";
        r.innerText = node.desc; el.appendChild(r);
    }
}

// --- Interações do Canvas (Drag & Drop, Conexões - ATUALIZADO PARA TOUCH) ---

// Função auxiliar para capturar a posição exata seja mouse ou dedo
function getClientPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function selectNode(id) {
    Object.values(nodes).forEach(n => n.element.classList.remove('selected'));
    selectedNodeId = id; if (id) document.getElementById(id).classList.add('selected');
}

// Clicar fora para deselecionar (Mouse e Touch)
workspace.addEventListener('mousedown', handleWorkspaceClick);
workspace.addEventListener('touchstart', handleWorkspaceClick, {passive: false});

function handleWorkspaceClick(e) {
    if (e.target === workspace || e.target === svgLayer) { 
        selectNode(null); closeGenetics(); 
    }
}

function startDrag(e) {
    if (currentMode !== 'idle') return;
    
    isDragging = true;
    dragTarget = e.currentTarget;
    const pos = getClientPos(e);
    const rect = dragTarget.getBoundingClientRect();
    dragOffsetX = pos.x - rect.left;
    dragOffsetY = pos.y - rect.top;

    selectNode(dragTarget.id);
    hideContextMenu(); // Esconde o menu se clicar em outro lugar

    // --- LÓGICA DO TOQUE LONGO ---
    // Se segurar por 600ms, abre o menu
    longPressTimer = setTimeout(() => {
        if (isDragging) {
            showContextMenu(pos.x, pos.y, dragTarget.id);
            isDragging = false; // Cancela o arrasto para não mover enquanto usa o menu
        }
    }, 600);

    if(e.type === 'touchstart') e.preventDefault();
}

// Eventos de movimento (Mouse e Touch)
document.addEventListener('mousemove', handleMove);
document.addEventListener('touchmove', handleMove, {passive: false});

document.addEventListener('mousemove', () => clearTimeout(longPressTimer));
document.addEventListener('touchmove', () => clearTimeout(longPressTimer));
document.addEventListener('mouseup', () => clearTimeout(longPressTimer));
document.addEventListener('touchend', () => clearTimeout(longPressTimer));

// 3. Funções de controle do menu
function showContextMenu(x, y, id) {
    contextNodeId = id;
    contextMenu.classList.remove('hidden');
    
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    
    // Pegamos os limites reais do Workspace (a área cinza/quadriculada)
    const wsRect = workspace.getBoundingClientRect();
    const wsBottom = wsRect.bottom;
    const wsRight = wsRect.right;

    // --- AJUSTE X (Horizontal) ---
    let finalX = x;
    // Se o clique + largura do menu ultrapassa a borda direita do workspace
    if (x + menuWidth > wsRight) {
        finalX = x - menuWidth - 5; 
    }

    // --- AJUSTE Y (Vertical) ---
    // Tentativa inicial: abrir o menu um pouco acima do dedo
    let finalY = y - 20; 

    // A MÁGICA: Se o toque + altura do menu ultrapassa o CHÃO do workspace
    if (y + menuHeight > wsBottom) {
        // Joga o menu inteirinho para CIMA do ponto de toque
        finalY = y - menuHeight + 5; 
    }

    // --- TRAVAS DE SEGURANÇA (Para não sumir no topo ou na esquerda) ---
    if (finalY < wsRect.top) finalY = wsRect.top + 10;
    if (finalX < wsRect.left) finalX = wsRect.left + 10;

    // Aplica as posições corrigidas
    contextMenu.style.left = finalX + 'px';
    contextMenu.style.top = finalY + 'px';
    
    if (navigator.vibrate) navigator.vibrate(50);
}

function hideContextMenu() {
    contextMenu.classList.add('hidden');
}

// 4. Lida com as ações escolhidas no menu
function handleContextAction(action) {
    hideContextMenu();
    const id = contextNodeId;
    if (!id) return;

    // Garantimos que o nó clicado seja o selecionado para a função toggleProperty funcionar
    selectNode(id); 

    if (action === 'affected') {
        // No seu CSS/HTML, a classe para preencher provavelmente é 'affected'
        toggleProperty('affected'); 
    } else if (action === 'deceased') {
        // No seu CSS/HTML, a classe para o traço de morto provavelmente é 'deceased'
        toggleProperty('deceased');
    } else if (action === 'genetics') {
        targetNodeId = id;
        showGeneticsPopup(id);
    } else if (action === 'delete') {
        deleteSelected();
    } else if (action === 'marriage') {
        setMode('marriage');
        handleNodeClick({ stopPropagation: () => {} }, id);
    } else if (action === 'child') {
        setMode('child');
        handleNodeClick({ stopPropagation: () => {} }, id);
    }
}

// Fechar menu ao clicar no fundo
workspace.addEventListener('click', hideContextMenu);

function handleMove(e) {
    if (!isDragging || !dragTarget) return;
    
    // Evita que a tela do celular role enquanto arrasta a bolinha/quadrado
    if(e.type === 'touchmove') e.preventDefault(); 

    const pos = getClientPos(e);
    const wsRect = workspace.getBoundingClientRect();
    
    dragTarget.style.left = snap(pos.x - wsRect.left - dragOffsetX) + 'px';
    dragTarget.style.top = snap(pos.y - wsRect.top - dragOffsetY) + 'px';
    drawConnections();
}

// Eventos de soltar (Mouse e Touch)
document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);

function endDrag() { 
    isDragging = false; 
    dragTarget = null; 
}

function drawConnections() {
    svgLayer.innerHTML = ''; 
    const wsRect = workspace.getBoundingClientRect();
    marriages.forEach(m => {
        const el1 = document.getElementById(m.p1); const el2 = document.getElementById(m.p2);
        if (!el1 || !el2) return;
        const r1 = el1.getBoundingClientRect(); const r2 = el2.getBoundingClientRect();
        const x1 = (r1.left - wsRect.left) + (r1.width / 2); const y1 = (r1.top - wsRect.top) + (r1.height / 2);
        const x2 = (r2.left - wsRect.left) + (r2.width / 2); const y2 = (r2.top - wsRect.top) + (r2.height / 2);
        createSVGLine(x1, y1, x2, y2);
        const mChildren = childrenLinks.filter(c => c.marriageId === m.id);
        if (mChildren.length > 0) {
            const midX = (x1 + x2) / 2; const midY = (y1 + y2) / 2; const sibDropY = midY + 40; 
            createSVGLine(midX, midY, midX, sibDropY);
            mChildren.forEach(c => {
                const childEl = document.getElementById(c.childId); if (!childEl) return;
                const cr = childEl.getBoundingClientRect();
                const cx = (cr.left - wsRect.left) + (cr.width / 2); const cy = (cr.top - wsRect.top); 
                createSVGLine(midX, sibDropY, cx, sibDropY); createSVGLine(cx, sibDropY, cx, cy);
            });
        }
    });
}

function createSVGLine(x1, y1, x2, y2) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    svgLayer.appendChild(line);
}

// --- Ferramentas ---
function toggleProperty(prop) { 
    if (!selectedNodeId) return showToast('Selecione um indivíduo primeiro.', 'error'); 
    document.getElementById(selectedNodeId).classList.toggle(prop); 
}

function deleteSelected() {
    if (!selectedNodeId) return showToast('Selecione um indivíduo para excluir.', 'error'); 
    document.getElementById(selectedNodeId).remove(); delete nodes[selectedNodeId];
    marriages = marriages.filter(m => m.p1 !== selectedNodeId && m.p2 !== selectedNodeId);
    childrenLinks = childrenLinks.filter(c => c.childId !== selectedNodeId);
    selectedNodeId = null; closeGenetics(); drawConnections();
    showToast('Indivíduo excluído.', 'info');
}

// --- Modais Personalizados ---
function clearWorkspace() { 
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

function executeClearWorkspace() {
    Object.values(nodes).forEach(n => n.element.remove()); 
    nodes = {}; marriages = []; childrenLinks = []; 
    drawConnections(); 
    closeGenetics(); 
    closeConfirmModal();
    showToast('Área limpa com sucesso!', 'success');
}

function exportToPDF() {
    selectNode(null); closeGenetics(); 
    const ws = document.getElementById('workspace');
    const oldBg = ws.style.backgroundImage;
    ws.style.backgroundImage = 'none'; // Tira a grade para o PDF
    
    const opt = { margin: 10, filename: 'heredograma_pro.pdf', html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } };
    
    html2pdf().set(opt).from(ws).save().then(() => { 
        ws.style.backgroundImage = oldBg; 
        showToast('PDF Salvo com sucesso!', 'success');
    });
}