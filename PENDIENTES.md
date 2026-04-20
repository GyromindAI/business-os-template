# Plan de Configuración — Business OS

Este archivo detalla los pasos pendientes para que el sistema esté 100% operativo. El proyecto utiliza una arquitectura de monorepo con tres componentes: Mission Control, Agent Server y Finance OS.

## 📋 Checklist de Configuración

### 1. Dependencias (Node.js)
Falta ejecutar la instalación en cada subdirectorio.
- [ ] **Mission-Control:** `cd Mission-Control && npm install`
- [ ] **Agent-Server:** `cd agent-server && npm install`
- [ ] **Finance-OS:** `cd finance-os && npm install`

### 2. Variables de Entorno (.env)
Es necesario crear los archivos `.env` basados en los archivos `.env.example`.

#### Mission Control (`Mission-Control/.env.local`)
- [ ] Configurar URL y Keys de Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] Definir `ALLOWED_EMAILS` (correo del usuario).
- [ ] Definir `OPENCLAW_GATEWAY_TOKEN` (shared secret con Agent Server).

#### Agent Server (`agent-server/.env`)
- [ ] Configurar `TELEGRAM_BOT_TOKEN` (vía @BotFather).
- [ ] Configurar `ALLOWED_CHAT_ID` (ID numérico de Telegram).
- [ ] Configurar `MISSION_CONTROL_TOKEN` (debe coincidir con MC).

#### Finance OS (`finance-os/.env.local`)
- [ ] Configurar credenciales de Supabase (pueden ser las mismas de MC).

### 3. Base de Datos (Supabase)
- [ ] Crear proyecto en Supabase.
- [ ] Ejecutar el schema SQL de **Mission Control** (ver `docs/SETUP_PROMPT.md` líneas 215-467).
- [ ] Ejecutar el schema SQL de **Finance OS** (ver `docs/SETUP_PROMPT.md` líneas 473-564).
- [ ] Configurar Redirect URLs en Supabase Auth (`http://localhost:3000`).

### 4. Verificación Final
- [ ] Ejecutar `cd agent-server && npm run build` para verificar tipos.
- [ ] Ejecutar `cd Mission-Control && npm run build` para verificar tipos.
- [ ] Iniciar servicios: `npm run dev` en cada carpeta.

---

**Nota para el siguiente agente:** El usuario ha clonado el repositorio recientemente. Se ha verificado que los repositorios de `daniel-carreon` y `darcgit888` son efectivamente el mismo proyecto, siendo este último la versión activa. No se han realizado cambios en el código aún, solo análisis de archivos.
