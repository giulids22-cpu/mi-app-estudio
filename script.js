// ==========================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
let fechaActual = new Date();
let diaSeleccionadoStr = null; // Guardará "YYYY-MM-DD"

// Persistencia en LocalStorage
let planesGuardados = JSON.parse(localStorage.getItem('estudio_planes')) || {};
let tiemposMaterias = JSON.parse(localStorage.getItem('estudio_tiempos')) || {
    "Análisis": 0, "Física": 0, "Francés": 0, "Inglés": 0, "Python": 0, "Claude": 0
};
let tareasMaterias = JSON.parse(localStorage.getItem('estudio_tareas')) || {
    "Análisis": [], "Física": [], "Francés": [], "Inglés": [], "Python": [], "Claude": [], "Clases Dictadas": []
};
let historialSesiones = JSON.parse(localStorage.getItem('estudio_historial')) || [];
let horasClasesSemanales = parseFloat(localStorage.getItem('estudio_horas_clases')) || 0;

// Variables para el temporizador
let temporizadorInterval = null;
let tiempoRestanteSegundos = 25 * 60;
let enEjecucion = false;

// Instancias de Chart.js
let chartMateriasInstance = null;
let chartSemanalInstance = null;

const NOMBRES_MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// ==========================================
// 2. NAVEGACIÓN ENTRE PANTALLAS
// ==========================================
function cambiarPantalla(idPantalla, targetBtn) {
    document.querySelectorAll('.pantalla').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-links button').forEach(btn => btn.classList.remove('active'));

    const pantallaTarget = document.getElementById(idPantalla);
    if (pantallaTarget) {
        pantallaTarget.style.display = 'block';
    }

    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    if (idPantalla === 'pantalla-calendario') {
        renderizarCalendario();
    } else if (idPantalla === 'pantalla-estadisticas') {
        actualizarMetricasYGraficos();
    }
}

function inicializarNavegacion() {
    const navMapping = [
        { idBtn: 'nav-inicio', idPantalla: 'pantalla-inicio' },
        { idBtn: 'nav-calendario', idPantalla: 'pantalla-calendario' },
        { idBtn: 'nav-temporizador', idPantalla: 'pantalla-temporizador' },
        { idBtn: 'nav-estadisticas', idPantalla: 'pantalla-estadisticas' }
    ];

    navMapping.forEach(item => {
        const btn = document.getElementById(item.idBtn);
        if (btn) {
            btn.addEventListener('click', (e) => cambiarPantalla(item.idPantalla, e.currentTarget));
        }
    });
}

// ==========================================
// 3. GESTIÓN DE TAREAS, TARJETAS Y CLASES
// ==========================================
function renderizarTareasMaterias() {
    document.querySelectorAll('.card').forEach(card => {
        const materia = card.getAttribute('data-materia');
        const listaUl = card.querySelector('.lista-tareas');
        
        if (!materia || !listaUl) return;

        listaUl.innerHTML = '';
        const tareas = tareasMaterias[materia] || [];

        tareas.forEach((tarea, index) => {
            const li = document.createElement('li');
            li.style.cssText = `
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                margin-bottom: 4px;
                font-size: 0.9rem;
            `;

            li.innerHTML = `
                <span style="text-decoration: ${tarea.completada ? 'line-through' : 'none'}; color: ${tarea.completada ? '#888' : '#333'}; cursor: pointer;">
                    ${tarea.texto}
                </span>
                <button class="btn-eliminar-tarea" data-index="${index}" style="background: none; border: none; cursor: pointer; color: #ff5252;">✕</button>
            `;

            // Toggle completada
            li.querySelector('span').addEventListener('click', () => {
                tareasMaterias[materia][index].completada = !tareasMaterias[materia][index].completada;
                guardarTareas();
                renderizarTareasMaterias();
            });

            // Borrar tarea
            li.querySelector('.btn-eliminar-tarea').addEventListener('click', (e) => {
                e.stopPropagation();
                tareasMaterias[materia].splice(index, 1);
                guardarTareas();
                renderizarTareasMaterias();
            });

            listaUl.appendChild(li);
        });
    });

    // Sincronizar input de horas de clases con el valor guardado
    const inputClases = document.getElementById('input-horas-clases');
    if (inputClases) {
        inputClases.value = horasClasesSemanales > 0 ? horasClasesSemanales : '';
    }
}

function inicializarFormulariosTareas() {
    document.querySelectorAll('.card').forEach(card => {
        const materia = card.getAttribute('data-materia');
        const input = card.querySelector('.input-tarea');
        const btn = card.querySelector('.btn-agregar-tarea');

        if (!materia || !input || !btn) return;

        const agregarferencia = () => {
            const texto = input.value.trim();
            if (!texto) return;

            if (!tareasMaterias[materia]) tareasMaterias[materia] = [];
            tareasMaterias[materia].push({ texto, completada: false });
            
            guardarTareas();
            input.value = '';
            renderizarTareasMaterias();
        };

        btn.addEventListener('click', agregarferencia);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') agregarferencia();
        });
    });

    // Guardar horas de clases semanales
    const btnGuardarClases = document.getElementById('btn-guardar-clases');
    if (btnGuardarClases) {
        btnGuardarClases.addEventListener('click', () => {
            const inputClases = document.getElementById('input-horas-clases');
            const valor = parseFloat(inputClases.value);
            horasClasesSemanales = isNaN(valor) ? 0 : valor;
            
            localStorage.setItem('estudio_horas_clases', horasClasesSemanales);
            actualizarTiemposTarjetas();
            alert('¡Horas de clases guardadas con éxito!');
        });
    }
}

function guardarTareas() {
    localStorage.setItem('estudio_tareas', JSON.stringify(tareasMaterias));
}

// ==========================================
// 4. LÓGICA DEL CALENDARIO Y COLORES
// ==========================================
const COLORES_MATERIAS = {
    "Análisis": { bg: "#e3f2fd", text: "#1565c0", border: "#bbdefb" },
    "Física": { bg: "#fce4ec", text: "#c2185b", border: "#f8bbd0" },
    "Francés": { bg: "#e8f5e9", text: "#2e7d32", border: "#c8e6c9" },
    "Inglés": { bg: "#fff3e0", text: "#e65100", border: "#ffe0b2" },
    "Python": { bg: "#fff8e1", text: "#f57f17", border: "#ffecb3" },
    "Claude": { bg: "#f3e5f5", text: "#6a1b9a", border: "#e1bee7" },
    "Default": { bg: "#f5f5f5", text: "#424242", border: "#e0e0e0" }
};

function renderizarCalendario() {
    const ano = fechaActual.getFullYear();
    const mes = fechaActual.getMonth();

    const tituloMes = document.getElementById('titulo-mes');
    if (tituloMes) tituloMes.innerText = `${NOMBRES_MESES[mes]} ${ano}`;

    const grilla = document.getElementById('grilla-calendario');
    if (!grilla) return;
    grilla.innerHTML = '';

    const primerDiaMes = new Date(ano, mes, 1).getDay(); 
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

    for (let i = 0; i < primerDiaMes; i++) {
        const celdaVacia = document.createElement('div');
        celdaVacia.style.padding = '10px';
        grilla.appendChild(celdaVacia);
    }

    for (let dia = 1; dia <= totalDiasMes; dia++) {
        const celda = document.createElement('div');
        celda.style.cssText = `
            padding: 6px 4px;
            border: 1px solid #ddd;
            border-radius: 6px;
            min-height: 80px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            cursor: pointer;
            background: #fff;
            overflow: hidden;
        `;

        const mesStr = String(mes + 1).padStart(2, '0');
        const diaStr = String(dia).padStart(2, '0');
        const claveFecha = `${ano}-${mesStr}-${diaStr}`;

        const numDia = document.createElement('div');
        numDia.style.cssText = 'font-weight: bold; font-size: 0.85rem; margin-bottom: 4px; text-align: right; color: #444;';
        numDia.innerText = dia;
        celda.appendChild(numDia);

        if (planesGuardados[claveFecha] && planesGuardados[claveFecha].length > 0) {
            planesGuardados[claveFecha].forEach(plan => {
                const tag = document.createElement('div');
                const paleta = COLORES_MATERIAS[plan.materia] || COLORES_MATERIAS["Default"];
                
                tag.style.cssText = `
                    background: ${paleta.bg};
                    color: ${paleta.text};
                    border: 1px solid ${paleta.border};
                    border-radius: 3px;
                    padding: 2px 4px;
                    margin-top: 2px;
                    font-size: 0.7rem;
                    line-height: 1.1;
                    text-align: left;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;
                
                const horarioTexto = plan.horario ? `[${plan.horario}] ` : '';
                tag.title = `${plan.horario ? plan.horario + ' - ' : ''}${plan.materia}: ${plan.detalle} (${plan.tiempo} min)`;
                tag.innerHTML = `<strong>${horarioTexto}${plan.materia}</strong>`;
                celda.appendChild(tag);
            });
        }

        celda.addEventListener('click', () => {
            diaSeleccionadoStr = claveFecha;
            document.querySelectorAll('#grilla-calendario > div').forEach(c => c.style.borderColor = '#ddd');
            celda.style.borderColor = '#4caf50';
            mostrarPlanesDelDia(claveFecha, dia, NOMBRES_MESES[mes]);
        });

        grilla.appendChild(celda);
    }
}

function inicializarControlesCalendario() {
    document.getElementById('btn-mes-prev')?.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() - 1);
        renderizarCalendario();
    });

    document.getElementById('btn-mes-next')?.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() + 1);
        renderizarCalendario();
    });

    document.getElementById('btn-guardar-plan')?.addEventListener('click', () => {
        if (!diaSeleccionadoStr) return;

        const materia = document.getElementById('select-materia-plan').value;
        const categoria = document.getElementById('select-categoria-plan')?.value || 'Principal';
        const tiempoInput = document.getElementById('input-tiempo-plan');
        const detalleInput = document.getElementById('input-detalle-plan');
        
        // 1. Capturamos los dos inputs nuevos
        const horaInicioInput = document.getElementById('input-hora-inicio');
        const horaFinInput = document.getElementById('input-hora-fin');

        const tiempo = parseInt(tiempoInput.value) || 30;
        const detalle = detalleInput.value.trim() || 'Sin detalle';
        
        // 2. Armamos el texto del horario
        let horario = '';
        if (horaInicioInput && horaFinInput && horaInicioInput.value && horaFinInput.value) {
            horario = `${horaInicioInput.value} a ${horaFinInput.value}`;
        } else if (horaInicioInput && horaInicioInput.value) {
            horario = `Desde ${horaInicioInput.value}`;
        }

        if (!planesGuardados[diaSeleccionadoStr]) {
            planesGuardados[diaSeleccionadoStr] = [];
        }

        // 3. Guardamos
        planesGuardados[diaSeleccionadoStr].push({ materia, categoria, tiempo, detalle, horario });
        
        // 4. Ordenamos por horario para que queden prolijos
        planesGuardados[diaSeleccionadoStr].sort((a, b) => {
            if (!a.horario) return 1;
            if (!b.horario) return -1;
            return a.horario.localeCompare(b.horario);
        });

        localStorage.setItem('estudio_planes', JSON.stringify(planesGuardados));

        detalleInput.value = '';
        tiempoInput.value = '';
        if (horaInicioInput) horaInicioInput.value = '';
        if (horaFinInput) horaFinInput.value = '';

        const partes = diaSeleccionadoStr.split('-');
        mostrarPlanesDelDia(diaSeleccionadoStr, parseInt(partes[2]), NOMBRES_MESES[parseInt(partes[1]) - 1]);
        renderizarCalendario();
    });
}

function mostrarPlanesDelDia(claveFecha, dia, mesNombre) {
    const titulo = document.getElementById('titulo-dia-seleccionado');
    const lista = document.getElementById('lista-planes-dia');
    const form = document.getElementById('form-nuevo-plan');

    if (titulo) titulo.innerText = `Planes para el ${dia} de ${mesNombre}:`;
    if (form) form.style.display = 'flex';

    if (lista) {
        lista.innerHTML = '';
        const planes = planesGuardados[claveFecha] || [];

        if (planes.length === 0) {
            lista.innerHTML = '<p style="color:#777; font-size:0.9rem;">No hay tareas planificadas para hoy.</p>';
        } else {
            planes.forEach((plan, index) => {
                const paleta = COLORES_MATERIAS[plan.materia] || COLORES_MATERIAS["Default"];
                const item = document.createElement('div');
                
                item.style.cssText = `
                    margin: 8px 0;
                    padding: 10px;
                    background: #fff;
                    border-radius: 6px;
                    border-left: 5px solid ${paleta.text};
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                `;

                const horarioBadge = plan.horario 
                    ? `<span style="background: #eee; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">🕒 ${plan.horario}</span>` 
                    : '';

                item.innerHTML = `
                    <div>
                        <div style="font-weight: bold; color: ${paleta.text};">
                            📖 ${plan.materia} <span style="font-weight: normal; color: #666; font-size: 0.85rem;">(${plan.categoria || 'General'})</span>
                        </div>
                        <div style="margin-top: 4px; font-size: 0.95rem;">
                            ${horarioBadge}<strong>Detalle:</strong> ${plan.detalle} — ⏱ <strong>${plan.tiempo} min</strong>
                        </div>
                    </div>
                    <button class="btn-eliminar-plan" data-index="${index}" style="
                        background: #ff5252; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: 10px;
                    ">❌</button>
                `;

                item.querySelector('.btn-eliminar-plan').addEventListener('click', (e) => {
                    const idx = parseInt(e.target.getAttribute('data-index'));
                    eliminarPlan(claveFecha, idx, dia, mesNombre);
                });

                lista.appendChild(item);
            });
        }
    }
}

function eliminarPlan(claveFecha, index, dia, mesNombre) {
    if (planesGuardados[claveFecha]) {
        planesGuardados[claveFecha].splice(index, 1);
        if (planesGuardados[claveFecha].length === 0) {
            delete planesGuardados[claveFecha];
        }

        localStorage.setItem('estudio_planes', JSON.stringify(planesGuardados));
        mostrarPlanesDelDia(claveFecha, dia, mesNombre);
        renderizarCalendario();
    }
}

// ==========================================
// 5. LÓGICA DEL TEMPORIZADOR Y REGISTRO MANUAL
// ==========================================
const displayTiempo = document.getElementById('tiempo');

function actualizarDisplay() {
    const minutos = Math.floor(tiempoRestanteSegundos / 60);
    const segundos = tiempoRestanteSegundos % 60;
    if (displayTiempo) {
        displayTiempo.innerText = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }
}

function inicializarTemporizador() {
    document.getElementById('btn-iniciar')?.addEventListener('click', () => {
        if (enEjecucion) return;
        enEjecucion = true;
        temporizadorInterval = setInterval(() => {
            if (tiempoRestanteSegundos > 0) {
                tiempoRestanteSegundos--;
                actualizarDisplay();
            } else {
                clearInterval(temporizadorInterval);
                enEjecucion = false;
                alert('¡Tiempo completado!');
                
                const materiaSel = document.getElementById('select-materia').value;
                tiemposMaterias[materiaSel] = (tiemposMaterias[materiaSel] || 0) + 25;
                
                const hoyStr = new Date().toISOString().split('T')[0];
                historialSesiones.push({ fecha: hoyStr, materia: materiaSel, duracion: 25 });
                
                localStorage.setItem('estudio_tiempos', JSON.stringify(tiemposMaterias));
                localStorage.setItem('estudio_historial', JSON.stringify(historialSesiones));
                
                actualizarTiemposTarjetas();
                renderizarHistorialHoy();
                tiempoRestanteSegundos = 25 * 60;
                actualizarDisplay();
            }
        }, 1000);
    });

    document.getElementById('btn-pausar')?.addEventListener('click', () => {
        clearInterval(temporizadorInterval);
        enEjecucion = false;
    });

    document.getElementById('btn-reiniciar')?.addEventListener('click', () => {
        clearInterval(temporizadorInterval);
        enEjecucion = false;
        tiempoRestanteSegundos = 25 * 60;
        actualizarDisplay();
    });
}

function inicializarRegistroManual() {
    const btnGuardarManual = document.getElementById('btn-guardar-manual');
    if (btnGuardarManual) {
        btnGuardarManual.addEventListener('click', () => {
            const materiaSel = document.getElementById('select-materia-manual').value;
            const minutosInput = document.getElementById('input-minutos-manual').value;
            const minutosAgregados = parseInt(minutosInput);

            if (isNaN(minutosAgregados) || minutosAgregados <= 0) {
                alert("Por favor, ingresá una cantidad válida de minutos.");
                return;
            }

            tiemposMaterias[materiaSel] = (tiemposMaterias[materiaSel] || 0) + minutosAgregados;
            const hoyStr = new Date().toISOString().split('T')[0];
            historialSesiones.push({ fecha: hoyStr, materia: materiaSel, duracion: minutosAgregados });

            localStorage.setItem('estudio_tiempos', JSON.stringify(tiemposMaterias));
            localStorage.setItem('estudio_historial', JSON.stringify(historialSesiones));

            document.getElementById('input-minutos-manual').value = ''; 
            actualizarTiemposTarjetas();
            renderizarHistorialHoy();
            
            if (document.getElementById('pantalla-estadisticas').style.display === 'block') {
                actualizarMetricasYGraficos();
            }

            alert(`¡Se sumaron ${minutosAgregados} minutos a ${materiaSel} correctamente!`);
        });
    }

    // Botón rápido en la sección de inicio (si existe)
    const btnAgregarSesion = document.getElementById('btn-agregar');
    if (btnAgregarSesion) {
        btnAgregarSesion.addEventListener('click', () => {
            const materiaPrompt = prompt("¿A qué materia querés sumarle minutos? (Análisis, Física, Francés, Inglés, Python, Claude)");
            if (!materiaPrompt) return;

            if (tiemposMaterias[materiaPrompt] === undefined) {
                alert("Materia no válida.");
                return;
            }

            const minutosPrompt = prompt("Ingresá la cantidad de minutos estudiados:");
            const minutosAgregados = parseInt(minutosPrompt);

            if (isNaN(minutosAgregados) || minutosAgregados <= 0) {
                alert("Por favor, ingresá un número válido de minutos.");
                return;
            }

            tiemposMaterias[materiaPrompt] += minutosAgregados;
            const hoyStr = new Date().toISOString().split('T')[0];
            historialSesiones.push({ fecha: hoyStr, materia: materiaPrompt, duracion: minutosAgregados });

            localStorage.setItem('estudio_tiempos', JSON.stringify(tiemposMaterias));
            localStorage.setItem('estudio_historial', JSON.stringify(historialSesiones));

            actualizarTiemposTarjetas();
            renderizarHistorialHoy();
            alert(`¡Se sumaron ${minutosAgregados} minutos a ${materiaPrompt} con éxito!`);
        });
    }
}

// ==========================================
// 6. ESTADÍSTICAS Y CHART.JS
// ==========================================
function actualizarTiemposTarjetas() {
    document.querySelectorAll('.card').forEach(card => {
        const materia = card.getAttribute('data-materia');
        if (materia === "Clases Dictadas") {
            const pTiempo = card.querySelector('.tiempo-texto');
            if (pTiempo) pTiempo.innerText = `${horasClasesSemanales} hrs / semana`;
        } else if (materia && tiemposMaterias[materia] !== undefined) {
            const pTiempo = card.querySelector('.tiempo-texto');
            if (pTiempo) pTiempo.innerText = `${tiemposMaterias[materia]} min estudiados`;
        }
    });
}

function obtenerMinutosSemanaActual() {
    const minutosPorDia = [0, 0, 0, 0, 0, 0, 0];
    const hoy = new Date();
    const diaSemanaHoy = hoy.getDay();
    
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - diaSemanaHoy);

    historialSesiones.forEach(sesion => {
        const fechaSesion = new Date(sesion.fecha + 'T00:00:00');
        const diffDias = Math.floor((fechaSesion - inicioSemana) / (1000 * 60 * 60 * 24));

        if (diffDias >= 0 && diffDias < 7) {
            minutosPorDia[diffDias] += sesion.duracion;
        }
    });

    return minutosPorDia;
}

function actualizarMetricasYGraficos() {
    const materias = Object.keys(tiemposMaterias);
    const minutos = Object.values(tiemposMaterias);

    const totalMinutos = minutos.reduce((a, b) => a + b, 0);
    
    const statTotal = document.getElementById('stat-total');
    if (statTotal) {
        statTotal.innerText = `${totalMinutos} min`;
    }

    const statClases = document.getElementById('stat-clases');
    if (statClases) {
        statClases.innerText = `${horasClasesSemanales} hrs/sem`;
    }

    let materiaTop = "-";
    let maxMin = 0;
    for (const [mat, min] of Object.entries(tiemposMaterias)) {
        if (min > maxMin) {
            maxMin = min;
            materiaTop = mat;
        }
    }
    const statFav = document.getElementById('stat-favorita');
    if (statFav) statFav.innerText = materiaTop;

    const canvasMaterias = document.getElementById('chart-materias');
    if (canvasMaterias && typeof Chart !== 'undefined') {
        if (chartMateriasInstance) chartMateriasInstance.destroy();
        chartMateriasInstance = new Chart(canvasMaterias.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: materias,
                datasets: [{
                    data: minutos,
                    backgroundColor: ['#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4', '#e91e63'],
                    borderWidth: 2
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    const canvasSemanal = document.getElementById('chart-semanal');
    if (canvasSemanal && typeof Chart !== 'undefined') {
        if (chartSemanalInstance) chartSemanalInstance.destroy();
        const datosSemana = obtenerMinutosSemanaActual();

        chartSemanalInstance = new Chart(canvasSemanal.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
                datasets: [{
                    label: 'Minutos',
                    data: datosSemana,
                    backgroundColor: '#2196f3',
                    borderRadius: 5
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });
    }
}

// ==========================================
// 7. HISTORIAL DE SESIONES Y ELIMINACIÓN
// ==========================================
function renderizarHistorialHoy() {
    const lista = document.getElementById('lista-historial-hoy');
    if (!lista) return;
    lista.innerHTML = '';

    const hoyStr = new Date().toISOString().split('T')[0];

    for (let i = historialSesiones.length - 1; i >= 0; i--) {
        const sesion = historialSesiones[i];
        
        if (sesion.fecha === hoyStr) {
            const li = document.createElement('li');
            li.style.cssText = `
                display: flex; justify-content: space-between; align-items: center; 
                background: #fff; padding: 8px 12px; margin-bottom: 8px; 
                border-radius: 4px; border-left: 4px solid #2196f3; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            `;
            
            li.innerHTML = `
                <span style="font-size: 0.9rem;">
                    <strong>${sesion.materia}</strong>: ${sesion.duracion} min
                </span>
                <button class="btn-eliminar-sesion" data-index="${i}" style="background: #f8d6d6; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8rem; font-weight: bold;">
                    Borrar ❌
                </button>
            `;
            
            li.querySelector('.btn-eliminar-sesion').addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                eliminarSesion(idx);
            });
            
            lista.appendChild(li);
        }
    }

    if (lista.children.length === 0) {
        lista.innerHTML = '<li style="font-size: 0.85rem; color: #777;">No hay sesiones registradas hoy.</li>';
    }
}

function eliminarSesion(index) {
    const sesion = historialSesiones[index];
    if (!sesion) return;

    if (confirm(`¿Seguro que querés eliminar los ${sesion.duracion} min de ${sesion.materia}?`)) {
        tiemposMaterias[sesion.materia] = Math.max(0, (tiemposMaterias[sesion.materia] || 0) - sesion.duracion);
        historialSesiones.splice(index, 1);
        
        localStorage.setItem('estudio_tiempos', JSON.stringify(tiemposMaterias));
        localStorage.setItem('estudio_historial', JSON.stringify(historialSesiones));
        
        renderizarHistorialHoy();
        actualizarTiemposTarjetas();
        
        if (document.getElementById('pantalla-estadisticas').style.display === 'block') {
            actualizarMetricasYGraficos();
        }
    }
}

// ==========================================
// 8. INICIALIZACIÓN DE LA APP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarNavegacion();
    inicializarFormulariosTareas();
    inicializarControlesCalendario();
    inicializarTemporizador();
    inicializarRegistroManual();
    
    renderizarHistorialHoy();
    renderizarTareasMaterias();
    actualizarTiemposTarjetas();
    actualizarDisplay();
});