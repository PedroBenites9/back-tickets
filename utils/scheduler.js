export function calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, esNuevaCreacion = false) {
    const ahoraUTC = new Date();
    // Ajuste a la zona horaria local (-3 horas para Argentina)
    const ahora = new Date(ahoraUTC.getTime() - (3 * 60 * 60 * 1000));
    let proxima = new Date(ahora);

    const horaSegura = hora_programada || '00:00';
    const [horas, minutos] = horaSegura.split(':');

    if (frecuencia === 'Fecha Unica' && fecha_unica) {
        return `${fecha_unica} ${horas}:${minutos}:00`;
    }

    proxima.setUTCHours(parseInt(horas), parseInt(minutos), 0, 0);


    let diasProcesados = dias_especificos;
    if (typeof dias_especificos === 'string') {
        try {
            diasProcesados = JSON.parse(dias_especificos);
        } catch (e) {
            diasProcesados = [];
        }
    }
    const diasArray = Array.isArray(diasProcesados) ? diasProcesados.map(Number) : [];

    if (frecuencia === 'Dias Especificos' && diasArray.length > 0) {
        const hoy = ahora.getUTCDay();
        const diasOrdenados = [...diasArray].sort((a, b) => a - b);

        let proximoDia;
        if (esNuevaCreacion) {
            proximoDia = diasOrdenados.find(d => d > hoy || (d === hoy && proxima > ahora));
        } else {
            proximoDia = diasOrdenados.find(d => d > hoy);
        }

        let diasASumar = 0;
        if (proximoDia !== undefined) {
            diasASumar = proximoDia - hoy;
        } else {
            diasASumar = (7 - hoy) + diasOrdenados[0];
        }
        proxima.setUTCDate(proxima.getUTCDate() + diasASumar);

    } else {
        if (esNuevaCreacion) {
            if (proxima <= ahora) proxima.setUTCDate(proxima.getUTCDate() + 1);
        } else {
            if (frecuencia === 'Diaria') proxima.setUTCDate(proxima.getUTCDate() + 1);
            else if (frecuencia === 'Semanal') proxima.setUTCDate(proxima.getUTCDate() + 7);
            else if (frecuencia === 'Mensual') proxima.setUTCMonth(proxima.getUTCMonth() + 1);
            else if (frecuencia === 'Bimestral') proxima.setUTCMonth(proxima.getUTCMonth() + 2);
            else if (frecuencia === 'Trimestral') proxima.setUTCMonth(proxima.getUTCMonth() + 3);
            else if (frecuencia === 'Semestral') proxima.setUTCMonth(proxima.getUTCMonth() + 6);
            else if (frecuencia === 'Anual') proxima.setUTCFullYear(proxima.getUTCFullYear() + 1);
            else {
                console.warn(`⚠️ Frecuencia desconocida: "${frecuencia}". Se sumó 1 día por defecto.`);
                proxima.setUTCDate(proxima.getUTCDate() + 1);
            }

        }
    }

    const anio = proxima.getUTCFullYear();
    const mes = String(proxima.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(proxima.getUTCDate()).padStart(2, '0');

    return `${anio}-${mes}-${dia} ${horas}:${minutos}:00`;
}