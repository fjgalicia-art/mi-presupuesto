# Mi Presupuesto

Asistente de presupuesto personal para **iPhone y Android** (se instala desde el navegador, sin tiendas de apps). Responde una sola pregunta, sin hojas de Excel: **¿cuánto puedo gastar hoy?**

## Qué hace

- **Bienvenida guiada**: nombre, tipo de ingreso (sueldo fijo o variable), cada cuánto (mensual o quincenal y sus días), pagos fijos, meta de ahorro y tarjetas. Todo se puede cambiar después en Ajustes.
- **Inicio**: anillo de colores y un mensaje amable ("Vas muy bien", "Vas un poquito rápido", "Te pasaste") con **cuánto te queda** y **cuánto puedes gastar al día** hasta tu próximo pago.
  - **Sueldo fijo**: te queda = sueldo fijo + ingresos extra anotados − pagos fijos del periodo − ahorro − gastos.
  - **Ingreso variable**: te queda = ingresos anotados en el periodo − pagos fijos − ahorro − gastos, y avisa cuánto falta para cubrir los pagos fijos y el ahorro.
  - Los ingresos extra o variables solo cuentan cuando se anotan, para no gastar dinero que aún no llega.
  - Consejo del día: hasta qué fecha te alcanza a este ritmo, cuánto te sobraría o qué categoría pesa más.
  - Lista de pagos fijos del periodo para marcar ✓ cuando se pagan.
  - "¿En qué se va?": barras por categoría.
- **Periodos automáticos** según los días de pago (o, con ingreso variable, los días que eliges para empezar cada periodo): cada periodo va de ese día al día anterior al siguiente (31 = último día del mes).
- **Gastos e ingresos**: monto en Q (toca la Q para cambiar a $), descripción con autocompletado, categoría con emoji y forma de pago (efectivo/débito o una tarjeta).
- **Tarjetas de crédito** con día de corte y de pago propios: total por ciclo y recordatorio 3 días antes del corte y del pago.
- **Recordatorios**: pagos fijos por vencer o vencidos sin marcar, cortes y pagos de tarjetas, y día de pago.
- **Movimientos**: historial por periodo, con filtro de gastos o ingresos, y navegación a periodos anteriores.
- Funciona sin internet, se instala en la pantalla de inicio, respaldo `.json` y exportación a CSV.

## Instalar

**iPhone**
1. Abrir el enlace de la app en **Safari**.
2. Botón **Compartir** (cuadro con flecha hacia arriba) → **Agregar a pantalla de inicio** → **Agregar**.

**Android**
1. Abrir el enlace de la app en **Chrome**.
2. Menú **⋮** → **Instalar app** (o **Agregar a la pantalla principal**).

Después, abrirla siempre desde el ícono.

## Publicar

GitHub → **Settings → Pages → Deploy from a branch** → `main` / `(root)`.

## Nube (opcional, Firebase)

`sync.js` trae la configuración de Firebase vacía: así la app funciona solo en el teléfono y la sección de cuenta no aparece. Para activar el inicio de sesión con Google:

1. Crear un proyecto en Firebase, activar **Authentication → Google** y agregar el dominio de GitHub Pages en **Dominios autorizados**.
2. Crear **Firestore** en modo producción con estas reglas:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Registrar una app Web y copiar su `firebaseConfig` en `sync.js`.

Estructura: `users/{uid}` (ajustes) y `users/{uid}/movements/{id}` (gastos e ingresos).

## Archivos

| Archivo | Descripción |
| --- | --- |
| `index.html` | Pantallas: bienvenida, inicio, movimientos, tarjetas, ajustes y hojas de edición |
| `styles.css` | Estilos (modo claro/oscuro, adaptados a iPhone y Android) |
| `app.js` | Lógica: periodos de pago, presupuesto, consejos, recordatorios, tarjetas, almacenamiento |
| `sync.js` | Inicio de sesión con Google y sincronización con Firebase |
| `sw.js`, `manifest.webmanifest`, `icon*` | Instalación como app y uso sin conexión |
