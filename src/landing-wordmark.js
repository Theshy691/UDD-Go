import './landing-wordmark.css';

const glyphs = {
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
};

export function landingWordmark() {
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
  </section>`;
}
