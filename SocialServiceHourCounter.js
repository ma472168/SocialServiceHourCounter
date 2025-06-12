// =========================================================================
// Variables Globales y Referencias a Firebase
// La variable 'database' se inicializa en index.html y es globalmente accesible aquí.
// =========================================================================
// Asegúrate de que 'database' exista. Si este script se ejecuta antes de que
// Firebase se inicialice en el HTML, podrías tener un problema.
// Por eso, es mejor que <script src="SocialServiceHourCounter.js"></script>
// esté después del bloque de inicialización de Firebase en index.html.

const registrosRef = database.ref('registros'); // Referencia al nodo 'registros' en Firebase
const configRef = database.ref('config');     // Referencia al nodo 'config' en Firebase

let todosLosRegistros = []; // Almacena los registros cargados de Firebase
let diasExcluidos = [];
let excluirSabados = false;
let excluirDomingos = false;

// === Referencias a elementos del DOM ===
const fechaInput = document.getElementById('fecha');
const horasInput = document.getElementById('horas');
const notaInput = document.getElementById('nota');
const agregarHorasBtn = document.getElementById('agregarHorasBtn');
const horasTableBody = document.querySelector('#horasTable tbody');
const totalHorasSpan = document.getElementById('totalHoras');
const diasLaborablesEstimadosSpan = document.getElementById('diasLaborablesEstimados');

const excluirSabadosCheckbox = document.getElementById('excluirSabados');
const excluirDomingosCheckbox = document.getElementById('excluirDomingos');
const diasExcluidosInput = document.getElementById('diasExcluidosInput');
const guardarConfigBtn = document.getElementById('guardarConfigBtn');

const filtroFechaInicio = document.getElementById('filtroFechaInicio');
const filtroFechaFin = document.getElementById('filtroFechaFin');
const aplicarFiltroBtn = document.getElementById('aplicarFiltroBtn');
const limpiarFiltroBtn = document.getElementById('limpiarFiltroBtn');

// === Funciones para Firebase ===

/**
 * Carga los datos (registros y configuración) desde Firebase.
 * @returns {Object} Un objeto con registros, días excluidos y configuración.
 */
async function cargarDatosDesdeLaNube() {
    try {
        // Cargar registros
        const registrosSnapshot = await registrosRef.once('value');
        const registrosFirebase = registrosSnapshot.val() || {}; // Obtiene los datos como un objeto
        let registrosArray = [];

        // Firebase Realtime Database almacena arrays como objetos con claves únicas
        // (generadas por .push() o si lo guardas como objeto)
        // o con claves numéricas si usas .set() con un array.
        // Necesitamos convertir el objeto a un array de objetos consistente.
        for (let key in registrosFirebase) {
            if (registrosFirebase.hasOwnProperty(key)) {
                // Asigna la clave de Firebase a cada registro para poder eliminar/editar después
                registrosFirebase[key].firebaseKey = key;
                registrosArray.push(registrosFirebase[key]);
            }
        }
        
        // Cargar configuración
        const configSnapshot = await configRef.once('value');
        const configFirebase = configSnapshot.val() || {
            excluirSabados: false,
            excluirDomingos: false,
            diasExcluidos: []
        };

        const datosCargados = {
            registros: registrosArray,
            diasExcluidos: configFirebase.diasExcluidos || [],
            excluirSabados: configFirebase.excluirSabados || false,
            excluirDomingos: configFirebase.excluirDomingos || false
        };

        console.log("Datos cargados desde Firebase:", datosCargados);
        return datosCargados;

    } catch (error) {
        console.error("❌ Error al cargar datos desde Firebase:", error);
        alert("Error al cargar datos. Revisa la consola para más detalles.");
        // Devuelve una estructura vacía para que la app no falle
        return {
            registros: [],
            diasExcluidos: [],
            excluirSabados: false,
            excluirDomingos: false
        };
    }
}

/**
 * Guarda todos los datos (registros y configuración) en Firebase.
 * @param {Object} datos - Objeto con registros, días excluidos y configuración a guardar.
 * @returns {boolean} True si se guardó con éxito, false en caso contrario.
 */
async function guardarDatosEnLaNube(datos) {
    try {
        const { registros, diasExcluidos, excluirSabados, excluirDomingos } = datos;

        // Para guardar registros, podemos enviarlos como un objeto donde la clave es firebaseKey
        // Esto facilita la actualización y eliminación.
        const registrosObjeto = {};
        registros.forEach(registro => {
            // Usa la clave existente si hay una, o genera una nueva si es un registro nuevo
            const key = registro.firebaseKey || registrosRef.push().key; 
            registrosObjeto[key] = {
                fecha: registro.fecha,
                horas: registro.horas,
                nota: registro.nota
            };
        });

        // Firebase permite .set(null) para eliminar un nodo.
        // Si el array de registros está vacío, eliminamos el nodo 'registros'.
        await registrosRef.set(Object.keys(registrosObjeto).length ? registrosObjeto : null);

        // Guardar configuración en su propio nodo
        await configRef.set({
            diasExcluidos: diasExcluidos,
            excluirSabados: excluirSabados,
            excluirDomingos: excluirDomingos
        });

        console.log("✅ Datos guardados en Firebase correctamente.");
        return true;

    } catch (error) {
        console.error("❌ Error al guardar datos en Firebase:", error);
        alert("Error al guardar datos. Revisa la consola para más detalles.");
        return false;
    }
}

// === Lógica de la Aplicación ===

/**
 * Calcula el total de horas filtradas.
 * @param {Array} registros - Registros a considerar para el cálculo.
 * @returns {number} Total de horas.
 */
function calcularTotalHoras(registros) {
    return registros.reduce((total, registro) => total + parseFloat(registro.horas), 0);
}

/**
 * Calcula los días laborables estimados dentro de un rango de fechas.
 * @param {string} fechaInicioStr - Fecha de inicio (YYYY-MM-DD).
 * @param {string} fechaFinStr - Fecha de fin (YYYY-MM-DD).
 * @returns {number} Número de días laborables estimados.
 */
function calcularDiasLaborablesEstimados(fechaInicioStr, fechaFinStr) {
    if (!fechaInicioStr || !fechaFinStr) {
        return 0;
    }

    const fechaInicio = new Date(fechaInicioStr + 'T00:00:00'); // Asegura zona horaria para consistencia
    const fechaFin = new Date(fechaFinStr + 'T00:00:00');

    let dias = 0;
    for (let d = new Date(fechaInicio); d <= fechaFin; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.getDay(); // 0 = Domingo, 6 = Sábado
        const fechaActualStr = d.toISOString().slice(0, 10); // Formato YYYY-MM-DD

        let esDiaLaborable = true;

        if (excluirSabados && diaSemana === 6) { // Sábado
            esDiaLaborable = false;
        }
        if (excluirDomingos && diaSemana === 0) { // Domingo
            esDiaLaborable = false;
        }
        if (diasExcluidos.includes(fechaActualStr)) {
            esDiaLaborable = false;
        }

        if (esDiaLaborable) {
            dias++;
        }
    }
    return dias;
}

/**
 * Renderiza la tabla de registros y actualiza los totales.
 * @param {Array} registrosARenderizar - Registros filtrados o todos.
 */
function renderizarTabla(registrosARenderizar) {
    horasTableBody.innerHTML = '';
    registrosARenderizar.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // Ordenar por fecha

    registrosARenderizar.forEach((registro, index) => {
        const row = horasTableBody.insertRow();
        row.insertCell(0).textContent = registro.fecha;
        row.insertCell(1).textContent = parseFloat(registro.horas).toFixed(1);
        row.insertCell(2).textContent = registro.nota;

        const accionesCell = row.insertCell(3);
        accionesCell.className = 'action-buttons';

        const editarBtn = document.createElement('button');
        editarBtn.textContent = 'Editar';
        editarBtn.className = 'edit-btn';
        editarBtn.onclick = () => editarRegistro(registro.firebaseKey); // Usar firebaseKey para identificar
        accionesCell.appendChild(editarBtn);

        const eliminarBtn = document.createElement('button');
        eliminarBtn.textContent = 'Eliminar';
        eliminarBtn.onclick = () => eliminarRegistro(registro.firebaseKey); // Usar firebaseKey para identificar
        accionesCell.appendChild(eliminarBtn);
    });

    const totalHoras = calcularTotalHoras(registrosARenderizar);
    totalHorasSpan.textContent = totalHoras.toFixed(1);

    const diasLaborables = calcularDiasLaborablesEstimados(
        filtroFechaInicio.value || (registrosARenderizar.length ? registrosARenderizar[0].fecha : ''),
        filtroFechaFin.value || (registrosARenderizar.length ? registrosARenderizar[registrosARenderizar.length - 1].fecha : '')
    );
    diasLaborablesEstimadosSpan.textContent = diasLaborables;
}

/**
 * Añade un nuevo registro de horas.
 */
async function agregarHoras() {
    const fecha = fechaInput.value;
    const horas = parseFloat(horasInput.value);
    const nota = notaInput.value.trim();

    if (!fecha || isNaN(horas) || horas <= 0) {
        alert('Por favor, ingresa una fecha y horas válidas.');
        return;
    }

    const nuevoRegistro = { fecha, horas, nota };
    
    // Añade el registro directamente a Firebase usando .push() para una clave única
    try {
        const newRef = await registrosRef.push(nuevoRegistro);
        nuevoRegistro.firebaseKey = newRef.key; // Guarda la clave generada por Firebase
        todosLosRegistros.push(nuevoRegistro); // Añade al array local
        
        limpiarFormulario();
        renderizarTabla(todosLosRegistros); // Renderiza con todos los registros
        aplicarFiltro(); // Aplica el filtro si está activo
        alert('Horas agregadas exitosamente.');
    } catch (error) {
        console.error("Error al añadir horas a Firebase:", error);
        alert("No se pudieron agregar las horas. Revisa la consola.");
    }
}

/**
 * Edita un registro existente.
 * @param {string} firebaseKey - La clave de Firebase del registro a editar.
 */
function editarRegistro(firebaseKey) {
    const registroAEditar = todosLosRegistros.find(r => r.firebaseKey === firebaseKey);
    if (!registroAEditar) return;

    fechaInput.value = registroAEditar.fecha;
    horasInput.value = registroAEditar.horas;
    notaInput.value = registroAEditar.nota;

    // Cambiar el botón para 'Guardar Cambios' y su acción
    agregarHorasBtn.textContent = 'Guardar Cambios';
    agregarHorasBtn.onclick = async () => {
        const fecha = fechaInput.value;
        const horas = parseFloat(horasInput.value);
        const nota = notaInput.value.trim();

        if (!fecha || isNaN(horas) || horas <= 0) {
            alert('Por favor, ingresa una fecha y horas válidas.');
            return;
        }

        // Actualizar el registro en el array local
        const index = todosLosRegistros.findIndex(r => r.firebaseKey === firebaseKey);
        if (index !== -1) {
            todosLosRegistros[index] = { ...todosLosRegistros[index], fecha, horas, nota };
        }

        // Actualizar en Firebase
        try {
            await registrosRef.child(firebaseKey).update({ fecha, horas, nota });
            alert('Registro actualizado exitosamente.');
            limpiarFormulario();
            // Restaurar botón y evento
            agregarHorasBtn.textContent = 'Agregar Horas';
            agregarHorasBtn.onclick = agregarHoras;
            renderizarTabla(todosLosRegistros); // Re-renderizar la tabla
            aplicarFiltro(); // Re-aplicar el filtro
        } catch (error) {
            console.error("Error al actualizar registro en Firebase:", error);
            alert("No se pudo actualizar el registro. Revisa la consola.");
        }
    };
}


/**
 * Elimina un registro de horas.
 * @param {string} firebaseKey - La clave de Firebase del registro a eliminar.
 */
async function eliminarRegistro(firebaseKey) {
    if (!confirm('¿Estás seguro de que quieres eliminar este registro?')) {
        return;
    }
    
    try {
        await registrosRef.child(firebaseKey).remove(); // Elimina de Firebase
        todosLosRegistros = todosLosRegistros.filter(r => r.firebaseKey !== firebaseKey); // Elimina del array local
        renderizarTabla(todosLosRegistros);
        aplicarFiltro(); // Re-aplica el filtro
        alert('Registro eliminado exitosamente.');
    } catch (error) {
        console.error("Error al eliminar registro de Firebase:", error);
        alert("No se pudo eliminar el registro. Revisa la consola.");
    }
}

/**
 * Limpia los campos del formulario de entrada de horas.
 */
function limpiarFormulario() {
    fechaInput.value = '';
    horasInput.value = '';
    notaInput.value = '';
}

/**
 * Guarda la configuración global (días excluidos, etc.).
 */
async function guardarConfiguracion() {
    excluirSabados = excluirSabadosCheckbox.checked;
    excluirDomingos = excluirDomingosCheckbox.checked;
    diasExcluidos = diasExcluidosInput.value.split(',').map(d => d.trim()).filter(d => d);

    const configGuardar = {
        excluirSabados,
        excluirDomingos,
        diasExcluidos
    };

    const exito = await guardarDatosEnLaNube({
        registros: todosLosRegistros, // Necesitamos pasar todos los registros para que se guarden también si el método lo requiere
        ...configGuardar
    });

    if (exito) {
        alert('Configuración guardada exitosamente.');
        // Re-renderizar para aplicar la nueva configuración a los cálculos
        aplicarFiltro();
    }
}

/**
 * Carga la configuración al iniciar la app.
 * @param {Object} config - El objeto de configuración cargado desde Firebase.
 */
function cargarConfiguracionInicial(config) {
    excluirSabados = config.excluirSabados;
    excluirDomingos = config.excluirDomingos;
    diasExcluidos = config.diasExcluidos;

    excluirSabadosCheckbox.checked = excluirSabados;
    excluirDomingosCheckbox.checked = excluirDomingos;
    diasExcluidosInput.value = diasExcluidos.join(', ');
}

/**
 * Aplica los filtros de fecha a los registros.
 */
function aplicarFiltro() {
    const inicio = filtroFechaInicio.value;
    const fin = filtroFechaFin.value;

    let registrosFiltrados = todosLosRegistros;

    if (inicio) {
        registrosFiltrados = registrosFiltrados.filter(r => r.fecha >= inicio);
    }
    if (fin) {
        registrosFiltrados = registrosFiltrados.filter(r => r.fecha <= fin);
    }

    renderizarTabla(registrosFiltrados);
}

/**
 * Limpia los filtros de fecha.
 */
function limpiarFiltro() {
    filtroFechaInicio.value = '';
    filtroFechaFin.value = '';
    renderizarTabla(todosLosRegistros); // Muestra todos los registros
}

// === Event Listeners ===
document.addEventListener('DOMContentLoaded', async () => {
    const datosCargados = await cargarDatosDesdeLaNube();
    todosLosRegistros = datosCargados.registros;
    cargarConfiguracionInicial(datosCargados);
    renderizarTabla(todosLosRegistros);

    // Si la tabla está vacía o el filtro de fecha de inicio no tiene valor,
    // establece la fecha actual como la fecha por defecto para agregar horas
    if (!fechaInput.value) {
        fechaInput.value = new Date().toISOString().slice(0, 10);
    }
});

agregarHorasBtn.addEventListener('click', agregarHoras);
guardarConfigBtn.addEventListener('click', guardarConfiguracion);
aplicarFiltroBtn.addEventListener('click', aplicarFiltro);
limpiarFiltroBtn.addEventListener('click', limpiarFiltro);