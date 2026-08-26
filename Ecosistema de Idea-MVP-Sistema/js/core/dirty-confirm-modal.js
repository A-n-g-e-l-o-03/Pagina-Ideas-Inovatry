/**
 * DirtyConfirmModal — Modal de confirmación para cambios sin guardar
 * ES Module vanilla, export class DirtyConfirmModal
 */
export class DirtyConfirmModal {
  constructor() {
    this.modal = this.createModal();
    document.body.appendChild(this.modal);
    this.resolve = null;
  }

  /**
   * Crea el elemento modal en el DOM
   * @returns {HTMLElement}
   */
  createModal() {
    const modal = document.createElement('div');
    modal.className = 'dirty-confirm-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="dirty-modal-overlay"></div>
      <div class="dirty-modal-content" role="dialog" aria-modal="true" aria-labelledby="dirtyModalTitle">
        <h3 id="dirtyModalTitle">¿Tienes cambios sin guardar?</h3>
        <p>Hay <strong id="dirtyCount">0</strong> campos con cambios sin guardar. Si sales ahora, se perderán.</p>
        <div class="dirty-modal-actions">
          <button type="button" class="btn-secondary" id="dirtyCancel">Quedarme</button>
          <button type="button" class="btn-danger" id="dirtyConfirm">Salir de todos modos</button>
        </div>
      </div>
    `;
    return modal;
  }

  /**
   * Muestra el modal con el conteo de campos dirty
   * @param {number} dirtyCount
   * @returns {Promise<boolean>} true = confirmar salida, false = cancelar
   */
  show(dirtyCount) {
    this.modal.querySelector('#dirtyCount').textContent = dirtyCount;
    this.modal.hidden = false;
    
    // Focus en botón cancelar (opción segura por defecto)
    setTimeout(() => {
      const cancelBtn = this.modal.querySelector('#dirtyCancel');
      if (cancelBtn) cancelBtn.focus();
    }, 50);

    return new Promise((resolve) => {
      this.resolve = resolve;
      
      const cancelBtn = this.modal.querySelector('#dirtyCancel');
      const confirmBtn = this.modal.querySelector('#dirtyConfirm');
      const overlay = this.modal.querySelector('.dirty-modal-overlay');

      const cleanup = () => {
        cancelBtn.onclick = null;
        confirmBtn.onclick = null;
        overlay.onclick = null;
      };

      cancelBtn.onclick = () => {
        cleanup();
        this.hide();
        resolve(false);
      };

      confirmBtn.onclick = () => {
        cleanup();
        this.hide();
        resolve(true);
      };

      overlay.onclick = () => {
        cleanup();
        this.hide();
        resolve(false);
      };

      // ESC para cancelar
      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          document.removeEventListener('keydown', handleKeydown);
          this.hide();
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleKeydown);
    });
  }

  /**
   * Oculta el modal
   */
  hide() {
    this.modal.hidden = true;
  }

  /**
   * Destruye el modal y limpia event listeners
   */
  destroy() {
    this.modal.remove();
  }
}

export default DirtyConfirmModal;