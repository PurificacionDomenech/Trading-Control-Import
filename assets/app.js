// --- Constants ---
const ACCOUNTS_KEY = 'tradingAccounts';
const ACTIVE_ACCOUNT_KEY = 'tradingActiveAccount';

function getChecklistItemsForAccount() {
    const key = `checklist_items_${currentAccountId}`;
    const storedItems = localStorage.getItem(key);

    if (storedItems) {
        return JSON.parse(storedItems);
    } else {
        // Lista por defecto para cuentas nuevas
        return [
            "RITHMIC (CORTAFUEGO)",
            "NINJA CUENTA REAL",
            "REPLICADOR Y GESTOR",
            "NOTICIAS",
            "LECTURA DEL MERCADO",
            "ATM CORRECTOS",
            "GRAFICA",
            "DIARIO DE TRADING",
            "REVISIÓN"
        ];
    }
}

// --- State ---
let accounts = [];
let currentAccountId = null;
let operations = [];
let settings = { initialBalance: 50000, consistencyPercentage: 40, trailingDrawdownAmount: 2500 };
let journals = [];
let goals = { weekly: 0, monthly: 0 };
let highWaterMark = 0;
let drawdownFloor = 0;
let showAllOperations = false;

// --- Helpers ---
function formatCurrency(value) {
    return (typeof value === 'number' ? value.toFixed(2) : '0.00') + ' €';
}

function formatPercentage(value) {
    return (typeof value === 'number' ? value.toFixed(2) : '0.00') + '%';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return 'Fecha Inválida';
    }
}

function formatType(type) {
    switch (type) {
        case 'bullish': return '<span class="positive">Alcista</span>';
        case 'bearish': return '<span class="negative">Bajista</span>';
        case 'other': return '<span>Otro</span>';
        default: return '<em>N/A</em>';
    }
}

function parseAmount(value) {
    if (typeof value !== 'string') return NaN;
    const cleanedValue = value.replace(/\s/g, '').replace(',', '.');
    const number = parseFloat(cleanedValue);
    return isNaN(number) ? NaN : number;
}

function calculateDuration(entryTime, exitTime) {
    if (!entryTime || !exitTime) return 'N/A';
    entryTime = entryTime.split(':').length === 2 ? entryTime + ':00' : entryTime;
    exitTime = exitTime.split(':').length === 2 ? exitTime + ':00' : exitTime;
    if (!/^\d{2}:\d{2}:\d{2}$/.test(entryTime) || !/^\d{2}:\d{2}:\d{2}$/.test(exitTime)) return 'Formato Inválido';
    try {
        const [entryH, entryM, entryS] = entryTime.split(':').map(Number);
        const [exitH, exitM, exitS] = exitTime.split(':').map(Number);
        let durationS = (exitH * 3600 + exitM * 60 + exitS) - (entryH * 3600 + entryM * 60 + entryS);
        if (durationS < 0) return 'Revisar Horas';
        const h = Math.floor(durationS / 3600), m = Math.floor((durationS % 3600) / 60), s = durationS % 60;
        return `${h}h ${m}m ${s}s`;
    } catch (e) {
        return 'Error Cálculo';
    }
}

function readFileAsDataURL(file, callback) {
    if (!file) {
        return callback(null);
    }

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();

        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;

            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 600;

                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                ctx.drawImage(img, 0, 0, width, height);

                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);

                callback(compressedDataUrl);
            };
        };

        reader.readAsDataURL(file);

    } else if (file.type.startsWith('video/')) {
        alert('Los vídeos no se pueden adjuntar para ahorrar espacio. Por favor, añade una referencia en las notas.');
        callback(null);
        return;

    } else {
        callback(null);
    }
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return Math.round(((d - week1) / 86400000 + 1) / 7) + 1;
}

function getDayOfWeek(dateString) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[new Date(dateString).getDay()];
}

// --- Checklist ---
function getChecklistKey() {
    const today = new Date().toISOString().split('T')[0];
    return `checklist_${currentAccountId}_${today}`;
}

function showChecklist(isEditMode = false) {
    const checklistItems = getChecklistItemsForAccount();
    const checklistKey = getChecklistKey();
    let estadoTareas = JSON.parse(localStorage.getItem(checklistKey)) || checklistItems.map(() => false);

    const lista = document.getElementById('listaTareas');
    lista.innerHTML = '';

    checklistItems.forEach((tarea, index) => {
        const li = document.createElement('li');
        li.className = estadoTareas[index] ? 'completed' : '';

        if (isEditMode) {
            li.innerHTML = `
                <input type="text" class="checklist-edit-input" value="${tarea}" data-index="${index}">
                <button class="button-danger button-small" onclick="removeChecklistItem(${index})">Eliminar</button>
            `;
        } else {
            li.innerHTML = `
                <input type="checkbox" ${estadoTareas[index] ? 'checked' : ''} 
                       onchange="markChecklistItem(${index}, this)">
                <span>${tarea}</span>
                ${estadoTareas[index] ? '<span class="ok">OK</span>' : ''}
            `;
        }
        lista.appendChild(li);
    });
}

let isChecklistEditMode = false;

function toggleChecklistEditMode() {
    isChecklistEditMode = !isChecklistEditMode;

    document.getElementById('edit-checklist-btn').style.display = isChecklistEditMode ? 'none' : 'inline-block';
    document.getElementById('save-checklist-btn').style.display = isChecklistEditMode ? 'inline-block' : 'none';
    document.getElementById('add-task-container').style.display = isChecklistEditMode ? 'block' : 'none';

    showChecklist(isChecklistEditMode);
}

function saveChecklistChanges() {
    const inputs = document.querySelectorAll('.checklist-edit-input');
    const newChecklistItems = [];
    inputs.forEach(input => {
        newChecklistItems.push(input.value);
    });

    const key = `checklist_items_${currentAccountId}`;
    localStorage.setItem(key, JSON.stringify(newChecklistItems));

    toggleChecklistEditMode();
    alert('¡Lista de tareas guardada!');
}

function addNewChecklistItem() {
    const input = document.getElementById('new-task-input');
    const newTaskText = input.value.trim();

    if (newTaskText) {
        const currentItems = getChecklistItemsForAccount();
        currentItems.push(newTaskText);

        const key = `checklist_items_${currentAccountId}`;
        localStorage.setItem(key, JSON.stringify(currentItems));

        input.value = '';
        showChecklist(true);
    }
}

function removeChecklistItem(indexToRemove) {
    if (confirm('¿Seguro que quieres eliminar esta tarea de la lista?')) {
        let currentItems = getChecklistItemsForAccount();
        currentItems = currentItems.filter((_, index) => index !== indexToRemove);

        const key = `checklist_items_${currentAccountId}`;
        localStorage.setItem(key, JSON.stringify(currentItems));

        showChecklist(true);
    }
}

function markChecklistItem(index, checkbox) {
    const checklistKey = getChecklistKey();
    const checklistItems = getChecklistItemsForAccount();
    let estadoTareas = JSON.parse(localStorage.getItem(checklistKey)) || checklistItems.map(() => false);
    estadoTareas[index] = checkbox.checked;
    localStorage.setItem(checklistKey, JSON.stringify(estadoTareas));
    showChecklist();
}

function resetChecklist() {
    const checklistKey = getChecklistKey();
    localStorage.removeItem(checklistKey);
    showChecklist();
}

// --- Persistence and Accounts ---
function getOperationsKey(accountId) {
    return `tradingOperations_${accountId}`;
}

function getSettingsKey(accountId) {
    return `tradingSettings_${accountId}`;
}

function getJournalsKey(accountId) {
    return `tradingJournals_${accountId}`;
}

function getGoalsKey(accountId) {
    return `tradingGoals_${accountId}`;
}

function loadAccounts() {
    try {
        const stored = localStorage.getItem(ACCOUNTS_KEY);
        accounts = stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Error loading accounts:", e);
        accounts = [];
    }
}

function saveAccounts() {
    try {
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (e) {
        console.error("Error saving accounts:", e);
    }
}

function populateAccountSelector() {
    const sel = document.getElementById('account-selector');
    sel.innerHTML = '';
    accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.name;
        sel.appendChild(opt);
    });
    if (currentAccountId) {
        sel.value = currentAccountId;
    }
}

function setActiveAccount(id) {
    currentAccountId = id;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, currentAccountId);
    const settingsKey = getSettingsKey(currentAccountId);
    const storedSettings = localStorage.getItem(settingsKey);
    settings = storedSettings ? JSON.parse(storedSettings) : { initialBalance: 50000, consistencyPercentage: 40, trailingDrawdownAmount: 2500 };
    const opsKey = getOperationsKey(currentAccountId);
    const storedOperations = localStorage.getItem(opsKey);
    operations = storedOperations ? JSON.parse(storedOperations) : [];
    operations.sort((a, b) => new Date(a.date + 'T' + (a.entryTime || '00:00:00')) - new Date(b.date + 'T' + (b.entryTime || '00:00:00')));
    const journalsKey = getJournalsKey(currentAccountId);
    const storedJournals = localStorage.getItem(journalsKey);
    journals = storedJournals ? JSON.parse(storedJournals) : [];
    const goalsKey = getGoalsKey(currentAccountId);
    const storedGoals = localStorage.getItem(goalsKey);
    goals = storedGoals ? JSON.parse(storedGoals) : { weekly: 0, monthly: 0 };
    calculateHwmAndDrawdownFloor(true);
    populateAccountSelector();

    if (window.app) {
        window.app.reloadForAccount();
    }

    updateUI();
}

function openCreateAccountModal() {
    const name = prompt('Introduce nombre de la nueva cuenta:');
    if (!name) return;
    const id = Date.now().toString();
    accounts.push({ id: id, name: name });
    saveAccounts();
    setActiveAccount(id);
    alert('Cuenta creada correctamente.');
}

function confirmDeleteAccount() {
    if (!currentAccountId) return;
    const currentAccount = accounts.find(a => a.id === currentAccountId);
    if (!currentAccount) return;
    if (accounts.length === 1) {
        alert('No puedes eliminar la única cuenta.');
        return;
    }
    if (confirm('¿Eliminar cuenta "' + currentAccount.name + '"? Esta acción eliminará todas sus operaciones, diarios y objetivos.')) {
        localStorage.removeItem(getOperationsKey(currentAccountId));
        localStorage.removeItem(getSettingsKey(currentAccountId));
        localStorage.removeItem(getJournalsKey(currentAccountId));
        localStorage.removeItem(getGoalsKey(currentAccountId));
        accounts = accounts.filter(a => a.id !== currentAccountId);
        saveAccounts();
        if (accounts.length > 0) {
            setActiveAccount(accounts[0].id);
        } else {
            const id = Date.now().toString();
            accounts = [{ id: id, name: 'Cuenta 1' }];
            saveAccounts();
            setActiveAccount(id);
        }
        alert('Cuenta eliminada.');
    }
}

function saveData() {
    if (!currentAccountId) return;
    try {
        localStorage.setItem(getOperationsKey(currentAccountId), JSON.stringify(operations));
        localStorage.setItem(getSettingsKey(currentAccountId), JSON.stringify(settings));
        localStorage.setItem(getJournalsKey(currentAccountId), JSON.stringify(journals));
        localStorage.setItem(getGoalsKey(currentAccountId), JSON.stringify(goals));
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, currentAccountId);
    } catch (e) {
        console.error("Error saving data:", e);
        alert("Error al guardar datos.");
    }
}

// --- Tabs ---
function openTab(tabName) {
    const tabContents = document.querySelectorAll('.tab-content');
    const tabs = document.querySelectorAll('.tab');
    tabContents.forEach(el => el.classList.remove('active'));
    tabs.forEach(el => el.classList.remove('active'));
    const tabElement = document.getElementById(tabName);
    const activeButton = document.querySelector(`.tab[onclick="openTab('${tabName}')"]`);
    if (tabElement) tabElement.classList.add('active');
    if (activeButton) activeButton.classList.add('active');
    if (tabName === 'Retos' && typeof app === 'undefined') { window.app = new RetosSemanales();}
    if (tabName === 'checklist') showChecklist();
    else if (tabName === 'historial') { populateYearFilter(); renderOperations(); }
    else if (tabName === 'dashboard') updateDashboard();
    else if (tabName === 'objetivos') {
        document.getElementById('journal-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('weekly-goal').value = goals.weekly || '';
        document.getElementById('monthly-goal').value = goals.monthly || '';
        updateJournalStatistics();
        showJournalEntries();
        updateGoalProgress();
    }
}

// --- Modals ---
function openSettingsModal() {
    if (!currentAccountId) {
        alert('Primero debes seleccionar una cuenta.');
        return;
    }

    // Mostrar nombre de la cuenta
    const currentAccount = accounts.find(a => a.id === currentAccountId);
    const accountNameElem = document.getElementById('settings-account-name');
    if (accountNameElem && currentAccount) {
        accountNameElem.textContent = `Cuenta: ${currentAccount.name}`;
    }

    // Cargar configuración actual de la cuenta activa
    const settingsKey = getSettingsKey(currentAccountId);
    const storedSettings = localStorage.getItem(settingsKey);
    const currentSettings = storedSettings ? JSON.parse(storedSettings) : { 
        initialBalance: 50000, 
        consistencyPercentage: 40, 
        trailingDrawdownAmount: 2500 
    };

    document.getElementById('initial-balance').value = currentSettings.initialBalance;
    document.getElementById('consistency-percentage').value = currentSettings.consistencyPercentage;
    document.getElementById('trailing-drawdown-amount').value = currentSettings.trailingDrawdownAmount;
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

function openDetailsModal() {
    document.getElementById('details-modal').style.display = 'flex';
}

function closeDetailsModal() {
    document.getElementById('details-modal').style.display = 'none';
}

function saveSettings() {
    const ib = parseFloat(document.getElementById('initial-balance').value);
    const cp = parseInt(document.getElementById('consistency-percentage').value);
    const tda = parseFloat(document.getElementById('trailing-drawdown-amount').value);
    if (isNaN(ib) || ib < 0) { alert('Saldo inicial inválido.'); return; }
    if (isNaN(cp) || cp < 1 || cp > 100) { alert('% Consistencia inválido (1-100).'); return; }
    if (isNaN(tda) || tda <= 0) { alert('Importe Drawdown inválido (>0).'); return; }
    settings.initialBalance = ib;
    settings.consistencyPercentage = cp;
    settings.trailingDrawdownAmount = tda;
    calculateHwmAndDrawdownFloor(true);
    saveData();
    closeSettingsModal();
    updateUI();
    alert('Configuración guardada.');
}

function resetAllData() {
    if (confirm('¿Reiniciar TODAS las operaciones, diarios y objetivos? (Configuración se mantiene)')) {
        operations = [];
        journals = [];
        goals = { weekly: 0, monthly: 0 };
        highWaterMark = settings.initialBalance;
        drawdownFloor = settings.initialBalance - settings.trailingDrawdownAmount;
        localStorage.removeItem(getOperationsKey(currentAccountId));
        localStorage.removeItem(getJournalsKey(currentAccountId));
        localStorage.removeItem(getGoalsKey(currentAccountId));
        saveData();
        updateUI();
        alert('Datos reiniciados.');
    }
}

// --- CSV Import ---
function iniciarImportacionCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Mostrar indicador de carga
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'csv-loading-indicator';
    loadingIndicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--card-bg);
        padding: 30px 40px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        z-index: 9999;
        text-align: center;
        border: 2px solid var(--primary-color);
    `;
    loadingIndicator.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 15px;">⏳</div>
        <div style="color: var(--text-color); font-size: 18px; font-weight: 600; margin-bottom: 10px;">Importando operaciones...</div>
        <div style="color: var(--text-muted); font-size: 14px;">Por favor, espera mientras procesamos el archivo CSV</div>
    `;
    document.body.appendChild(loadingIndicator);

    // Añadir backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'csv-loading-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9998;
    `;
    document.body.appendChild(backdrop);

    // Pequeño delay para asegurar que el indicador se muestre
    setTimeout(() => {
        Papa.parse(file, {
            header: true,
            delimiter: ';',
            skipEmptyLines: true,
            complete: function(results) {
                try {
                    procesarCSV(results.data);
                    
                    // Recargar datos de la cuenta activa
                    const opsKey = getOperationsKey(currentAccountId);
                    const storedOperations = localStorage.getItem(opsKey);
                    operations = storedOperations ? JSON.parse(storedOperations) : [];
                    operations.sort((a, b) => new Date(a.fecha_de_operacion + 'T' + (a.tiempo_de_entrada || '00:00:00')) - new Date(b.fecha_de_operacion + 'T' + (b.tiempo_de_entrada || '00:00:00')));
                    
                    calculateHwmAndDrawdownFloor(true);
                    
                    // Eliminar indicador de carga
                    setTimeout(() => {
                        document.getElementById('csv-loading-indicator')?.remove();
                        document.getElementById('csv-loading-backdrop')?.remove();
                        
                        // Actualizar UI
                        updateUI();
                        
                        // Limpiar input
                        event.target.value = '';
                    }, 500);
                    
                } catch (error) {
                    document.getElementById('csv-loading-indicator')?.remove();
                    document.getElementById('csv-loading-backdrop')?.remove();
                    alert('Error procesando el archivo: ' + error.message);
                }
            },
            error: function(error) {
                document.getElementById('csv-loading-indicator')?.remove();
                document.getElementById('csv-loading-backdrop')?.remove();
                alert('Error al leer el archivo CSV: ' + error.message);
                event.target.value = '';
            }
        });
    }, 100);
}

function procesarCSV(data) {
    let operacionesImportadas = 0;
    let operacionesDuplicadas = 0;
    let cuentasCreadas = [];

    // PASO 1: Agrupar operaciones por trade único
    const operacionesAgrupadas = {};

    data.forEach(row => {
        const nombreCuenta = row['Cuenta']?.trim();
        if (!nombreCuenta) return;

        const numeroTrade = row['Número de trade']?.trim();
        const fecha = parsearFechaNinjaTrader(row['Tiempo de entrada']);
        const horaEntrada = parsearHoraNinjaTrader(row['Tiempo de entrada']);

        const claveAgrupacion = `${nombreCuenta}_${fecha}_${horaEntrada}_${numeroTrade}`;

        if (operacionesAgrupadas[claveAgrupacion]) {
            const horaSalidaActual = parsearHoraNinjaTrader(row['Tiempo de salida']);
            const horaSalidaExistente = parsearHoraNinjaTrader(operacionesAgrupadas[claveAgrupacion]['Tiempo de salida']);

            if (!horaSalidaExistente || horaSalidaActual >= horaSalidaExistente) {
                operacionesAgrupadas[claveAgrupacion] = row;
            }
        } else {
            operacionesAgrupadas[claveAgrupacion] = row;
        }
    });

    // PASO 2: Procesar operaciones únicas
    Object.values(operacionesAgrupadas).forEach(row => {
        const nombreCuenta = row['Cuenta']?.trim();
        if (!nombreCuenta) return;

        let cuenta = accounts.find(acc => acc.name === nombreCuenta);
        if (!cuenta) {
            const newAccountId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
            cuenta = { id: newAccountId, name: nombreCuenta };
            accounts.push(cuenta);
            saveAccounts();
            cuentasCreadas.push(nombreCuenta);

            const defaultSettings = {
                initialBalance: 50000,
                consistencyPercentage: 40,
                trailingDrawdownAmount: 2500
            };
            localStorage.setItem(getSettingsKey(newAccountId), JSON.stringify(defaultSettings));
        }

        const cuentaOpsKey = getOperationsKey(cuenta.id);
        const cuentaOps = localStorage.getItem(cuentaOpsKey);
        const operacionesCuenta = cuentaOps ? JSON.parse(cuentaOps) : [];

        const numeroTrade = row['Número de trade']?.trim();
        const fecha = parsearFechaNinjaTrader(row['Tiempo de entrada']);
        const horaEntrada = parsearHoraNinjaTrader(row['Tiempo de entrada']);
        const horaSalida = parsearHoraNinjaTrader(row['Tiempo de salida']);

        const existeDuplicado = operacionesCuenta.some(op => 
            op.numero_de_trade == numeroTrade && 
            op.fecha_de_operacion === fecha &&
            op.tiempo_de_entrada === horaEntrada
        );

        if (existeDuplicado) {
            operacionesDuplicadas++;
            return;
        }

        const gananciaTexto = row['Ganancias']?.replace(/[^0-9,.\-]/g, '').replace(',', '.');
        const ganancia = parseFloat(gananciaTexto) || 0;

        const comisionTexto = row['Comisión']?.replace(/[^0-9,.\-]/g, '').replace(',', '.');
        const comision = parseFloat(comisionTexto) || 0;

        const operacion = {
            id: Date.now() + Math.random(),
            numero_de_trade: numeroTrade || Date.now(),
            cuenta: cuenta.id,
            instrumento: row['Instrumento']?.trim() || 'N/A',
            estrategia_manual: row['Estrategia']?.trim() || 'N/A',
            mercado_pos: row['Mercado pos.']?.trim() || null,
            cant: parseInt(row['Cant.']) || null,
            precio_de_entrada: parseFloat(row['Precio de entrada']?.replace(',', '.')) || null,
            precio_de_salida: parseFloat(row['Precio de salida']?.replace(',', '.')) || null,
            tiempo_de_entrada: horaEntrada,
            tiempo_de_salida: horaSalida,
            fecha_de_operacion: fecha,
            con_ganancia_neto: ganancia,
            comision: comision,
            date: fecha,
            type: row['Mercado pos.']?.toLowerCase() === 'long' ? 'bullish' : 
                  (row['Mercado pos.']?.toLowerCase() === 'short' ? 'bearish' : null),
            activo: row['Instrumento']?.trim() || 'N/A',
            estrategia: row['Estrategia']?.trim() || 'N/A',
            contracts: parseInt(row['Cant.']) || null,
            entryTime: horaEntrada,
            exitTime: horaSalida,
            amount: ganancia,
            duration: calculateDuration(horaEntrada, horaSalida),
            notes: `Importado de NinjaTrader`,
            mood: null,
            newsRating: 0
        };

        operacionesCuenta.push(operacion);
        operacionesCuenta.sort((a, b) => new Date(a.fecha_de_operacion + 'T' + (a.tiempo_de_entrada || '00:00:00')) - 
                                          new Date(b.fecha_de_operacion + 'T' + (b.tiempo_de_entrada || '00:00:00')));

        localStorage.setItem(cuentaOpsKey, JSON.stringify(operacionesCuenta));
        operacionesImportadas++;
    });

    // Mensaje de resumen
    let mensaje = `✅ Importación completada:\n\n`;
    mensaje += `📊 ${operacionesImportadas} operaciones importadas\n`;
    if (operacionesDuplicadas > 0) {
        mensaje += `⚠️ ${operacionesDuplicadas} operaciones duplicadas (omitidas)\n`;
    }
    if (cuentasCreadas.length > 0) {
        mensaje += `\n🆕 Cuentas creadas:\n${cuentasCreadas.map(c => '   • ' + c).join('\n')}`;
    }
    mensaje += `\n\n🔄 Por favor, actualiza la página para ver los datos importados.`;

    alert(mensaje);
    
    // Ofrecer actualización automática
    if (confirm('¿Quieres actualizar la página ahora para ver los datos importados?')) {
        window.location.reload();
    }
}

function parsearFechaNinjaTrader(fechaHora) {
    if (!fechaHora) return new Date().toISOString().split('T')[0];

    // Formato: "01/12/2025 8:31:48"
    const partes = fechaHora.split(' ')[0].split('/');
    if (partes.length === 3) {
        const dia = partes[0].padStart(2, '0');
        const mes = partes[1].padStart(2, '0');
        const año = partes[2];
        return `${año}-${mes}-${dia}`;
    }
    return new Date().toISOString().split('T')[0];
}

function parsearHoraNinjaTrader(fechaHora) {
    if (!fechaHora) return null;

    // Formato: "01/12/2025 8:31:48"
    const partes = fechaHora.split(' ');
    if (partes.length === 2) {
        const hora = partes[1].split(':');
        if (hora.length === 3) {
            return `${hora[0].padStart(2, '0')}:${hora[1].padStart(2, '0')}:${hora[2].padStart(2, '0')}`;
        }
    }
    return null;
}

// --- Operations ---

document.getElementById('trading-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const dateInput = document.getElementById('date');
    const typeInput = document.getElementById('type');
    const activoSelect = document.getElementById('activo');
    const customActivoInput = document.getElementById('custom-activo-input');
    const estrategiaSelect = document.getElementById('estrategia');
    const customEstrategiaInput = document.getElementById('custom-estrategia-input');
    const contractsInput = document.getElementById('contracts');
    const entryTimeInput = document.getElementById('entry-time');
    const exitTimeInput = document.getElementById('exit-time');
    const amountInput = document.getElementById('amount');
    const entryTypeSelect = document.getElementById('entry-type');
    const customEntryTypeInput = document.getElementById('custom-entry-type-input');
    const exitTypeSelect = document.getElementById('exit-type');
    const customExitTypeInput = document.getElementById('custom-exit-type-input');
    const mediaInput = document.getElementById('trade-media');
    const notesInput = document.getElementById('notes');
    const moodInput = document.getElementById('journal-mood');
    const newsRatingInput = document.getElementById('journal-news');

    const date = dateInput.value;
    const type = typeInput.value || null;

    let activo = activoSelect.value;
    if (activo === 'custom') {
        activo = customActivoInput.value.trim();
    }

    let estrategia = estrategiaSelect.value;
    if (estrategia === 'custom') {
        estrategia = customEstrategiaInput.value.trim();
    }

    const contracts = parseInt(contractsInput.value) || null;

    let entryType = entryTypeSelect.value;
    if (entryType === 'custom') {
        entryType = customEntryTypeInput.value.trim();
    }

    let exitType = exitTypeSelect.value;
    if (exitType === 'custom') {
        exitType = customExitTypeInput.value.trim();
    }

    const entryTime = entryTimeInput.value || null;
    const exitTime = exitTimeInput.value || null;
    const amount = parseAmount(amountInput.value);
    const notes = notesInput.value.trim();
    const mood = moodInput.value.trim();
    const newsRating = parseInt(newsRatingInput.value) || 0;

    if (!date || isNaN(amount)) {
        alert('Introduce Fecha e Importe válidos (Ej: 150.50 o -75.20).');
        if (!date) dateInput.focus(); else amountInput.focus();
        return;
    }
    if (entryTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(entryTime)) { alert('Formato hora entrada inválido.'); return; }
    if (exitTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(exitTime)) { alert('Formato hora salida inválido.'); return; }

    readFileAsDataURL(mediaInput.files[0], (mediaData) => {
        const operation = {
            numero_de_trade: Date.now(),
            id: Date.now(),
            fecha_de_operacion: date,
            instrumento: activo || 'N/A',
            cuenta: currentAccountId,
            mercado_pos: type === 'bullish' ? 'Long' : (type === 'bearish' ? 'Short' : null),
            cant: contracts,
            precio_de_entrada: null,
            precio_de_salida: null,
            tiempo_de_entrada: entryTime,
            tiempo_de_salida: exitTime,
            con_ganancia_neto: amount,
            estrategia_manual: estrategia || 'N/A',
            tipo_entrada_manual: entryType || null,
            tipo_salida_manual: exitType || null,
            estado_animo: mood,
            valoracion_noticias: newsRating,
            notas_psicologia: notes,
            media: mediaData,
            date: date,
            type: type,
            activo: activo || 'N/A',
            estrategia: estrategia || 'N/A',
            contracts: contracts,
            entryType: entryType || null,
            exitType: exitType || null,
            entryTime: entryTime,
            exitTime: exitTime,
            duration: calculateDuration(entryTime, exitTime),
            amount: amount,
            notes: notes,
            mood: mood,
            newsRating: newsRating
        };
        // Verificar si estamos editando
        if (window.editingOperationId) {
            const editId = window.editingOperationId;
            operations = operations.filter(op => 
                op.id !== editId && 
                op.numero_de_trade !== editId
            );
            operation.id = editId;
            operation.numero_de_trade = editId;
            delete window.editingOperationId;
        }

        operations.push(operation);
        operations.sort((a, b) => new Date(a.fecha_de_operacion + 'T' + (a.tiempo_de_entrada || '00:00:00')) - new Date(b.fecha_de_operacion + 'T' + (b.tiempo_de_entrada || '00:00:00')));
        calculateHwmAndDrawdownFloor();
        saveData();
        alert('Operación guardada.');

        document.getElementById('trading-form').reset();
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        document.getElementById('custom-activo-input').style.display = 'none';
        document.getElementById('custom-estrategia-input').style.display = 'none';
        document.getElementById('custom-entry-type-input').style.display = 'none';
        document.getElementById('custom-exit-type-input').style.display = 'none';
        setNewsRating(0);

        // Resetear estado de edición
        delete window.editingOperationId;
        const submitButton = document.querySelector('#trading-form button[type="submit"]');
        submitButton.textContent = 'Guardar Operación';
        submitButton.style.backgroundColor = '';

        updateUI();
    });
});

function editOperation(id) {
    const op = operations.find(op => op.id === id || op.numero_de_trade === id);
    if (!op) {
        alert('Operación no encontrada');
        return;
    }

    // Cambiar a la pestaña de registro
    openTab('registro');

    // Llenar el formulario con los datos de la operación
    document.getElementById('date').value = op.fecha_de_operacion || op.date;

    // Tipo de operación
    if (op.mercado_pos === 'Long' || op.type === 'bullish') {
        document.getElementById('type').value = 'bullish';
    } else if (op.mercado_pos === 'Short' || op.type === 'bearish') {
        document.getElementById('type').value = 'bearish';
    }

    // Activo
    const activoSelect = document.getElementById('activo');
    const activoValue = op.instrumento || op.activo;
    if (['Nasdaq', 'Oro', 'Dax'].includes(activoValue)) {
        activoSelect.value = activoValue;
    } else {
        activoSelect.value = 'custom';
        document.getElementById('custom-activo-input').style.display = 'block';
        document.getElementById('custom-activo-input').value = activoValue;
    }

    // Estrategia
    const estrategiaSelect = document.getElementById('estrategia');
    const estrategiaValue = op.estrategia_manual || op.estrategia;
    if (['Flash', 'Monarca', 'Monarca Plus', 'Imperial', 'Golden', 'Golden Band'].includes(estrategiaValue)) {
        estrategiaSelect.value = estrategiaValue;
    } else {
        estrategiaSelect.value = 'custom';
        document.getElementById('custom-estrategia-input').style.display = 'block';
        document.getElementById('custom-estrategia-input').value = estrategiaValue;
    }

    document.getElementById('contracts').value = op.cant || op.contracts || '';
    document.getElementById('entry-time').value = op.tiempo_de_entrada || op.entryTime || '';
    document.getElementById('exit-time').value = op.tiempo_de_salida || op.exitTime || '';
    document.getElementById('amount').value = op.con_ganancia_neto !== undefined ? op.con_ganancia_neto : op.amount;

    // Tipo de entrada
    const entryTypeSelect = document.getElementById('entry-type');
    const entryTypeValue = op.tipo_entrada_manual || op.entryType || '';
    const entryTypeOptions = Array.from(entryTypeSelect.options).map(opt => opt.value);
    if (entryTypeOptions.includes(entryTypeValue)) {
        entryTypeSelect.value = entryTypeValue;
    } else if (entryTypeValue) {
        entryTypeSelect.value = 'custom';
        document.getElementById('custom-entry-type-input').style.display = 'block';
        document.getElementById('custom-entry-type-input').value = entryTypeValue;
    }

    // Tipo de salida
    const exitTypeSelect = document.getElementById('exit-type');
    const exitTypeValue = op.tipo_salida_manual || op.exitType || '';
    const exitTypeOptions = Array.from(exitTypeSelect.options).map(opt => opt.value);
    if (exitTypeOptions.includes(exitTypeValue)) {
        exitTypeSelect.value = exitTypeValue;
    } else if (exitTypeValue) {
        exitTypeSelect.value = 'custom';
        document.getElementById('custom-exit-type-input').style.display = 'block';
        document.getElementById('custom-exit-type-input').value = exitTypeValue;
    }

    document.getElementById('journal-mood').value = op.estado_animo || op.mood || '';
    setNewsRating(op.valoracion_noticias || op.newsRating || 0);
    document.getElementById('notes').value = op.notas_psicologia || op.notes || '';

    // Eliminar la operación antigua al guardar
    window.editingOperationId = op.id || op.numero_de_trade;

    // Cambiar el texto del botón
    const submitButton = document.querySelector('#trading-form button[type="submit"]');
    submitButton.textContent = 'Actualizar Operación';
    submitButton.style.backgroundColor = '#ef44bc';

    // Scroll al formulario
    document.getElementById('trading-form').scrollIntoView({ behavior: 'smooth' });
}

function deleteOperation(id) {
    if (confirm('¿Eliminar esta operación?')) {
        operations = operations.filter(op => op.id !== id && op.numero_de_trade !== id);
        calculateHwmAndDrawdownFloor();
        saveData();
        updateUI();
        alert('Operación eliminada.');
    }
}

function setMood(mood) {
    document.getElementById('journal-mood').value = mood;
}

// --- Asset Selection ---
function handleAssetSelection(selectElement) {
    const selectedValue = selectElement.value;
    let customInputId;

    if (selectElement.id === 'activo') {
        customInputId = 'custom-activo-input';
    } else if (selectElement.id === 'estrategia') {
        customInputId = 'custom-estrategia-input';
    } else if (selectElement.id === 'entry-type') {
        customInputId = 'custom-entry-type-input';
    } else if (selectElement.id === 'exit-type') {
        customInputId = 'custom-exit-type-input';
    }

    const customInput = document.getElementById(customInputId);

    if (selectedValue === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

// --- Drawdown Logic ---
function calculateHwmAndDrawdownFloor(fullRecalculate = false) {
    let currentBalance = settings.initialBalance;
    let peakBalance = settings.initialBalance;
    let calculatedFloor = settings.initialBalance - settings.trailingDrawdownAmount;
    const bufferThreshold = settings.initialBalance + settings.trailingDrawdownAmount;
    let floorIsFixed = false;

    let historicalPeak = settings.initialBalance;
    for (const op of operations) {
        historicalPeak += op.con_ganancia_neto || op.amount || 0;
        if (historicalPeak >= bufferThreshold) {
            floorIsFixed = true;
            break;
        }
    }

    if (floorIsFixed) {
        calculatedFloor = settings.initialBalance;
    } else {
        currentBalance = settings.initialBalance;
        peakBalance = settings.initialBalance;
        operations.forEach(op => {
            currentBalance += op.con_ganancia_neto || op.amount || 0;
            if (currentBalance > peakBalance) {
                peakBalance = currentBalance;
            }
        });
        calculatedFloor = peakBalance - settings.trailingDrawdownAmount;
    }

    let runningBalance = settings.initialBalance;
    highWaterMark = settings.initialBalance;
    operations.forEach(op => {
        runningBalance += op.con_ganancia_neto || op.amount || 0;
        highWaterMark = Math.max(highWaterMark, runningBalance);
    });

    drawdownFloor = Math.max(calculatedFloor, settings.initialBalance - settings.trailingDrawdownAmount);
    if (floorIsFixed) {
        drawdownFloor = Math.min(drawdownFloor, settings.initialBalance);
    }
}

// --- Journals ---
function setNewsRating(value) {
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
        star.classList.remove('selected');
        if (parseInt(star.dataset.value) <= value) {
            star.classList.add('selected');
        }
    });
    document.getElementById('journal-news').value = value;
}

function showJournalEntries() {
    const entriesContainer = document.getElementById('journal-entries');
    entriesContainer.innerHTML = '';

    const activeJournals = journals.filter(entry => !entry.achieved);

    if (activeJournals.length === 0) {
        entriesContainer.innerHTML = '<p>¡No tienes metas pendientes! Buen trabajo.</p>';
        return;
    }

    activeJournals.sort((a, b) => new Date(b.date) - new Date(a.date));

    activeJournals.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'entry';

        div.innerHTML = `
            <div class="entry-header">
                <input type="checkbox" onchange="toggleGoalAchieved(${entry.id}, this.checked)" title="Marcar como conseguida">
                <span>${entry.title}</span>
                <button class="delete-entry" onclick="deleteJournalEntry(${entry.id})">✕</button>
            </div>
            <p style="font-size: 0.8em; color: #b3b3b3; margin-top: 5px;">Fecha: ${formatDate(entry.date)}</p>
        `;
        entriesContainer.appendChild(div);
    });
}

function saveJournalEntry() {
    const date = document.getElementById('journal-date').value;
    const title = document.getElementById('journal-title').value.trim();

    if (!date || !title) {
        alert('Por favor, completa la fecha y el título de la meta.');
        return;
    }

    const entry = {
        id: Date.now(),
        date: date,
        title: title,
        achieved: false
    };

    journals.push(entry);
    saveData();

    document.getElementById('journal-title').value = '';

    updateUI();
    alert('Meta guardada correctamente.');
}

function deleteJournalEntry(id) {
    if (confirm('¿Eliminar esta entrada?')) {
        journals = journals.filter(entry => entry.id !== id);
        saveData();
        showJournalEntries();
    }
}

function renderAchievedGoals() {
    const container = document.getElementById('historial-metas-conseguidas');
    container.innerHTML = '';

    const achievedJournals = journals.filter(entry => entry.achieved);

    if (achievedJournals.length === 0) {
        container.innerHTML = '<p>Aún no has completado ninguna meta.</p>';
        return;
    }

    achievedJournals.sort((a, b) => new Date(b.date) - new Date(a.date));

    achievedJournals.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'entry completed';

        div.innerHTML = `
            <div class="entry-header">
                <span style="font-size: 20px; color: #10b9b9; margin-right: 10px;">✔</span>
                <span style="text-decoration: line-through; color: #6b7280;">${entry.title}</span>
                <button class="delete-entry" onclick="deleteJournalEntry(${entry.id})">✕</button>
            </div>
            <p style="font-size: 0.8em; color: #b3b3b3; margin-top: 5px;">Conseguida: ${formatDate(entry.date)}</p>
        `;
        container.appendChild(div);
    });
}

function saveGoals() {
    const weeklyGoal = parseFloat(document.getElementById('weekly-goal').value) || 0;
    const monthlyGoal = parseFloat(document.getElementById('monthly-goal').value) || 0;
    if (weeklyGoal < 0 || monthlyGoal < 0) {
        alert('Los objetivos deben ser valores positivos.');
        return;
    }
    goals.weekly = weeklyGoal;
    goals.monthly = monthlyGoal;
    saveData();
    updateUI();
    alert('Objetivos guardados.');
}

function updateJournalStatistics() {
    const cont = document.getElementById('journal-stats-container');
    cont.innerHTML = '';
    if (operations.length === 0) {
        cont.innerHTML = '<p>No hay operaciones.</p>';
        return;
    }
    const tOps = operations.length;
    const wOps = operations.filter(op => (op.con_ganancia_neto || op.amount) > 0);
    const lOps = operations.filter(op => (op.con_ganancia_neto || op.amount) < 0);
    const nOps = operations.filter(op => (op.con_ganancia_neto || op.amount) === 0);
    const tWins = wOps.length;
    const tLosses = lOps.length;
    const tProfit = wOps.reduce((s, op) => s + (op.con_ganancia_neto || op.amount), 0);
    const tLoss = lOps.reduce((s, op) => s + (op.con_ganancia_neto || op.amount), 0);
    const netP = tProfit + tLoss;
    const winR = (tWins + tLosses) > 0 ? (tWins / (tWins + tLosses) * 100) : 0;
    const avgW = tWins > 0 ? tProfit / tWins : 0;
    const avgL = tLosses > 0 ? tLoss / tLosses : 0;
    const pF = (tLoss !== 0) ? Math.abs(tProfit / tLoss) : (tProfit > 0 ? Infinity : 0);
    let tDurS = 0, vDurCnt = 0;
    operations.forEach(op => {
        const dur = calculateDuration(op.tiempo_de_entrada || op.entryTime, op.tiempo_de_salida || op.exitTime);
        if (typeof dur === 'string' && dur.includes('h')) {
            const p = dur.match(/(\d+)h (\d+)m (\d+)s/);
            if (p) {
                tDurS += parseInt(p[1]) * 3600 + parseInt(p[2]) * 60 + parseInt(p[3]);
                vDurCnt++;
            }
        }
    });
    const avgDurS = vDurCnt > 0 ? tDurS / vDurCnt : 0;
    const avgH = Math.floor(avgDurS / 3600), avgM = Math.floor((avgDurS % 3600) / 60), avgS = Math.floor(avgDurS % 60);
    const avgDurFmt = vDurCnt > 0 ? `${avgH}h ${avgM}m ${avgS}s` : 'N/A';
    cont.innerHTML = `
        <div class="stat-box"><h4>Total Ops</h4><p>${tOps}</p></div>
        <div class="stat-box"><h4>Ganadoras</h4><p class="positive">${tWins}</p></div>
        <div class="stat-box"><h4>Perdedoras</h4><p class="negative">${tLosses}</p></div>
        <div class="stat-box"><h4>Ratio Acierto</h4><p class="${winR >= 50 ? 'positive' : 'negative'}">${(tWins + tLosses) > 0 ? formatPercentage(winR) : 'N/A'}</p></div>
        <div class="stat-box"><h4>Beneficio Bruto</h4><p class="positive">${formatCurrency(tProfit)}</p></div>
        <div class="stat-box"><h4>Pérdida Bruta</h4><p class="negative">${formatCurrency(Math.abs(tLoss))}</p></div>
        <div class="stat-box"><h4>Beneficio Neto</h4><p class="${netP >= 0 ? 'positive' : 'negative'}">${formatCurrency(netP)}</p></div>
        <div class="stat-box"><h4>Ganancia Media</h4><p class="positive">${formatCurrency(avgW)}</p></div>
        <div class="stat-box"><h4>Pérdida Media</h4><p class="negative">${formatCurrency(Math.abs(avgL))}</p></div>
        <div class="stat-box"><h4>Profit Factor</h4><p class="${pF >= 1 ? 'positive' : 'negative'}">${pF === Infinity ? '∞' : pF.toFixed(2)}</p></div>
        <div class="stat-box"><h4>Duración Media</h4><p>${avgDurFmt}</p></div>
        ${nOps.length > 0 ? `<div class="stat-box"><h4>Neutras</h4><p>${nOps.length}</p></div>` : ''}
    `;
}

function toggleGoalAchieved(id, isAchieved) {
    const entry = journals.find(e => e.id === id);
    if (entry) {
        entry.achieved = isAchieved;
        saveData();
        updateUI();
    }
}

// --- UI Updates ---
function updateUI() {
    updateDashboard(); 
    renderCapitalGrowthChart();
    showJournalEntries(); 

    if (document.getElementById('checklist').classList.contains('active')) {
        showChecklist();
    }
    if (document.getElementById('historial').classList.contains('active')) {
        populateYearFilter(); 
        renderOperations();
    }
    if (document.getElementById('objetivos').classList.contains('active')) {
        document.getElementById('journal-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('weekly-goal').value = goals.weekly || '';
        document.getElementById('monthly-goal').value = goals.monthly || '';
        updateJournalStatistics();
        updateGoalProgress();
        renderCapitalGrowthChart();
    }
}

function populateYearFilter() {
    const sel = document.getElementById('filter-year');
    const cur = sel.value;
    const years = new Set(operations.map(op => op.date.substring(0, 4)));
    years.add(new Date().getFullYear().toString());
    const sorted = Array.from(years).sort((a, b) => b - a);
    while (sel.options.length > 1) sel.remove(1);
    sorted.forEach(y => {
        const o = document.createElement('option');
        o.value = y;
        o.textContent = y;
        sel.appendChild(o);
    });
    sel.value = sorted.includes(cur) ? cur : '';
}

// --- Historial Operations ---
function renderOperations(filteredOps = null) {
    const list = document.getElementById('operations-list');
    list.innerHTML = '';
    const ops = filteredOps || operations;

    if (ops.length === 0) {
        list.innerHTML = '<tr><td colspan="9" style="text-align: center;">No hay operaciones para mostrar.</td></tr>';
        renderAchievedGoals(); 
        return;
    }

    const sortedOps = ops.sort((a, b) => {
        const dateA = new Date(a.fecha_de_operacion || a.date + 'T' + (a.tiempo_de_entrada || a.entryTime || '00:00:00'));
        const dateB = new Date(b.fecha_de_operacion || b.date + 'T' + (b.tiempo_de_entrada || b.entryTime || '00:00:00'));
        return dateB - dateA || b.id - a.id;
    });

    const displayLimit = parseInt(document.getElementById('operations-display').value);
    const opsToShow = displayLimit === -1 ? sortedOps : sortedOps.slice(0, displayLimit);

    opsToShow.forEach(op => {
        const tr = document.createElement('tr');
        const displayAmount = op.con_ganancia_neto !== undefined ? op.con_ganancia_neto : op.amount;
        const amountClass = displayAmount > 0 ? 'positive' : (displayAmount < 0 ? 'negative' : '');
        const typeValue = op.mercado_pos === 'Long' ? 'bullish' : (op.mercado_pos === 'Short' ? 'bearish' : null);

        const mediaHtml = op.media ? 
            (op.media.startsWith('data:image') ? 
                `<img src="${op.media}" class="media-preview">` :
                `<video src="${op.media}" class="media-preview" controls></video>`) : 'N/A';

        let moodDisplay = op.estado_animo || op.mood || 'N/A';
        if (moodDisplay.includes('😊')) moodDisplay = '😊';
        else if (moodDisplay.includes('😐')) moodDisplay = '😐';
        else if (moodDisplay.includes('😟')) moodDisplay = '😟';
        else if (moodDisplay.includes('😠')) moodDisplay = '😠';

        const displayDate = op.fecha_de_operacion || op.date;
        const displayInstrument = op.instrumento || op.activo || 'N/A';
        const displayStrategy = op.estrategia_manual || op.estrategia || 'N/A';
        const displayContracts = op.cant || op.contracts || 'N/A';
        const displayEntryType = op.tipo_entrada_manual || op.entryType || 'N/A';
        const displayExitType = op.tipo_salida_manual || op.exitType || 'N/A';
        const displayDuration = calculateDuration(op.tiempo_de_entrada || op.entryTime, op.tiempo_de_salida || op.exitTime);

        tr.innerHTML = `
            <td>${formatDate(displayDate)}</td>
            <td class="${typeValue === 'bullish' ? 'positive' : (typeValue === 'bearish' ? 'negative' : '')}">${formatType(typeValue)}</td>
            <td>${displayInstrument}</td>
            <td>${displayStrategy}</td>
            <td>${displayContracts}</td>
            <td>${displayEntryType}</td>
            <td>${displayExitType}</td>
            <td>${displayDuration}</td>
            <td>${moodDisplay}</td>
            <td><span class="${amountClass}">${formatCurrency(displayAmount)}</span></td>
            <td>${mediaHtml}</td>
            <td>
                <button onclick="showOperationDetails(${op.id || op.numero_de_trade})" 
                class="button-secondary button-small" style="margin-right: 5px;">Ver</button>
                <button onclick="editOperation(${op.id || op.numero_de_trade})" 
                class="button-secondary button-small" style="margin-right: 5px;">Editar</button>
                <button onclick="deleteOperation(${op.id || op.numero_de_trade})" class="button-danger button-small">Eliminar</button>
            </td>
        `;
        list.appendChild(tr);
    });

    renderAchievedGoals();
}

function changeOperationsDisplay() {
    filterOperations();
}

// --- Operaciones ---
function showOperationDetails(id) {
    const op = operations.find(op => op.id === id || op.numero_de_trade === id);
    if (!op) return;

    const mediaHtml = op.media ? 
        (op.media.startsWith('data:image') ? 
            `<img src="${op.media}" style="max-width: 100%; border-radius: 5px; margin-top: 10px;">` :
            `<video src="${op.media}" style="max-width: 100%; border-radius: 5px; margin-top: 10px;" controls></video>`) 
        : '<p><em>Sin media</em></p>';

    const starsHtml = '★'.repeat(op.valoracion_noticias || op.newsRating || 0) + '☆'.repeat(4 - (op.valoracion_noticias || op.newsRating || 0));

    document.getElementById('operation-details-content').innerHTML = `
        <div style="margin-bottom: 15px;">
            <p><strong>Fecha:</strong> ${formatDate(op.fecha_de_operacion || op.date)}</p>
            <p><strong>Tipo:</strong> ${formatType(op.mercado_pos === 'Long' ? 'bullish' : (op.mercado_pos === 'Short' ? 'bearish' : null))}</p>
            <p><strong>Instrumento:</strong> ${op.instrumento || op.activo || 'N/A'}</p>
            <p><strong>Estrategia:</strong> ${op.estrategia_manual || op.estrategia || 'N/A'}</p>
            <p><strong>Contratos:</strong> ${op.cant || op.contracts || 'N/A'}</p>
            <p><strong>Tipo de Entrada:</strong> ${op.tipo_entrada_manual || op.entryType || 'N/A'}</p>
            <p><strong>Tipo de Salida:</strong> ${op.tipo_salida_manual || op.exitType || 'N/A'}</p>
            <p><strong>Hora Entrada:</strong> ${op.tiempo_de_entrada || op.entryTime || 'N/A'}</p>
            <p><strong>Hora Salida:</strong> ${op.tiempo_de_salida || op.exitTime || 'N/A'}</p>
            <p><strong>Duración:</strong> ${calculateDuration(op.tiempo_de_entrada || op.entryTime, op.tiempo_de_salida || op.exitTime)}</p>
            <p><strong>Importe:</strong> <span class="${(op.con_ganancia_neto || op.amount) > 0 ? 'positive' : ((op.con_ganancia_neto || op.amount) < 0 ? 'negative' : '')}">${formatCurrency(op.con_ganancia_neto || op.amount)}</span></p>
            <p><strong>Estado de Ánimo:</strong> ${op.estado_animo || op.mood || 'N/A'}</p>
            <p><strong>Valoración Noticias:</strong> ${starsHtml}</p>
        </div>
        ${op.notas_psicologia || op.notes ? `<div style="border-top: 1px solid #4b5563; padding-top: 15px;"><h4>Notas:</h4><p style="white-space: pre-wrap;">${op.notas_psicologia || op.notes}</p>
            </div>` : '<p><em>Sin notas.</em></p>'}
        <div style="border-top: 1px solid #4b5563; padding-top: 15px;"><h4>Media:</h4>${mediaHtml}</div>
    `;
    openDetailsModal();
}

// --- Historial Filter ---
function filterOperations() {
    const yf = document.getElementById('filter-year').value;
    const mf = document.getElementById('filter-month').value;
    const tf = document.getElementById('filter-type').value;
    const rf = document.getElementById('filter-result').value;
    let fOps = [...operations];
    if (yf) fOps = fOps.filter(op => (op.fecha_de_operacion || op.date).substring(0, 4) === yf);
    if (mf) fOps = fOps.filter(op => (op.fecha_de_operacion || op.date).substring(5, 7) === mf);
    if (tf) {
        if (tf === 'bullish') fOps = fOps.filter(op => op.mercado_pos === 'Long' || op.type === 'bullish');
        else if (tf === 'bearish') fOps = fOps.filter(op => op.mercado_pos === 'Short' || op.type === 'bearish');
        else if (tf === 'none') fOps = fOps.filter(op => !op.mercado_pos && !op.type);
        else fOps = fOps.filter(op => op.instrumento === tf || op.activo === tf);
    }
    if (rf) {
        fOps = fOps.filter(op => {
            const amount = op.con_ganancia_neto !== undefined ? op.con_ganancia_neto : op.amount;
            if (rf === 'win') return amount > 0;
            if (rf === 'loss') return amount < 0;
            if (rf === 'neutral') return amount === 0;
            return true;
        });
    }
    renderOperations(fOps);
}

function updateGoalProgress() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const weekNumber = getWeekNumber(today);

    const weeklyOps = operations.filter(op => {
        const opDate = new Date(op.fecha_de_operacion || op.date);
        return getWeekNumber(opDate) === weekNumber && opDate.getFullYear() === year;
    });
    const monthlyOps = operations.filter(op => {
        const opDate = new Date(op.fecha_de_operacion || op.date);
        return opDate.getFullYear() === year && (opDate.getMonth() + 1) === month;
    });

    const weeklyPL = weeklyOps.reduce((sum, op) => sum + (op.con_ganancia_neto || op.amount || 0), 0);
    const monthlyPL = monthlyOps.reduce((sum, op) => sum + (op.con_ganancia_neto || op.amount || 0), 0);

    const weeklyPerc = goals.weekly > 0 ? (weeklyPL / goals.weekly * 100) : 0;
    const monthlyPerc = goals.monthly > 0 ? (monthlyPL / goals.monthly * 100) : 0;

    const weeklyPercElem = document.getElementById('weekly-progress-percentage');
    const monthlyPercElem = document.getElementById('monthly-progress-percentage');
    if (weeklyPercElem) {
    weeklyPercElem.textContent = formatPercentage(weeklyPerc);
     weeklyPercElem.className = getPercentageClass(weeklyPerc);
     }
   if (monthlyPercElem) {
   monthlyPercElem.textContent = formatPercentage(monthlyPerc);
   monthlyPercElem.className = getPercentageClass(monthlyPerc);
     }

    const weeklyDetElem = document.getElementById('weekly-progress-detailed');
    const monthlyDetElem = document.getElementById('monthly-progress-detailed');
    if (weeklyDetElem) weeklyDetElem.textContent = `Progreso: ${formatCurrency(weeklyPL)} / ${formatCurrency(goals.weekly)} 
    (${formatPercentage(weeklyPerc)})`;
    if (monthlyDetElem) monthlyDetElem.textContent = `Progreso: ${formatCurrency(monthlyPL)} / ${formatCurrency(goals.monthly)} 
    (${formatPercentage(monthlyPerc)})`;
}

// --- Dashboard Updates ---
function updateDashboard() {
    if (!currentAccountId) return;

    const initialBalance = settings.initialBalance;
    const totalPL = operations.reduce((sum, op) => sum + (op.con_ganancia_neto || op.amount || 0), 0);
    const currentBalance = initialBalance + totalPL;
    const roi = initialBalance > 0 ? (totalPL / initialBalance * 100) : 0;

    document.getElementById('initial-balance-display').textContent = formatCurrency(initialBalance);
    
    // Saldo Actual con clase highlighted
    const currentBalanceElem = document.getElementById('current-balance');
    currentBalanceElem.textContent = formatCurrency(currentBalance);
    if (!currentBalanceElem.parentElement.classList.contains('highlighted')) {
        currentBalanceElem.parentElement.classList.add('highlighted');
    }
    
    const plElem = document.getElementById('profit-loss');
    plElem.textContent = formatCurrency(totalPL);
    plElem.className = totalPL > 0 ? 'positive' : (totalPL < 0 ? 'negative' : '');
    const roiElem = document.getElementById('roi');
    roiElem.textContent = formatPercentage(roi);
    roiElem.className = roi > 0 ? 'positive' : (roi < 0 ? 'negative' : '');

    document.getElementById('high-water-mark').textContent = formatCurrency(highWaterMark);
    document.getElementById('drawdown-floor').textContent = formatCurrency(drawdownFloor);
    
    // Margen hasta Suelo con clase highlighted
    const marginToFloor = currentBalance - drawdownFloor;
    const marginElem = document.getElementById('margin-to-floor');
    marginElem.textContent = formatCurrency(marginToFloor);
    marginElem.className = marginToFloor > 0 ? 'positive' : 'negative';
    if (!marginElem.parentElement.classList.contains('highlighted')) {
        marginElem.parentElement.classList.add('highlighted');
    }

    const explanationElem = document.getElementById('drawdown-explanation');
    if (currentBalance < drawdownFloor) {
        explanationElem.innerHTML += '<p class="drawdown-floor-warning">¡Advertencia: Saldo por debajo del suelo de drawdown!</p>';
    }

    document.getElementById('consistency-limit-display').textContent = settings.consistencyPercentage;
    updateConsistencyRule();

    document.getElementById('weekly-goal-display').textContent = formatCurrency(goals.weekly);
    document.getElementById('monthly-goal-display').textContent = formatCurrency(goals.monthly);
    updateGoalProgress();

    updateWeeklyPerformance();
    renderWeeklySuccessRate();
    updateRecentOperations();
    renderCapitalGrowthChart();
    showJournalEntries();
}

function updateConsistencyRule() {
    const dailyProfits = {};
    operations.forEach(op => {
        const date = op.fecha_de_operacion || op.date;
        if (!dailyProfits[date]) dailyProfits[date] = 0;
        dailyProfits[date] += (op.con_ganancia_neto || op.amount || 0);
    });

    const positiveDays = Object.values(dailyProfits).filter(p => p > 0);
    if (positiveDays.length === 0) {
        document.getElementById('consistency-details').textContent = 'No hay suficientes datos para calcular la consistencia.';
        document.getElementById('consistency-progress').style.width = '0%';
        return;
    }

    const maxDay = Math.max(...positiveDays);
    const totalPositive = positiveDays.reduce((s, p) => s + p, 0);
    const percentage = (maxDay / totalPositive * 100);
    const progress = Math.min(percentage / settings.consistencyPercentage * 100, 100);

    const bar = document.getElementById('consistency-progress');
    bar.style.width = `${progress}%`;
    bar.className = 'progress-bar';
    if (percentage > settings.consistencyPercentage) bar.classList.add('danger');
    else if (percentage > settings.consistencyPercentage * 0.8) bar.classList.add('warning');

    const progressLabel = document.querySelector('.progress-label');
     progressLabel.textContent = formatPercentage(percentage);
     progressLabel.className = `progress-label ${getPercentageClass(percentage)}`;
    document.getElementById('consistency-details').textContent = `Día más rentable: ${formatCurrency(maxDay)}
     (${formatPercentage(percentage)}) de total ganancias ${formatCurrency(totalPositive)}`;
}

function updateWeeklyPerformance() {
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const performance = Array(5).fill(0);
    operations.forEach(op => {
        let day = new Date(op.fecha_de_operacion || op.date).getDay();
        if (day === 0) day = 5;
        else day -= 1;
        performance[day] += (op.con_ganancia_neto || op.amount || 0);
    });

    const container = document.getElementById('weekly-performance');
    container.innerHTML = '';
    days.forEach((day, index) => {
        const box = document.createElement('div');
        box.className = 'stat-box';
        box.innerHTML = `<h4>${day}</h4><p class="${performance[index] > 0 ? 'positive' : (performance[index] < 0 ? 'negative' : '')}">${formatCurrency(performance[index])}</p>`;
        container.appendChild(box);
    });
}

function renderWeeklySuccessRate() {
    const weeklySuccessRate = document.getElementById('weekly-success-rate');
    if (!weeklySuccessRate) return;

    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const dayStats = {};

    days.forEach(day => {
        dayStats[day] = { total: 0, wins: 0, percentage: 0 };
    });

    operations.forEach(op => {
        const dayName = getDayOfWeek(op.fecha_de_operacion || op.date);
        if (days.includes(dayName)) {
            const amount = parseFloat(op.con_ganancia_neto || op.amount) || 0;
            dayStats[dayName].total++;
            if (amount > 0) {
                dayStats[dayName].wins++;
            }
        }
    });

    Object.keys(dayStats).forEach(day => {
        if (dayStats[day].total > 0) {
            dayStats[day].percentage = (dayStats[day].wins / dayStats[day].total * 100).toFixed(1);
        }
    });

    weeklySuccessRate.innerHTML = days.map(day => {
        const stats = dayStats[day];
        const percentage = stats.percentage;
        const colorClass = percentage >= 60 ? 'positive' : percentage >= 40 ? 'warning' : 'negative';

        return `
            <div class="stat-box">
                <h4>${day}</h4>
                <p class="${colorClass}">${percentage}%</p>
                <small>${stats.wins}/${stats.total} aciertos</small>
            </div>
        `;
    }).join('');
}

function updateRecentOperations() {
    const recent = operations.slice(-5).reverse();
    const container = document.getElementById('recent-operations');
    container.innerHTML = '';
    if (recent.length === 0) {
        container.innerHTML = '<p>No hay operaciones recientes para mostrar.</p>';
        return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Fecha</th><th>Importe</th></tr></thead><tbody></tbody>';
    recent.forEach(op => {
        const tr = document.createElement('tr');
        const displayAmount = op.con_ganancia_neto !== undefined ? op.con_ganancia_neto : op.amount;
        const amountClass = displayAmount > 0 ? 'positive' : (displayAmount < 0 ? 'negative' : '');
        tr.innerHTML = `<td>${formatDate(op.fecha_de_operacion || op.date)}</td><td><span class="${amountClass}">${formatCurrency(displayAmount)}</span></td>`;
        table.querySelector('tbody').appendChild(tr);
    });
    container.appendChild(table);
}

function getPercentageClass(percentage) {
    if (percentage === 50 || percentage === 0) {
        return 'percentage-50';
    } else if (percentage < 50) {
        return 'percentage-below-50';
    } else {
        return 'percentage-above-50';
    }
}

function renderCapitalGrowthChart() {
    const canvas = document.getElementById('capitalGrowthChart');
    if (!canvas) {
        console.error("Canvas 'capitalGrowthChart' no encontrado.");
        return;
    }

    if (window.capitalGrowthChartInstance) {
        window.capitalGrowthChartInstance.destroy();
    }

    const dailyBalances = {};
    let runningBalance = settings.initialBalance;
    let highWaterMark = settings.initialBalance;

    const sortedOperations = [...operations].sort((a, b) => new Date(a.fecha_de_operacion || a.date) - new Date(b.fecha_de_operacion || b.date));

    sortedOperations.forEach(op => {
        runningBalance += (op.con_ganancia_neto || op.amount || 0);
        dailyBalances[op.fecha_de_operacion || op.date] = runningBalance;
        highWaterMark = Math.max(highWaterMark, runningBalance);
    });

    const labels = [];
    const balanceData = [];
    const drawdownFloorData = []; // Renamed for clarity

    if (sortedOperations.length > 0) {
        const firstOpDate = new Date(sortedOperations[0].fecha_de_operacion || sortedOperations[0].date);
        firstOpDate.setDate(firstOpDate.getDate() - 1);

        labels.push(firstOpDate.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }));
        balanceData.push(settings.initialBalance);
        drawdownFloorData.push(settings.initialBalance - settings.trailingDrawdownAmount);
    }

    let currentHWM = settings.initialBalance;
    for (const date in dailyBalances) {
        labels.push(new Date(date).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }));
        balanceData.push(dailyBalances[date]);
        currentHWM = Math.max(currentHWM, dailyBalances[date]);
        let drawdownValue = currentHWM - settings.trailingDrawdownAmount;
        if (currentHWM >= settings.initialBalance + settings.trailingDrawdownAmount) {
            drawdownValue = settings.initialBalance;
        } else {
            drawdownValue = Math.max(drawdownValue, settings.initialBalance - settings.trailingDrawdownAmount);
        }
        drawdownFloorData.push(drawdownValue);
    }

    window.capitalGrowthChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Balance',
                    data: balanceData,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
                    backgroundColor: 'rgba(74, 157, 168, 0.1)',
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Suelo Drawdown',
                    data: drawdownFloorData,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    ticks: { color: '#b3b3b3', maxRotation: 0, minRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    ticks: { color: '#b3b3b3', callback: (v) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    align: 'start',
                    labels: {
                        color: '#ffffff',
                        boxWidth: 20,
                        padding: 20
                    }
                }
            }
        }
    });
}

class RetosSemanales {
    constructor() {
        this.currentWeek = this.getCurrentWeekKey();
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.data = this.loadData();
        this.dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
        this.chartInstance = null;
        this.monthlyChartInstance = null;
        this.viendoTodo = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderAll();
    }

    setupEventListeners() {
        document.getElementById('prevWeek').addEventListener('click', () => this.changeWeek(-1));
        document.getElementById('nextWeek').addEventListener('click', () => this.changeWeek(1));
        document.getElementById('retoInput').addEventListener('input', (e) => this.updateReto(e.target.value));
        document.getElementById('retoInput').addEventListener('blur', () => this.fixReto());
        document.getElementById('btnGuardarHistorial').addEventListener('click', () => this.guardarEnHistorial());
        document.getElementById('btnBorrarHistorial').addEventListener('click', () => this.borrarHistorial());
        document.getElementById('btnEditarReto').addEventListener('click', () => this.editarReto());
        document.getElementById('btnGuardarReto').addEventListener('click', () => this.guardarReto());
        document.getElementById('prevMonthBtn').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('nextMonthBtn').addEventListener('click', () => this.changeMonth(1));
        document.getElementById('toggleTotalViewBtn').addEventListener('click', () => this.toggleVistaTotal());
    }

    getRetosKey() {
        return `retosSemanalesData_${currentAccountId}`;
    }

    loadData() {
        const saved = localStorage.getItem(this.getRetosKey());
        return saved ? JSON.parse(saved) : {};
    }

    saveData() {
        localStorage.setItem(this.getRetosKey(), JSON.stringify(this.data));
    }

    reloadForAccount() {
        this.data = this.loadData();
        this.currentWeek = this.getCurrentWeekKey();
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.viendoTodo = false;
        this.renderAll();
    }

    getCurrentWeekData() {
        if (!this.data[this.currentWeek]) {
            this.data[this.currentWeek] = {
                reto: '',
                retoFijo: false,
                completada: false,
                dias: {}
            };
            this.dias.forEach(dia => {
                this.data[this.currentWeek].dias[dia.toLowerCase()] = { cumplido: null, resultado: null };
            });
        }
        return this.data[this.currentWeek];
    }

    toggleVistaTotal() {
        this.viendoTodo = !this.viendoTodo;
        this.renderMonthlyStats();
    }

    renderAll() {
        this.renderWeekDisplay();
        this.renderDias();
        this.renderEstadisticas();
        this.renderMonthlyStats();
        this.renderHistorial();
        this.loadCurrentWeekData();
    }

    renderWeekDisplay() {
        document.getElementById('currentWeekDisplay').textContent = this.formatWeekName(this.currentWeek);
    }

    renderDias() {
        const container = document.getElementById('diasGrid');
        container.innerHTML = `<div class="dias-grid-header"><span>Día</span><span>Reto</span><span>Operativa</span></div>`;
        const weekData = this.getCurrentWeekData();
        const isCompletada = weekData.completada;

        this.dias.forEach(dia => {
            const diaKey = dia.toLowerCase();
            const diaData = weekData.dias[diaKey];
            const diaElemento = document.createElement('div');
            diaElemento.className = 'dia-linea';
            diaElemento.style.gridTemplateColumns = "100px 40px 40px 1fr";

            diaElemento.innerHTML = `
                <span class="dia-nombre-lineal">${dia}</span>
                <button class="btn-cumplido-check ${diaData.cumplido === true ? 'active' : ''}" 
                        onclick="window.app.toggleDia('${diaKey}', true)" 
                        ${isCompletada ? 'disabled' : ''}>✓</button>
                <button class="btn-no-cumplido-check ${diaData.cumplido === false ? 'active' : ''}" 
                        onclick="window.app.toggleDia('${diaKey}', false)" 
                        ${isCompletada ? 'disabled' : ''}>✗</button>
                <div class="resultado-selector-lineal">
                    <select onchange="window.app.updateResultado('${diaKey}', this.value)" ${isCompletada ? 'disabled' : ''}>
                        <option value="">Resultado...</option>
                        <option value="positivo" ${diaData.resultado === 'positivo' ? 'selected' : ''}>Positivo</option>
                        <option value="negativo" ${diaData.resultado === 'negativo' ? 'selected' : ''}>Negativo</option>
                    </select>
                </div>`;
            container.appendChild(diaElemento);
        });
        this.actualizarBotonGuardar();
    }

    toggleDia(diaKey, cumplido) {
        const weekData = this.getCurrentWeekData();
        const dia = weekData.dias[diaKey];
        if (dia.cumplido === cumplido) {
            dia.cumplido = null;
        } else {
            dia.cumplido = cumplido;
        }
        this.saveData();
        this.renderDias();
        this.renderEstadisticas();
    }

    renderEstadisticas() {
        const weekData = this.getCurrentWeekData();
        const dias = Object.values(weekData.dias);
        const diasCumplidos = dias.filter(d => d.cumplido === true).length;
        const resultadosPositivos = dias.filter(d => d.resultado === 'positivo').length;
        const resultadosNegativos = dias.filter(d => d.resultado === 'negativo').length;
        const diasMarcados = dias.filter(d => d.cumplido !== null).length;
        const porcentajeCumplimiento = diasMarcados > 0 ? Math.round((diasCumplidos / diasMarcados) * 100) : 0;
        const efectividad = diasCumplidos > 0 ? Math.round(dias.filter(d => d.cumplido === true && d.resultado === 'positivo').length / diasCumplidos * 100) : 0;

        document.getElementById('diasCumplidos').textContent = diasCumplidos;
        document.getElementById('resultadosPositivos').textContent = resultadosPositivos;
        document.getElementById('resultadosNegativos').textContent = resultadosNegativos;
        document.getElementById('porcentajeCumplimiento').textContent = `${porcentajeCumplimiento}%`;
        document.getElementById('efectividad').textContent = `${efectividad}%`;
        this.renderChart(dias);
    }

    renderChart(dias) {
        const canvas = document.getElementById('chartCanvas');
        if (!canvas) return;
        if (this.chartInstance) this.chartInstance.destroy();
        const retoData = dias.map(d => d.cumplido === null ? null : (d.cumplido ? 1 : 0));
        const operativaData = dias.map(d => d.resultado === null ? null : (d.resultado === 'positivo' ? 1 : -1));
        this.chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: this.dias, datasets: [{ label: 'Cumplimiento Reto', data: retoData, borderColor: '#00f2ea', tension: 0.4 }, { label: 'Resultado Operativa', data: operativaData, borderColor: '#ef44bc', tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#b3b3b3', callback: v => { if (v === 1) return 'Positivo/Cumplido'; if (v === 0) return 'Neutral/No Cumplido'; if (v === -1) return 'Negativo'; return null; } } }, x: { ticks: { color: '#b3b3b3' } } }, plugins: { legend: { labels: { color: '#ffffff' } }, title: { display: true, text: 'Progreso Semanal: Reto vs Operativa', color: '#ffffff' } } }
        });
    }

    renderMonthlyStats() {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const titulo = document.getElementById('currentMonth');
        const prevBtn = document.getElementById('prevMonthBtn');
        const nextBtn = document.getElementById('nextMonthBtn');
        const toggleBtn = document.getElementById('toggleTotalViewBtn');

        let semanasDelPeriodo;

        if (this.viendoTodo) {
            titulo.textContent = 'Historial Completo';
            toggleBtn.textContent = 'Ver por Mes';
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            semanasDelPeriodo = Object.keys(this.data).filter(k => this.data[k].completada);
        } else {
            titulo.textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;
            toggleBtn.textContent = 'Ver Todo';
            prevBtn.style.display = 'inline-block';
            nextBtn.style.display = 'inline-block';
            semanasDelPeriodo = Object.keys(this.data).filter(k => 
                this.data[k].completada && 
                new Date(this.getWeekDates(k)).getMonth() === this.currentMonth && 
                new Date(this.getWeekDates(k)).getFullYear() === this.currentYear
            );
        }

        let totalDiasCumplidos = 0, totalPositivos = 0, totalDiasMarcados = 0;
        semanasDelPeriodo.forEach(key => {
            const dias = Object.values(this.data[key].dias);
            totalDiasCumplidos += dias.filter(d => d.cumplido === true).length;
            totalPositivos += dias.filter(d => d.resultado === 'positivo').length;
            totalDiasMarcados += dias.filter(d => d.cumplido !== null).length;
        });

        document.getElementById('semanasDelMes').textContent = semanasDelPeriodo.length;
        document.getElementById('diasCumplidosMes').textContent = totalDiasCumplidos;
        document.getElementById('positivosMes').textContent = totalPositivos;
        document.getElementById('cumplimientoMes').textContent = `${totalDiasMarcados > 0 ? Math.round((totalDiasCumplidos / totalDiasMarcados) * 100) : 0}%`;

        this.renderMonthlyChart(semanasDelPeriodo);
    }

    renderMonthlyChart(semanasDelMes) {
        const canvas = document.getElementById('monthlyChart');
        if (!canvas) return;
        if (this.monthlyChartInstance) this.monthlyChartInstance.destroy();
        const ctx = canvas.getContext('2d');
        if (semanasDelMes.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#6c757d'; ctx.textAlign = 'center'; ctx.fillText('No hay datos para este mes', canvas.width / 2, canvas.height / 2);
            return;
        }
        const labels = semanasDelMes.map(k => `Semana ${k.split('-W')[1]}`);
        const cumplidosData = semanasDelMes.map(k => Object.values(this.data[k].dias).filter(d => d.cumplido === true).length);
        const positivosData = semanasDelMes.map(k => Object.values(this.data[k].dias).filter(d => d.resultado === 'positivo').length);
        this.monthlyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Días Cumplidos', data: cumplidosData, backgroundColor: '#00f2ea' }, { label: 'Resultados Positivos', data: positivosData, backgroundColor: '#ef44bc' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: '#b3b3b3', stepSize: 1 } } }, plugins: { legend: { labels: { color: '#ffffff' } }, title: { display: true, text: 'Resumen Mensual por Semana', color: '#ffffff' } } }
        });
    }

    renderHistorial() {
        const container = document.getElementById('historialContainer');
        container.innerHTML = '';
        const semanas = Object.keys(this.data).filter(key => this.data[key].completada).sort((a, b) => b.localeCompare(a));
        if (semanas.length === 0) { container.innerHTML = '<p style="text-align: center; color: #6c757d;">No hay historial disponible</p>'; return; }
        semanas.forEach(key => {
            const semanaData = this.data[key];
            const dias = Object.values(semanaData.dias);
            const cumplidos = dias.filter(d => d.cumplido === true).length;
            const positivos = dias.filter(d => d.resultado === 'positivo').length;
            const porcentaje = dias.filter(d => d.cumplido !== null).length > 0 ? Math.round(cumplidos / dias.filter(d => d.cumplido !== null).length * 100) : 0;
            const item = document.createElement('div');
            item.className = 'historial-item';
            item.innerHTML = `<div><div class="historial-fecha">${this.formatWeekName(key)}</div><div class="historial-stats">${cumplidos}/5 cumplidos (${porcentaje}%), ${positivos} positivos</div><div class="historial-reto">${semanaData.reto || 'Sin reto'}</div></div><div><button class="btn-ver-semana" onclick="window.app.verSemana('${key}')">Ver</button><button class="btn-eliminar-semana" onclick="window.app.eliminarSemana('${key}')">Eliminar</button></div>`;
            container.appendChild(item);
        });
    }

    changeWeek(direction) {
        const [year, week] = this.currentWeek.split('-W');
        let newWeek = parseInt(week) + direction;
        let newYear = parseInt(year);
        if (newWeek < 1) { newWeek = 52; newYear--; } 
        else if (newWeek > 52) { newWeek = 1; newYear++; }
        this.currentWeek = `${newYear}-W${String(newWeek).padStart(2, '0')}`;
        this.renderAll();
    }

    changeMonth(direction) {
        this.currentMonth += direction;
        if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
        else if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
        this.renderMonthlyStats();
    }

    updateResultado(diaKey, resultado) {
        this.getCurrentWeekData().dias[diaKey].resultado = resultado || null;
        this.saveData();
        this.renderEstadisticas();
    }

    updateReto(reto) {
        if (!this.getCurrentWeekData().retoFijo) this.getCurrentWeekData().reto = reto;
        this.saveData();
    }

    fixReto() {
        const weekData = this.getCurrentWeekData();
        if (weekData.reto && !weekData.retoFijo) {
            weekData.retoFijo = true;
            this.saveData();
            this.loadCurrentWeekData();
        }
    }

    editarReto() {
        document.getElementById('retoInput').disabled = false;
        document.getElementById('retoInput').focus();
        document.getElementById('btnEditarReto').style.display = 'none';
        document.getElementById('btnGuardarReto').style.display = 'flex';
    }

    guardarReto() {
        const weekData = this.getCurrentWeekData();
        weekData.reto = document.getElementById('retoInput').value;
        weekData.retoFijo = true;
        this.saveData();
        this.loadCurrentWeekData();
    }

    loadCurrentWeekData() {
        const weekData = this.getCurrentWeekData();
        const retoInput = document.getElementById('retoInput');
        const btnEditar = document.getElementById('btnEditarReto');
        const btnGuardar = document.getElementById('btnGuardarReto');
        retoInput.value = weekData.reto;
        retoInput.disabled = weekData.retoFijo || weekData.completada;
        if (weekData.completada) {
            btnEditar.style.display = 'none';
            btnGuardar.style.display = 'none';
        } else if (weekData.retoFijo) {
            btnEditar.style.display = 'flex';
            btnGuardar.style.display = 'none';
        } else {
            btnEditar.style.display = 'none';
            btnGuardar.style.display = 'none';
        }
    }

    actualizarBotonGuardar() {
        const weekData = this.getCurrentWeekData();
        const diasMarcados = Object.values(weekData.dias).filter(d => d.cumplido !== null || d.resultado !== null).length;
        document.getElementById('btnGuardarHistorial').style.display = (weekData.reto && diasMarcados > 0 && !weekData.completada) ? 'block' : 'none';
    }

    guardarEnHistorial() {
        this.getCurrentWeekData().completada = true;
        this.saveData();
        alert('Semana finalizada y guardada en el historial.');
        this.renderAll();
    }

    verSemana(semanaKey) {
        this.currentWeek = semanaKey;
        this.renderAll();
        document.getElementById('Retos').scrollIntoView({ behavior: 'smooth' });
    }

    eliminarSemana(semanaKey) {
        if (confirm(`¿Estás seguro de que quieres eliminar la semana ${this.formatWeekName(semanaKey)}?`)) {
            delete this.data[semanaKey];
            this.saveData();
            this.renderAll();
        }
    }

    borrarHistorial() {
        if (confirm('¿Estás seguro de que quieres borrar todo el historial?')) {
            Object.keys(this.data).forEach(key => { if (this.data[key].completada) delete this.data[key]; });
            this.saveData();
            this.renderAll();
        }
    }

    getCurrentWeekKey() {
        const now = new Date();
        const year = now.getFullYear();
        const week = this.getWeekNumber(now);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }

    getWeekDates(weekKey) {
        const [year, week] = weekKey.split('-W');
        const d = new Date(year, 0, 1 + (parseInt(week) - 1) * 7);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    formatWeekName(weekKey) {
        const weekStart = this.getWeekDates(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 4);
        const formatDate = (date) => date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
    }
}

// --- INICIALIZACIÓN CONTROLADA ---
let app; 

const originalOpenTab = window.openTab;
window.openTab = function(tabName) {
    originalOpenTab(tabName); 

    if (tabName === 'Retos' && !window.app) {
        window.app = new RetosSemanales();
    }
}

// --- Inicialización ---
loadAccounts();
const storedActive = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
if (storedActive && accounts.find(a => a.id === storedActive)) {
    setActiveAccount(storedActive);
} else if (accounts.length === 0) {
    openCreateAccountModal();
} else {
    setActiveAccount(accounts[0].id);
}
document.getElementById('date').value = new Date().toISOString().split('T')[0];

// Listener para importación CSV
document.getElementById('csv-file-input').addEventListener('change', iniciarImportacionCSV);

openTab('dashboard');

// --- Theme Toggle ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const themeToggle = document.getElementById('theme-toggle');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.textContent = '🌙';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');

        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
    });
}

// Registro del Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('SW registrado correctamente');
            })
            .catch((error) => {
                console.log('Error registrando SW:', error);
            });
    });
}

// Inicializar tema
initTheme();