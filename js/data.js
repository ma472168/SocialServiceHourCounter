// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCD-A8ZoKMyu4_ZZhD5Vt5BZNG4xxwWT28",
    authDomain: "socialservicehourcounterapp.firebaseapp.com",
    projectId: "socialservicehourcounterapp",
    storageBucket: "socialservicehourcounterapp.firebasestorage.app",
    messagingSenderId: "588272545302",
    appId: "1:588272545302:web:03523e68c524985a900f37",
    measurementId: "G-MVSYDEM168"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Obtén una referencia a la Realtime Database
const database = firebase.database();

// =========================================================================
// Variables Globales y Referencias a Firebase
// =========================================================================

const registrosRef = database.ref('registros'); // Referencia al nodo 'registros' en Firebase
const configRef = database.ref('config');      // Referencia al nodo 'config' en Firebase

let todosLosRegistros = []; // Almacena los registros cargados de Firebase
let diasExcluidos = [];     // Días específicos a excluir
let excluirSabados = false;
let excluirDomingos = false;

// === Referencias a elementos del DOM para estadísticas ===
const horasRegistradasSpan = document.getElementById('horas-registradas');
const horasRestantesSpan = document.getElementById('horas-restantes');
const diasRegistradosSpan = document.getElementById('dias-registrados');
const promedioHorasSpan = document.getElementById('promedio-horas');
const diasValidosRestantesSpan = document.getElementById('dias-validos-restantes');
const porcentajeProgresoSpan = document.getElementById('porcentaje-progreso');
const barraProgresoDiv = document.getElementById('barra-progreso');
const promedioHorasTotalSpan = document.getElementById('promedio-horas-total'); // Nueva referencia

// Referencias para las gráficas
let horasChartInstance = null;
let diasSemanaChartInstance = null;
let promedioDiasSemanaChartInstance = null; // Nueva instancia para la nueva gráfica

// Referencia para la lista de recientes
const listaRecientesUL = document.getElementById('lista-recientes');

// Referencias para el buscador
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const clearSearchButton = document.getElementById('clear-search-button');
const searchResultsList = document.getElementById('search-results-list');

// Referencia para la lista de días con mayor consumo
const topDaysListUL = document.getElementById('top-days-list');

// =========================================================================
// Constantes de Periodo de Servicio Social (copiadas del main.html)
// =========================================================================
const HORAS_REQUERIDAS = 500;
const FECHA_INICIO_SERVICIO = new Date("2025-06-02T00:00:00");
const FECHA_FIN_SERVICIO = new Date("2025-11-30T23:59:59"); // Incluye todo el último día

// =========================================================================
// Funciones de utilidad (copiadas del main.html)
// =========================================================================

// Función para formatear fecha a YYYY-MM-DD
function formatoFechaISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Función para obtener fecha sin información de tiempo (inicio del día en UTC)
function fechaSinHoraUTC(dateString) {
    const date = new Date(dateString + 'T00:00:00Z');
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// =========================================================================
// Funciones para cargar datos desde Firebase
// =========================================================================

/**
 * Carga los datos (registros y configuración) desde Firebase.
 */
async function cargarDatosDesdeLaNube() {
    try {
        // Cargar registros
        const registrosSnapshot = await registrosRef.once('value');
        const registrosFirebase = registrosSnapshot.val() || {};
        let registrosArray = [];

        for (let key in registrosFirebase) {
            if (registrosFirebase.hasOwnProperty(key)) {
                registrosFirebase[key].firebaseKey = key; // Guarda la clave de Firebase
                registrosArray.push(registrosFirebase[key]);
            }
        }
        todosLosRegistros = registrosArray;

        // Cargar configuración
        const configSnapshot = await configRef.once('value');
        const configFirebase = configSnapshot.val() || {
            excluirSabados: false,
            excluirDomingos: false,
            diasExcluidos: []
        };

        excluirSabados = configFirebase.excluirSabados;
        excluirDomingos = configFirebase.excluirDomingos;
        diasExcluidos = configFirebase.diasExcluidos || [];

        console.log("Datos cargados desde Firebase:", {
            registros: todosLosRegistros,
            config: configFirebase
        });

        actualizarEstadisticasYGraficas(); // Actualiza la UI con los datos cargados
        performSearch(); // Actualiza el buscador con los datos cargados (inicialmente vacío)
    } catch (error) {
        console.error("❌ Error al cargar datos desde Firebase:", error);
        // No usar alert en esta página para evitar interrupciones visuales
        // Puedes mostrar un mensaje en la UI si lo deseas
    }
}

// =========================================================================
// Cálculos de Estadísticas y Renderizado de UI
// =========================================================================

function actualizarEstadisticasYGraficas() {
    let totalHoras = 0;
    const fechasUnicas = new Set();
    const horasPorDiaSemana = [0, 0, 0, 0, 0, 0, 0]; // Dom, Lun, Mar, Mié, Jue, Vie, Sáb
    const conteoDiasConRegistro = [0, 0, 0, 0, 0, 0, 0]; // Para el promedio de horas por día de la semana

    todosLosRegistros.forEach(registro => {
        const horas = parseFloat(registro.horas);
        totalHoras += horas;
        fechasUnicas.add(registro.fecha);

        // Calcular horas por día de la semana
        const fechaObj = new Date(registro.fecha + 'T00:00:00');
        const diaSemana = fechaObj.getDay(); // 0 = Domingo, 6 = Sábado
        horasPorDiaSemana[diaSemana] += horas;
        conteoDiasConRegistro[diaSemana]++; // Incrementar contador para el promedio
    });

    const hoy = fechaSinHoraUTC(formatoFechaISO(new Date()));

    // Horas registradas
    horasRegistradasSpan.textContent = totalHoras.toFixed(1);

    // Horas restantes
    const horasRestantes = Math.max(0, HORAS_REQUERIDAS - totalHoras);
    horasRestantesSpan.textContent = horasRestantes.toFixed(1);

    // Días registrados
    diasRegistradosSpan.textContent = fechasUnicas.size;

    // Promedio de horas/día (total entre todos los días registrados)
    const promedioGeneralPorDiaRegistrado = fechasUnicas.size > 0 ? (totalHoras / fechasUnicas.size) : 0;
    promedioHorasTotalSpan.textContent = promedioGeneralPorDiaRegistrado.toFixed(2);


    // Progreso
    const progreso = Math.min((totalHoras / HORAS_REQUERIDAS) * 100, 100);
    barraProgresoDiv.style.width = progreso + "%";
    barraProgresoDiv.textContent = progreso.toFixed(1) + "%";
    porcentajeProgresoSpan.textContent = progreso.toFixed(1) + "%";

    // Calcular días válidos restantes
    let diasValidosRestantesCount = 0;
    let cursorParaDiasValidos = new Date(Math.max(hoy.getTime(), FECHA_INICIO_SERVICIO.getTime()));

    if (hoy > FECHA_FIN_SERVICIO) {
        diasValidosRestantesCount = 0;
    } else {
        while (cursorParaDiasValidos <= FECHA_FIN_SERVICIO) {
            const fechaStr = formatoFechaISO(cursorParaDiasValidos);
            const diaSemana = cursorParaDiasValidos.getDay(); // 0 = Domingo, 6 = Sábado

            let esDiaLaborable = true;

            // Excluir si la fecha ya tiene registros (para no contar días ya cubiertos)
            if (fechasUnicas.has(fechaStr)) {
                esDiaLaborable = false;
            }

            if (excluirSabados && diaSemana === 6) { // Sábado
                esDiaLaborable = false;
            }
            if (excluirDomingos && diaSemana === 0) { // Domingo
                esDiaLaborable = false;
            }
            if (diasExcluidos.includes(fechaStr)) {
                esDiaLaborable = false;
            }

            if (esDiaLaborable) {
                diasValidosRestantesCount++;
            }
            cursorParaDiasValidos.setDate(cursorParaDiasValidos.getDate() + 1);
        }
    }
    diasValidosRestantesSpan.textContent = diasValidosRestantesCount;

    // Promedio de horas/día para cumplir el resto
    const promedioDiario = diasValidosRestantesCount > 0 ? (horasRestantes / diasValidosRestantesCount) : 0;
    promedioHorasSpan.textContent = promedioDiario.toFixed(2);

    // Renderizar gráficas
    renderizarGraficaHoras(totalHoras, horasRestantes);
    renderizarGraficaDiasSemana(horasPorDiaSemana);
    renderizarGraficaPromedioDiasSemana(horasPorDiaSemana, conteoDiasConRegistro); // Llama a la nueva función de gráfica

    // Renderizar registros recientes
    renderizarRegistrosRecientes();
    // Renderizar días con mayor consumo
    renderizarDiasConMayorConsumo();
    // Mantener el buscador actualizado con los nuevos datos si hay un término de búsqueda
    if (searchInput.value.trim() !== '') {
        performSearch();
    } else {
        // Si no hay búsqueda, limpiar la lista de resultados o mostrar el mensaje inicial
        searchResultsList.innerHTML = '<li class="empty-message">Escribe algo para empezar a buscar.</li>';
    }
}

// =========================================================================
// Funciones para Gráficas (Chart.js)
// =========================================================================

function renderizarGraficaHoras(totalHoras, horasRestantes) {
    const ctx = document.getElementById('horasChart').getContext('2d');

    if (horasChartInstance) {
        horasChartInstance.destroy(); // Destruir instancia anterior si existe
    }

    horasChartInstance = new Chart(ctx, {
        type: 'doughnut', // Gráfica de pastel/anillo
        data: {
            labels: ['Horas Registradas', 'Horas Restantes'],
            datasets: [{
                data: [totalHoras, horasRestantes],
                backgroundColor: ['#2ecc71', '#e74c3c'], // Verde para registradas, Rojo para restantes
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            size: 14
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (tooltipItem) {
                            return `${tooltipItem.label}: ${tooltipItem.raw.toFixed(1)} hrs`;
                        }
                    }
                }
            },
            cutout: '70%', // Para que sea una gráfica de anillo
        }
    });
}

function renderizarGraficaDiasSemana(horasPorDiaSemana) {
    const ctx = document.getElementById('diasSemanaChart').getContext('2d');
    const labels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    if (diasSemanaChartInstance) {
        diasSemanaChartInstance.destroy(); // Destruir instancia anterior si existe
    }

    diasSemanaChartInstance = new Chart(ctx, {
        type: 'bar', // Gráfica de barras
        data: {
            labels: labels,
            datasets: [{
                label: 'Horas Registradas por Día',
                data: horasPorDiaSemana,
                backgroundColor: [
                    'rgba(231, 76, 60, 0.7)', // Rojo (Domingo)
                    'rgba(52, 152, 219, 0.7)', // Azul (Lunes)
                    'rgba(46, 204, 113, 0.7)', // Verde (Martes)
                    'rgba(155, 89, 182, 0.7)', // Púrpura (Miércoles)
                    'rgba(241, 196, 15, 0.7)', // Amarillo (Jueves)
                    'rgba(230, 126, 34, 0.7)', // Naranja (Viernes)
                    'rgba(52, 73, 94, 0.7)' // Gris oscuro (Sábado)
                ],
                borderColor: [
                    'rgba(231, 76, 60, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(46, 204, 113, 1)',
                    'rgba(155, 89, 182, 1)',
                    'rgba(241, 196, 15, 1)',
                    'rgba(230, 126, 34, 1)',
                    'rgba(52, 73, 94, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Horas'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // No mostrar la leyenda de los datasets
                },
                tooltip: {
                    callbacks: {
                        label: function (tooltipItem) {
                            return `${tooltipItem.label}: ${tooltipItem.raw.toFixed(1)} hrs`;
                        }
                    }
                }
            }
        }
    });
}

// Nueva función para la gráfica de promedio por día de la semana
function renderizarGraficaPromedioDiasSemana(horasPorDiaSemana, conteoDiasConRegistro) {
    const ctx = document.getElementById('promedioDiasSemanaChart').getContext('2d');
    const labels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    // Calcular el promedio de horas para cada día de la semana
    const promedioHorasCalculado = horasPorDiaSemana.map((horas, index) => {
        return conteoDiasConRegistro[index] > 0 ? (horas / conteoDiasConRegistro[index]).toFixed(2) : 0;
    });

    if (promedioDiasSemanaChartInstance) {
        promedioDiasSemanaChartInstance.destroy();
    }

    promedioDiasSemanaChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio de Horas',
                data: promedioHorasCalculado,
                backgroundColor: [
                    'rgba(108, 92, 231, 0.7)', // Un tono púrpura
                    'rgba(85, 239, 196, 0.7)', // Verde menta
                    'rgba(0, 184, 148, 0.7)', // Turquesa
                    'rgba(0, 206, 201, 0.7)', // Azul claro
                    'rgba(129, 236, 236, 0.7)', // Cian
                    'rgba(253, 203, 110, 0.7)', // Amarillo pastel
                    'rgba(255, 127, 80, 0.7)' // Naranja coral
                ],
                borderColor: [
                    'rgba(108, 92, 231, 1)',
                    'rgba(85, 239, 196, 1)',
                    'rgba(0, 184, 148, 1)',
                    'rgba(0, 206, 201, 1)',
                    'rgba(129, 236, 236, 1)',
                    'rgba(253, 203, 110, 1)',
                    'rgba(255, 127, 80, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Horas Promedio'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (tooltipItem) {
                            return `${tooltipItem.label}: ${tooltipItem.raw} hrs`;
                        }
                    }
                }
            }
        }
    });
}


// =========================================================================
// Funciones para Registros Recientes
// =========================================================================
function renderizarRegistrosRecientes() {
    // Ordenar todos los registros por fecha (más reciente primero)
    const registrosOrdenados = [...todosLosRegistros].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Tomar solo los últimos N registros (N=3 en este caso)
    const ultimosRegistros = registrosOrdenados.slice(0, 3); // Cambia 3 por 2 si quieres solo 2

    listaRecientesUL.innerHTML = ""; // Limpiar la lista actual

    if (ultimosRegistros.length === 0) {
        listaRecientesUL.innerHTML = '<li class="empty-message">No hay registros recientes.</li>';
        return;
    }

    ultimosRegistros.forEach(registro => {
        const li = document.createElement("li");
        li.className = "recent-item";

        const fechaObj = new Date(registro.fecha + 'T00:00:00');
        const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
            weekday: 'short', // Lunes, Mar, etc.
            month: 'short', // Jun, Jul, etc.
            day: 'numeric' // 10, 12, etc.
        });

        li.innerHTML = `
                <div class="recent-details">
                    <div class="recent-date">${fechaFormateada}</div>
                    <div class="recent-note">${registro.nota || "Sin descripción"}</div>
                </div>
                <div class="recent-hours">${registro.horas.toFixed(1)} hrs</div>
            `;
        listaRecientesUL.appendChild(li);
    });
}

// =========================================================================
// Funciones para el Buscador
// =========================================================================
function performSearch() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    let resultados = [];

    if (searchTerm === '') {
        searchResultsList.innerHTML = '<li class="empty-message">Escribe algo para empezar a buscar.</li>';
        return;
    }

    resultados = todosLosRegistros.filter(registro => {
        const fecha = registro.fecha.toLowerCase();
        const horas = registro.horas.toString().toLowerCase(); // Convertir horas a string para buscar
        const nota = (registro.nota || '').toLowerCase(); // Asegurar que nota no sea null

        return fecha.includes(searchTerm) ||
            horas.includes(searchTerm) ||
            nota.includes(searchTerm);
    });

    // Ordenar resultados por fecha (más recientes primero)
    resultados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    renderSearchResults(resultados);
}

function renderSearchResults(results) {
    searchResultsList.innerHTML = ""; // Limpiar la lista actual

    if (results.length === 0) {
        searchResultsList.innerHTML = '<li class="empty-message">No se encontraron registros.</li>';
        return;
    }

    results.forEach(registro => {
        const li = document.createElement("li");
        li.className = "search-item"; // Usar una clase diferente si se quiere un estilo distinto

        const fechaObj = new Date(registro.fecha + 'T00:00:00');
        const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        li.innerHTML = `
                <div class="search-details">
                    <div class="search-date">${fechaFormateada}</div>
                    <div class="search-note">${registro.nota || "Sin descripción"}</div>
                </div>
                <div class="search-hours">${registro.horas.toFixed(1)} hrs</div>
            `;
        searchResultsList.appendChild(li);
    });
}

// =========================================================================
// Funciones para Días con Mayor Consumo
// =========================================================================
function renderizarDiasConMayorConsumo() {
    // Agrupar registros por fecha y sumar las horas por día
    const horasPorDia = {};
    
    todosLosRegistros.forEach(registro => {
        if (horasPorDia[registro.fecha]) {
            horasPorDia[registro.fecha] += parseFloat(registro.horas);
        } else {
            horasPorDia[registro.fecha] = parseFloat(registro.horas);
        }
    });

    // Convertir a array y ordenar por horas (mayor a menor)
    const diasOrdenados = Object.entries(horasPorDia)
        .map(([fecha, horas]) => ({ fecha, horas }))
        .sort((a, b) => b.horas - a.horas);

    // Tomar solo los primeros 5 días con más horas
    const topDias = diasOrdenados.slice(0, 5);

    topDaysListUL.innerHTML = ""; // Limpiar la lista actual

    if (topDias.length === 0) {
        topDaysListUL.innerHTML = '<li class="empty-message">No hay registros para mostrar.</li>';
        return;
    }

    topDias.forEach((dia, index) => {
        const li = document.createElement("li");
        li.className = "top-day-item";

        const fechaObj = new Date(dia.fecha + 'T00:00:00');
        const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
            weekday: 'long', // Lunes, Martes, etc.
            month: 'long', // Junio, Julio, etc.
            day: 'numeric' // 10, 12, etc.
        });

        // Obtener todas las notas de ese día
        const registrosDelDia = todosLosRegistros.filter(r => r.fecha === dia.fecha);
        const notas = registrosDelDia.map(r => r.nota).filter(n => n && n.trim() !== '');
        const notasTexto = notas.length > 0 ? notas.join(' | ') : "Sin descripción";

        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';

        li.innerHTML = `
            <div class="top-day-rank ${rankClass}">${index + 1}</div>
            <div class="top-day-details">
                <div class="top-day-date">${fechaFormateada}</div>
                <div class="top-day-note">${notasTexto}</div>
            </div>
            <div class="top-day-hours">${dia.horas.toFixed(1)} hrs</div>
        `;
        topDaysListUL.appendChild(li);
    });
}

// =========================================================================
// Event Listeners para el Buscador
// =========================================================================
searchInput.addEventListener('input', performSearch); // Búsqueda en tiempo real al escribir
searchButton.addEventListener('click', performSearch); // Búsqueda al hacer clic en el botón

clearSearchButton.addEventListener('click', () => {
    searchInput.value = ''; // Limpiar el input
    searchResultsList.innerHTML = '<li class="empty-message">Escribe algo para empezar a buscar.</li>'; // Restaurar mensaje
    // performSearch(); // Opcional: si quieres que se ejecute la búsqueda vacía para resetear
});


// =========================================================================
// Inicialización
// =========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    // Asegurarse de que las tarjetas estén activas
    document.getElementById('stats-card').classList.add('active');
    document.getElementById('charts-card').classList.add('active');
    document.getElementById('recent-records-card').classList.add('active');
    document.getElementById('search-card').classList.add('active'); // Activar la nueva tarjeta de búsqueda

    // Cargar datos y actualizar la vista cuando la página se carga
    await cargarDatosDesdeLaNube();

    // Configurar listener para que la UI se actualice si los datos cambian en Firebase
    registrosRef.on('value', (snapshot) => {
        const registrosFirebase = snapshot.val() || {};
        let registrosArray = [];
        for (let key in registrosFirebase) {
            if (registrosFirebase.hasOwnProperty(key)) {
                registrosFirebase[key].firebaseKey = key;
                registrosArray.push(registrosFirebase[key]);
            }
        }
        todosLosRegistros = registrosArray;
        actualizarEstadisticasYGraficas();
        // performSearch() se llamará dentro de actualizarEstadisticasYGraficas si hay un término
    });

    configRef.on('value', (snapshot) => {
        const configFirebase = snapshot.val() || {
            excluirSabados: false,
            excluirDomingos: false,
            diasExcluidos: []
        };
        excluirSabados = configFirebase.excluirSabados;
        excluirDomingos = configFirebase.excluirDomingos;
        diasExcluidos = configFirebase.diasExcluidos || [];
        actualizarEstadisticasYGraficas();
    });
});