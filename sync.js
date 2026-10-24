// Sincronización con la nube: inicio de sesión con Google y datos guardados en Firestore.
//
// Estructura en Firestore (las reglas solo permiten a cada usuario leer/escribir lo suyo):
//   users/{uid}                     → { settings, updatedAt }
//   users/{uid}/movements/{id}      → un gasto o ingreso
//
// La configuración no es secreta: identifica el proyecto de Firebase y está hecha
// para ir en el código de la app. La seguridad la dan las reglas de Firestore.
// Mientras esté vacía, la app funciona solo en el teléfono y oculta la sección de cuenta.

const firebaseConfig = {
  apiKey: 'AIzaSyBAcgBEDTXGHTJrp1Mh_kii3krVxTWr7Fw',
  authDomain: 'mi-presupuesto-e151a.firebaseapp.com',
  projectId: 'mi-presupuesto-e151a',
  storageBucket: 'mi-presupuesto-e151a.firebasestorage.app',
  messagingSenderId: '1002858396254',
  appId: '1:1002858396254:web:a1095a0f52aaac657e52cf',
};

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
// Cuenta cuyos datos ya están en este teléfono (para no volver a mezclar al abrir la app).
const OWNER_KEY = 'mi-presupuesto.owner';
const App = window.App;

if (!firebaseConfig.apiKey) {
  App.setCloudDisabled();
} else {
  start().catch(err => { console.error(err); App.setCloudUnavailable(); });
}

async function start() {
  const [{ initializeApp }, authSdk, fsSdk] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } = authSdk;
  const {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    doc, collection, getDoc, getDocs, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp,
  } = fsSdk;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Caché local persistente: funciona sin internet y sube los cambios al reconectar.
  const fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  let uid = null;
  let unsubscribers = [];
  let retryTimer = null;

  const userRef = () => doc(fs, 'users', uid);
  const movesRef = () => collection(fs, 'users', uid, 'movements');
  const moveRef = id => doc(fs, 'users', uid, 'movements', id);

  /** Ajustes que se comparten entre teléfonos (sin preferencias del propio teléfono). */
  const remoteSettings = s => {
    const { lastMethod, ...rest } = s;
    return JSON.parse(JSON.stringify(rest));
  };

  /** Firestore no acepta `undefined`; guarda solo los campos conocidos. */
  const cleanMove = m => ({
    id: m.id,
    type: m.type === 'ingreso' ? 'ingreso' : 'gasto',
    amount: m.amount,
    currency: m.currency === 'USD' ? 'USD' : 'GTQ',
    rate: m.rate ?? null,
    desc: m.desc || '',
    category: m.category ?? null,
    method: m.method ?? null,
    date: m.date,
    createdAt: m.createdAt ?? Date.now(),
  });

  const report = err => {
    console.error(err);
    App.setSyncStatus(navigator.onLine ? 'error' : 'offline');
  };

  /** Escrituras en lotes (Firestore permite hasta 500 por lote). */
  async function commit(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(fs);
      ops.slice(i, i + 400).forEach(op => op(batch));
      await batch.commit();
    }
  }

  const settingsDoc = s => ({ settings: remoteSettings(s), updatedAt: serverTimestamp() });

  function putMove(m) {
    if (uid && m) setDoc(moveRef(m.id), cleanMove(m)).catch(report);
  }
  function removeMove(id) {
    if (uid) deleteDoc(moveRef(id)).catch(report);
  }
  function putSettings() {
    if (uid) setDoc(userRef(), settingsDoc(App.db.settings), { merge: true }).catch(report);
  }

  /** Tras restaurar un respaldo: la nube queda igual que este teléfono. */
  async function replaceAll() {
    if (!uid) return;
    try {
      const local = App.db;
      const localIds = new Set(local.movements.map(m => m.id));
      const remote = await getDocs(movesRef());
      const ops = [b => b.set(userRef(), settingsDoc(local.settings))];
      remote.docs.filter(d => !localIds.has(d.id)).forEach(d => ops.push(b => b.delete(d.ref)));
      local.movements.forEach(m => ops.push(b => b.set(moveRef(m.id), cleanMove(m))));
      await commit(ops);
    } catch (err) {
      report(err);
    }
  }

  async function signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        return signInWithRedirect(auth, provider);
      }
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error(err);
        App.toast('No se pudo iniciar sesión. Intenta de nuevo.');
      }
    }
  }

  async function doSignOut() {
    const ok = await App.ask({
      title: '¿Cerrar sesión?',
      text: 'Tus datos quedan guardados en tu cuenta de Google. En este teléfono se ocultarán hasta que vuelvas a iniciar sesión.',
      ok: 'Cerrar sesión',
    });
    if (!ok) return;
    await signOut(auth);
    localStorage.removeItem(OWNER_KEY);
    App.resetLocal();
    App.toast('Sesión cerrada');
  }

  /**
   * Primera vez de esta cuenta en este teléfono: sube lo que ya había aquí sin
   * borrar nada de la nube (si la cuenta es nueva, sube todo).
   */
  async function firstSync() {
    if (localStorage.getItem(OWNER_KEY) === uid) return;

    const local = App.db;
    const [userSnap, remote] = await Promise.all([getDoc(userRef()), getDocs(movesRef())]);
    const remoteIds = new Set(remote.docs.map(d => d.id));
    const toUpload = local.movements.filter(m => !remoteIds.has(m.id));
    const ops = [];

    const remoteS = userSnap.exists() ? userSnap.data().settings : null;
    if (!remoteS || (!remoteS.onboarded && local.settings.onboarded)) {
      ops.push(b => b.set(userRef(), settingsDoc(local.settings), { merge: true }));
    } else {
      // Si se suben gastos con una tarjeta que la cuenta no tiene, agrega esa tarjeta.
      const remoteCards = remoteS.cards || [];
      const missing = local.settings.cards.filter(c =>
        toUpload.some(m => m.method === c.id) && !remoteCards.some(r => r.id === c.id));
      if (missing.length) {
        ops.push(b => b.set(userRef(), { settings: { ...remoteS, cards: [...remoteCards, ...missing] }, updatedAt: serverTimestamp() }, { merge: true }));
      }
    }
    toUpload.forEach(m => ops.push(b => b.set(moveRef(m.id), cleanMove(m))));

    await commit(ops);
    localStorage.setItem(OWNER_KEY, uid);
  }

  /** Sube los cambios hechos mientras no había sesión activa. */
  function flushPending() {
    for (const op of App.takePending()) {
      if (op.type === 'put') putMove(App.db.movements.find(m => m.id === op.id));
      else if (op.type === 'remove') removeMove(op.id);
      else if (op.type === 'settings') putSettings();
      else if (op.type === 'all') replaceAll();
    }
  }

  function listen() {
    unsubscribers.push(onSnapshot(userRef(), snap => {
      const settings = snap.exists() ? snap.data().settings : null;
      if (settings) App.applyRemote({ settings });
    }, report));

    let first = true;
    unsubscribers.push(onSnapshot(movesRef(), { includeMetadataChanges: true }, snap => {
      if (first || snap.docChanges().length) {
        first = false;
        App.applyRemote({ movements: snap.docs.map(d => d.data()) });
      }
      const { hasPendingWrites, fromCache } = snap.metadata;
      App.setSyncStatus(hasPendingWrites ? (navigator.onLine ? 'pending' : 'offline') : fromCache && !navigator.onLine ? 'offline' : 'ok');
    }, report));
  }

  /** Conecta la cuenta: primero sube lo local y solo después escucha la nube. */
  async function connect(user) {
    try {
      await firstSync();
    } catch (err) {
      // Sin esto, la nube (vacía o incompleta) podría reemplazar datos que solo están aquí.
      report(err);
      retryTimer = setTimeout(() => uid === user.uid && connect(user), 15000);
      return;
    }
    flushPending();
    App.setActive(true);
    listen();
  }

  onAuthStateChanged(auth, user => {
    clearTimeout(retryTimer);
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
    App.setActive(false);
    uid = user ? user.uid : null;
    if (!user) { App.setAccount(null); return; }
    App.setAccount({ name: user.displayName, email: user.email, photo: user.photoURL, status: 'syncing' });
    connect(user);
  });

  window.addEventListener('offline', () => uid && App.setSyncStatus('offline'));

  App.setCloud({ signIn, signOut: doSignOut, put: putMove, remove: removeMove, putSettings, replaceAll });
}
