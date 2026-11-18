import './landing-wordmark.css';

const glyphs = {
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
};

export function landingWordmark(icon) {
  return `<section class="udd-wordmark udd-landing-width" aria-label="UDD Go wordmark">
    <div class="udd-wordmark-visual" aria-hidden="true">
      ${['UDD', 'GO']
        .map(
          (word) => `<div class="udd-wordmark-word" data-word="${word}">
            ${[...word]
              .map(
                (letter) => `<span class="udd-wordmark-letter">
                  ${[...glyphs[letter].replaceAll('|', '')]
                    .map((pixel) => `<span${pixel === '#' ? ' data-lit' : ''}></span>`)
                    .join('')}
                </span>`
              )
              .join('')}
          </div>`
        )
        .join('')}
    </div>
    <button type="button" class="udd-wordmark-replay" aria-label="Replay UDD Go animation">
      ${icon('RefreshCw')} Replay
    </button>
  </section>`;
}

export function mountWordmark(element) {
  const replay = element.querySelector('button');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.intersectionRatio >= 0.35)) play();
    },
    { threshold: 0.35 }
  );

  function play() {
    observer.disconnect();
    if (reducedMotion.matches) return;
    if (element.classList.contains('is-playing')) {
      element.classList.remove('is-playing');
      void element.offsetWidth;
    }
    element.classList.add('is-playing');
  }

  observer.observe(element);
  replay.addEventListener('click', play);

  return () => {
    observer.disconnect();
    replay.removeEventListener('click', play);
  };
}
