import './pagination.css';
import { escapeHtml as esc } from './domain.js';

export function createPagination() {
  const lists = new Map();
  const pages = new Map();

  function slice(id, items, size, initialPage = 1) {
    const last = Math.max(1, Math.ceil(items.length / size));
    const number = Math.min(last, Math.max(1, pages.get(id) ?? initialPage));
    const start = (number - 1) * size;
    const end = Math.min(start + size, items.length);
    pages.set(id, number);
    return {
      number,
      last,
      items: items.slice(start, end),
      summary: `${start + 1}–${end} of ${items.length} · Page ${number} of ${last}`,
    };
  }

  return {
    list(id, items, renderItems, { label, size = 10, initialPage } = {}) {
      const page = slice(id, items, size, initialPage);
      if (page.last === 1) return renderItems(page.items);
      lists.set(id, { items, renderItems, size });
      return `<div class="paged-list" data-paged-list="${esc(id)}">
        <div data-paged-rows>${renderItems(page.items)}</div>
        <nav class="pagination" aria-label="${esc(label)} pagination">
          <span class="pagination-range" role="status">${page.summary}</span>
          <div class="pagination-buttons">
            <button type="button" class="button" data-page-step="-1" ${page.number === 1 ? 'disabled' : ''}>Previous</button>
            <button type="button" class="button" data-page-step="1" ${page.number === page.last ? 'disabled' : ''}>Next</button>
          </div>
        </nav>
      </div>`;
    },
    turn(button) {
      const root = button.closest('[data-paged-list]');
      const id = root.dataset.pagedList;
      const list = lists.get(id);
      if (!list || button.disabled) return;
      pages.set(id, pages.get(id) + Number(button.dataset.pageStep));
      const page = slice(id, list.items, list.size);
      root.querySelector('[data-paged-rows]').innerHTML = list.renderItems(page.items);
      root.querySelector('.pagination-range').textContent = page.summary;
      const previous = root.querySelector('[data-page-step="-1"]');
      const next = root.querySelector('[data-page-step="1"]');
      previous.disabled = page.number === 1;
      next.disabled = page.number === page.last;
      (button.disabled ? (button === next ? previous : next) : button).focus();
    },
    current(id) {
      return pages.get(id) ?? 1;
    },
    beginRender() {
      lists.clear();
    },
    reset(id) {
      if (id) pages.delete(id);
      else {
        lists.clear();
        pages.clear();
      }
    },
  };
}
