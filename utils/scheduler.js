export function calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, esNuevaCreacion = false) {
    const ahoraUTC = new Date();
    const ahora = new Date(ahoraUTC.getTime() - (3 * 60 * 60 * 1000));
    let proxima = new Date(ahora);

    const horaSegura = hora_programada || '00:00';
    const [horas, minutos] = horaSegura.split(':');

    if (frecuencia === 'Fecha Unica' && fecha_unica) {
        return `${fecha_unica}T${horas}:${minutos}:00-03:00`;
    }

    proxima.setUTCHours(parseInt(horas), parseInt(minutos), 0, 0);

    const diasArray = Array.isArray(dias_especificos) ? dias_especificos.map(Number) : [];

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
            if (frecuencia === 'Semanal') proxima.setUTCDate(proxima.getUTCDate() + 7);
            if (frecuencia === 'Mensual') proxima.setUTCMonth(proxima.getUTCMonth() + 1);
        }
    }

    const anio = proxima.getUTCFullYear();
    const mes = String(proxima.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(proxima.getUTCDate()).padStart(2, '0');

    return `${anio}-${mes}-${dia}T${horas}:${minutos}:00-03:00`;
}
