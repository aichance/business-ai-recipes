import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import useLocalStorageState from 'measured-hook';

const h = React.createElement;
const records = {
  todos: [{ id: 'task-a', title: 'Synthetic saved task', done: false }],
  prefs: { theme: 'dark', columns: ['title', 'done'], revision: 7 },
};
const changedTodos = [{ id: 'task-a', title: 'Updated in peer', done: true }];
const keys = { todos: 'acl-clear:todos', prefs: 'acl-clear:prefs' };

window.__nativeEvents = [];
window.addEventListener('storage', (event) => {
  window.__nativeEvents.push({
    key: event.key,
    oldValue: event.oldValue,
    newValue: event.newValue,
    isTrusted: event.isTrusted,
    area: event.storageArea === localStorage ? 'local' :
      event.storageArea === sessionStorage ? 'session' : 'other',
  });
});

function button(name, onClick) { return h('button', { onClick }, name); }

function SessionPeer() {
  useEffect(() => { window.__consumerMounted = true; }, []);
  return h('div', null,
    button('Seed session storage', () => sessionStorage.setItem('session-only', 'synthetic')),
    button('Clear session storage', () => sessionStorage.clear()));
}

function Consumer() {
  const [todos] = useLocalStorageState(keys.todos);
  const [prefs] = useLocalStorageState(keys.prefs);
  useEffect(() => { window.__consumerMounted = true; }, []);
  return h('main', null,
    h('h1', null, 'Native storage event lab'),
    h('p', null, 'Real browser events; unchanged React hook; synthetic records.'),
    h('pre', { 'data-testid': 'hook-state' }, JSON.stringify({ todos: todos ?? null, prefs: prefs ?? null })),
    button('Seed local records', () => {
      localStorage.setItem(keys.todos, JSON.stringify(records.todos));
      localStorage.setItem(keys.prefs, JSON.stringify(records.prefs));
    }),
    button('Update local todos', () => localStorage.setItem(keys.todos, JSON.stringify(changedTodos))),
    button('Clear local storage', () => localStorage.clear()),
    h('iframe', { title: 'Session peer', src: '/session-peer', style: { display: 'block', marginTop: 20, width: 650, height: 100 } }));
}

createRoot(document.getElementById('root')).render(
  h(location.pathname === '/session-peer' ? SessionPeer : Consumer));
