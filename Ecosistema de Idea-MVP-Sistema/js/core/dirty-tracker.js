/**
 * DirtyTracker — Rastrea cambios sin guardar en formularios
 * ES Module vanilla, export class DirtyTracker
 */
export class DirtyTracker {
  constructor() {
    this.isDirty = false;
    this.dirtyFields = new Set();
    this.lastSaved = new Map(); // fieldId -> value
    this.listeners = new Set();
  }

  /**
   * Marca un campo como modificado (dirty)
   * @param {string} fieldId
   */
  markDirty(fieldId) {
    this.dirtyFields.add(fieldId);
    this.isDirty = true;
    this.notify();
  }

  /**
   * Marca un campo como limpio (validado/guardado)
   * @param {string} fieldId
   */
  markClean(fieldId) {
    this.dirtyFields.delete(fieldId);
    if (this.dirtyFields.size === 0) this.isDirty = false;
    this.notify();
  }

  /**
   * Guarda snapshot del valor original para comparación
   * @param {string} fieldId
   * @param {any} value
   */
  saveSnapshot(fieldId, value) {
    this.lastSaved.set(fieldId, value);
  }

  /**
   * Verifica si hay cambios sin guardar
   * @returns {boolean}
   */
  hasUnsavedChanges() {
    return this.isDirty;
  }

  /**
   * Obtiene lista de campos con cambios sin guardar
   * @returns {string[]}
   */
  getDirtyFields() {
    return Array.from(this.dirtyFields);
  }

  /**
   * Obtiene el número de campos dirty
   * @returns {number}
   */
  getDirtyCount() {
    return this.dirtyFields.size;
  }

  /**
   * Suscribe a cambios de estado dirty
   * @param {Function} fn - callback(isDirty, dirtyFields)
   * @returns {Function} unsubscribe
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Notifica a todos los suscriptores
   * @param {boolean} isDirty
   * @param {Set<string>} dirtyFields
   */
  notify(isDirty = this.isDirty, dirtyFields = this.dirtyFields) {
    this.listeners.forEach(fn => fn(isDirty, dirtyFields));
  }

  /**
   * Resetea completamente el tracker
   */
  reset() {
    this.isDirty = false;
    this.dirtyFields.clear();
    this.lastSaved.clear();
    this.notify();
  }

  /**
   * Verifica si un campo específico está dirty
   * @param {string} fieldId
   * @returns {boolean}
   */
  isFieldDirty(fieldId) {
    return this.dirtyFields.has(fieldId);
  }

  /**
   * Obtiene el valor guardado (snapshot) de un campo
   * @param {string} fieldId
   * @returns {any|null}
   */
  getSnapshot(fieldId) {
    return this.lastSaved.get(fieldId) ?? null;
  }
}

export default DirtyTracker;