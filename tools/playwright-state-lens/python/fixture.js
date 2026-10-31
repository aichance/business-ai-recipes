async () => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('draft', JSON.stringify({ amount: 1234.567, flag: false }));
  sessionStorage.setItem('session', JSON.stringify({ tab: 'a' }));
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('lens-python-test', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('docs');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('docs', 'readwrite');
      tx.objectStore('docs').put({ at: new Date('2026-10-31T00:00:00Z'), unset: undefined, flag: true }, 'one');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
