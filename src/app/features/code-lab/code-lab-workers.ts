/** Worker sources, kept free of Angular so they can be tested in a plain browser. */
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';

// Each run gets a fresh namespace; only the frames of the player's own code
// are kept in tracebacks (Pyodide adds its internal ones on top).
export const PYTHON_WORKER = `
importScripts('${PYODIDE_BASE}pyodide.js');
// Library warnings (e.g. pandas deprecations) would land in stdout and fail tests.
const ready = loadPyodide({ indexURL: '${PYODIDE_BASE}' }).then((py) => {
  py.runPython("import warnings; warnings.simplefilter('ignore')");
  return py;
});
ready.then(() => postMessage({ type: 'ready' }), (e) => postMessage({ type: 'ready', error: String(e) }));
const cleanTrace = (text) => {
  const lines = String(text).split('\\n');
  const start = lines.findIndex((line) => line.includes('File "<exec>"'));
  return (start < 0 ? lines.slice(-2) : ['Traceback (most recent call last):', ...lines.slice(start)])
    .join('\\n').trim();
};
onmessage = async (event) => {
  const { id, code, stdin, setup, after } = event.data;
  const py = await ready;
  // numpy, pandas, scikit-learn... are downloaded on first import.
  try {
    await py.loadPackagesFromImports([setup, code, after].filter(Boolean).join('\\n'));
  } catch (e) {
    // An unknown module surfaces as ModuleNotFoundError when the code runs.
  }
  postMessage({ type: 'running', id });
  let output = '';
  py.setStdout({ batched: (line) => { output += line + '\\n'; } });
  py.setStderr({ batched: (line) => { output += line + '\\n'; } });
  const lines = (stdin || '').split('\\n');
  if (lines[lines.length - 1] === '') lines.pop();
  py.setStdin({ stdin: () => lines.shift() });
  const ns = py.globals.get('dict')();
  ns.set('__name__', '__main__');
  let error = null;
  try {
    if (setup) py.runPython(setup, { globals: ns });
    py.runPython(code, { globals: ns });
    if (after) py.runPython(after, { globals: ns });
  } catch (e) {
    error = cleanTrace(e && e.message ? e.message : e);
  } finally {
    ns.destroy();
  }
  postMessage({ type: 'result', id, output, error });
};
`;

export const SQL_WORKER = `
importScripts('${SQLJS_BASE}sql-wasm.js');
const ready = initSqlJs({ locateFile: (file) => '${SQLJS_BASE}' + file });
ready.then(() => postMessage({ type: 'ready' }), (e) => postMessage({ type: 'ready', error: String(e) }));
onmessage = async (event) => {
  const { id, code, setup } = event.data;
  const SQL = await ready;
  postMessage({ type: 'running', id });
  const db = new SQL.Database();
  let rows = [];
  let columns = [];
  let error = null;
  try {
    if (setup) db.run(setup);
    const results = db.exec(code);
    const last = results[results.length - 1];
    rows = last ? last.values : [];
    columns = last ? last.columns : [];
  } catch (e) {
    error = String(e && e.message ? e.message : e);
  } finally {
    db.close();
  }
  postMessage({ type: 'result', id, rows, columns, error });
};
`;
