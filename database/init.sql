-- ==============================================================================
-- 1. CONFIGURACIÓN INICIAL Y CODIFICACIÓN PARA EMOJIS
-- ==============================================================================
CREATE DATABASE IF NOT EXISTS sistema_tickets 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE sistema_tickets;

-- ==============================================================================
-- 2. LIMPIEZA PREVIA (Drop en orden inverso a las dependencias)
-- ==============================================================================
DROP TABLE IF EXISTS comentarios;
DROP TABLE IF EXISTS historial_tareas;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS tareas_diarias;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS categorias_rutinas;
DROP TABLE IF EXISTS frecuencias_permitidas;
DROP TABLE IF EXISTS vistas_tareas;

-- ==============================================================================
-- 3. TABLAS MAESTRAS (Configuración Dinámica)
-- ==============================================================================

-- Tabla de Áreas de la Empresa
CREATE TABLE areas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    activa TINYINT(1) DEFAULT 1
);

-- Tabla de Categorías para el Mantenimiento
CREATE TABLE categorias_rutinas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activa TINYINT(1) DEFAULT 1
);

-- Tabla de Frecuencias de Ejecución
CREATE TABLE frecuencias_permitidas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre_mostrar VARCHAR(100) NOT NULL,
    activa TINYINT(1) DEFAULT 1
);

-- ==============================================================================
-- 4. TABLAS PRINCIPALES (Entidades)
-- ==============================================================================

-- Tabla de Usuarios del Sistema
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rol VARCHAR(50) DEFAULT 'final',
    area VARCHAR(100),
    codigo_recuperacion VARCHAR(6),
    vencimiento_codigo DATETIME,
    status INT DEFAULT 1,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Clientes Externos
CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    email VARCHAR(150),
    telefono VARCHAR(50),
    direccion VARCHAR(255),
    status INT DEFAULT 1,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Tickets de Soporte
CREATE TABLE tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE,
    asunto VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    prioridad VARCHAR(50) NOT NULL,
    estado VARCHAR(50) DEFAULT 'Abierto',
    descripcion TEXT,
    tipo_origen VARCHAR(50) DEFAULT 'Interno',
    solicitante VARCHAR(100),
    cliente VARCHAR(150),
    tecnico_asignado VARCHAR(100),
    status INT DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_finalizado TIMESTAMP NULL
);

-- Tabla de Tareas Diarias / Mantenimiento Preventivo
CREATE TABLE tareas_diarias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(100) NOT NULL,
    frecuencia VARCHAR(50) NOT NULL,
    hora_programada VARCHAR(10) NOT NULL,
    proxima_ejecucion DATETIME,
    dias_especificos JSON,
    fecha_unica DATE,
    estado VARCHAR(50) DEFAULT 'Pendiente',
    en_pausa BOOLEAN DEFAULT FALSE,
    fecha_inicio_real DATETIME,
    tiempo_acumulado_minutos FLOAT DEFAULT 0,
    hora_primer_inicio DATETIME,
    status INT DEFAULT 1,
    ultima_vez_completada DATETIME,
    usuario_asignado VARCHAR(100) DEFAULT NULL
);

-- Tabla para registrar qué usuario ya vio una tarea (Para notificaciones/globito rojo)
CREATE TABLE vistas_tareas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tarea_id INT NOT NULL,
    nombre_usuario VARCHAR(100) NOT NULL,
    fecha_vista TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vista_notificacion FOREIGN KEY (tarea_id) 
        REFERENCES tareas_diarias(id) ON DELETE CASCADE
);

-- ==============================================================================
-- 5. TABLAS RELACIONALES (Hijas con Foreign Keys)
-- ==============================================================================

-- Tabla de Comentarios de Tickets
CREATE TABLE comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    autor VARCHAR(100) NOT NULL,
    mensaje TEXT NOT NULL,
    status INT DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ticket_comentario FOREIGN KEY (ticket_id) 
        REFERENCES tickets(id) ON DELETE CASCADE
);

-- Tabla de Historial de Ejecución de Tareas
CREATE TABLE historial_tareas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tarea_id INT NOT NULL,
    titulo_tarea VARCHAR(255) NOT NULL,
    instrucciones_tarea TEXT,
    usuario_que_completo VARCHAR(100),
    tiempo_total_minutos FLOAT DEFAULT 0,
    fecha_inicio DATETIME,
    status INT DEFAULT 1,
    fecha_completada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    comentario TEXT,
    archivo_adjunto TEXT,
    CONSTRAINT fk_tarea_historial FOREIGN KEY (tarea_id) 
        REFERENCES tareas_diarias(id) ON DELETE CASCADE
);

-- ==============================================================================
-- 6. CARGA DE DATOS INICIALES (Configuración del Sistema)
-- ==============================================================================

-- Áreas Organizacionales
INSERT IGNORE INTO areas (codigo, nombre) VALUES 
('Tesoreria', 'Tesorería'),
('Sindico', 'Síndico'),
('Operaciones', 'Operaciones'),
('Comercial', 'Comercial'),
('Logistica', 'Logística'),
('RRHH', 'RRHH'),
('Incorporaciones', 'Incorporaciones'),
('Habilitaciones', 'Habilitaciones'),
('Tecnologia', 'Tecnología (IT)'),
('Presidencia', 'Presidencia'),
('CoordinadorGral', 'Coordinador Gral.');

-- Categorías con Emojis para la Interfaz
INSERT IGNORE INTO categorias_rutinas (nombre) VALUES 
('🧹 Limpieza / General'), 
('📹 CCTV y Servidores'), 
('🌐 Redes'), 
('📊 Reportes'),
('🚨 Alarmas'),
('⚡ Cercos eléctricos'),
('🔐 Sistemas de Acceso'),
('⚙️ Procesos');

-- Frecuencias con Emojis y Lógica
INSERT IGNORE INTO frecuencias_permitidas (codigo, nombre_mostrar) VALUES 
('Diaria', '🔄 Todos los días'),
('Semanal', '📆 Una vez por semana'),
('Quincenal', '📆 Cada 15 días'),
('Mensual', '📅 Una vez al mes'),
('Bimestral', '🗓️ Cada 2 meses'),
('Trimestral', '📊 Cada 3 meses'),
('Semestral', '⏳ Cada 6 meses'),
('Anual', '🌍 Una vez al año'),
('Dias Especificos', '📅 Días Específicos'),
('Fecha Unica', '🎯 Fecha Única');